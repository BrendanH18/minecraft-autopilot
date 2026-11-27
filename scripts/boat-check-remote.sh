#!/usr/bin/env bash
# Runs inside the Boat sandbox for scripts/boat-check.sh; don't run it directly.
#
#   boat-check-remote.sh <checkout> <check directories to keep> <base64 command>
#                        <base64 NUL-separated tracked paths that are executable, or ->
#
# Prepares the freshly pushed checkout and runs the command in it. Everything that
# outlives one check lives in /home/user/mca-cache, which the warm snapshot keeps:
# Gradle's user home (wrapper, dependencies, Loom's Minecraft files and the vanilla
# server jar), the pinned Baritone and Fabric API jars, the npm cache, and
# node_modules for the current package-lock.json. The checkout links to them.
set -euo pipefail
dir=$1 keep=$2 encoded=$3 modes=${4:--}

# Lead a process group of our own, so an interrupted scripts/boat-check.sh can stop
# the whole check (test server, bot, Gradle) the way Ctrl+C would.
if [ -z "${MCA_BOAT_GROUP:-}" ] && command -v setsid >/dev/null; then
    MCA_BOAT_GROUP=1 exec setsid --wait bash "$0" "$@"
fi
cd "$dir"
mkdir -p .runtime
ps -o pgid= -p $$ | tr -d ' ' > .runtime/boat-check.pgid
cmd=$(printf '%s' "$encoded" | base64 -d)
cache=$HOME/mca-cache
say() { echo "boat-check: $*" >&2; }

# Keep only the newest check directories (their names start with a UTC timestamp).
find "$HOME/checks" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r \
    | tail -n +$((keep + 1)) | while read -r old; do
        [ "$HOME/checks/$old" = "$dir" ] || rm -rf "${HOME:?}/checks/$old" "$HOME/checks/$old.bundle"
    done

# Rebuild the Git metadata `boat push` leaves out, from the bundle boat-check.sh sent.
if [ -f "$dir.bundle" ] && [ ! -e .git ]; then
    git -c init.defaultBranch=check init -q
    git fetch -q "$dir.bundle" HEAD
    git reset -q FETCH_HEAD
    rm -f "$dir.bundle"
    # Give tracked files the execute bits they have in the source tree, which
    # boat-check.sh sent, so a mode change shows up here as it does there.
    declare -A executable=()
    if [ "$modes" != - ]; then
        while IFS= read -r -d '' path; do executable[$path]=1; done < <(printf '%s' "$modes" | base64 -d)
    fi
    git ls-files -z | while IFS= read -r -d '' path; do
        [ -f "$path" ] || continue
        if [ -n "${executable[$path]:-}" ]; then chmod +x "$path"; else chmod -x "$path"; fi
    done
    # Here the cache directories are symlinks, which .gitignore's "dir/" patterns miss.
    printf '%s\n' /.gradle-user /.deps /.npm-cache >> .git/info/exclude
fi

# Node 22.12+ and a full Java 21 JDK (java, javac, jar).
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' \
    || { say "needs Node.js 22.12+, found $(node --version 2>/dev/null || echo none)"; exit 2; }
jdk21() {
    local home
    for home in "${JAVA_HOME:-}" /usr/lib/jvm/*; do
        [ -n "$home" ] && [ -x "$home/bin/javac" ] && [ -x "$home/bin/jar" ] || continue
        "$home/bin/javac" -version 2>&1 | grep -q '^javac 21\.' && { echo "$home"; return 0; }
    done
    return 1
}
if ! java_home=$(jdk21); then
    say "installing OpenJDK 21"
    # The image has a third-party package source whose release info changes.
    sudo apt-get update -qq --allow-releaseinfo-change >/dev/null || true
    sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 apt-get install -y -qq openjdk-21-jdk-headless >/dev/null
    java_home=$(jdk21) || { say "OpenJDK 21 didn't install"; exit 2; }
fi
export JAVA_HOME=$java_home PATH=$java_home/bin:$PATH

# Shared caches, linked into the checkout where the build scripts expect them.
mkdir -p "$cache/gradle-user" "$cache/deps" "$cache/npm-cache" "$cache/node_modules"
for link in .gradle-user:gradle-user .deps:deps .npm-cache:npm-cache; do
    rm -rf "${link%%:*}"
    ln -s "$cache/${link#*:}" "${link%%:*}"
done

# node_modules, keyed by package.json and package-lock.json. Each checkout gets its own
# copy, so a check that edits a dependency can't change the cache. A new cache entry
# is copied aside first and renamed into place, so an interrupted copy is never used.
lock_key=$(cat package.json package-lock.json | sha256sum | cut -c1-16)
if [ -d "$cache/node_modules/$lock_key/node_modules" ]; then
    cp -a --reflink=auto "$cache/node_modules/$lock_key/node_modules" node_modules
else
    say "package.json or package-lock.json changed, or no node_modules is cached; running npm ci"
    npm ci --no-audit --no-fund --prefer-offline
    find "$cache/node_modules" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    mkdir -p "$cache/node_modules/.incoming/$lock_key"
    cp -a --reflink=auto node_modules "$cache/node_modules/.incoming/$lock_key/"
    mv "$cache/node_modules/.incoming/$lock_key" "$cache/node_modules/$lock_key"
    rm -rf "$cache/node_modules/.incoming"
fi

# The fresh-clone setup from docs/DEVELOPMENT.md, with downloads, whenever the files
# that pin the mod's dependencies change (CI's mod cache key), or a pinned jar or the
# server jar the bot acceptance runs is missing or fails verification. A warm sandbox
# skips it.
setup_key=$(cat mod/build.gradle mod/settings.gradle mod/gradle.properties \
    mod/gradle/wrapper/gradle-wrapper.properties scripts/setup-mod.js scripts/package-mod.js \
    | sha256sum | cut -c1-16)
server_jar=.gradle-user/caches/fabric-loom/1.21.1/minecraft-server.jar
# setup-mod.js verifies the pinned Baritone jar offline; package-mod.js checks the
# Fabric API jar's hash whenever it runs.
if [ "$(cat "$cache/setup-key" 2>/dev/null || true)" != "$setup_key" ] || [ ! -f "$server_jar" ] \
    || ! compgen -G '.deps/fabric-api-*.jar' >/dev/null || ! node scripts/setup-mod.js >/dev/null 2>&1; then
    say "the mod's pinned dependencies changed or aren't cached; running the fresh-clone setup with downloads"
    npm run setup:mod -- --allow-downloads
    node scripts/gradle.js build --allow-downloads
    node scripts/package-mod.js --allow-downloads
    echo "$setup_key" > "$cache/setup-key"
fi

# The Fabric development-client acceptance runs headless: Xvfb with Mesa's llvmpipe
# software OpenGL (4.5 core), and the client's assets cached in Gradle's user home.
run=(bash -c "$cmd")
# A dry run starts nothing, so it needs neither.
if [[ $cmd =~ (acceptance:fabric([^-]|$)|--backend[=\ ]fabric) && ! $cmd =~ --dry-run ]]; then
    # xdotool presses keys in the client window for the takeover scenarios (--takeover).
    if ! command -v xvfb-run >/dev/null || ! command -v xdotool >/dev/null; then
        say "installing Xvfb, Mesa and xdotool for the headless Fabric client"
        sudo apt-get update -qq --allow-releaseinfo-change >/dev/null || true
        sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 apt-get install -y -qq --no-install-recommends \
            xvfb xauth libgl1-mesa-dri libgl1 libglx-mesa0 libegl1 xdotool >/dev/null
    fi
    # Loom checks every object and fetches only what is missing, so an interrupted download heals here.
    say "checking the Minecraft client asset cache"
    node scripts/gradle.js downloadAssets --allow-downloads >/dev/null
    # --packaged runs Fabric Loader in production mode, which also needs the intermediary mappings jar.
    if [[ $cmd =~ --packaged ]]; then
        say "checking the libraries the production client needs"
        node scripts/gradle.js prepareProductionClient --allow-downloads >/dev/null
    fi
    run=(xvfb-run -a -s "-screen 0 854x480x24 -nolisten tcp" "${run[@]}")
fi

# Real-model pre-checks (owner decision, 2026-11-26): for a live run with --model, a
# pinned Ollama serves that model on the sandbox's CPU at the runner's default URL.
# MCA_BOAT_CHECK marks the results as a pre-check, which acceptance review-bot rejects.
# The CPU build and the pulled models stay in ~/ollama between checks; --save leaves
# them out of the warm snapshot.
export MCA_BOAT_CHECK=1
model_flag='--model[= ]+([A-Za-z0-9._:/-]+)'
model=""
# Set up even when the command also has a dry run: a chained live run still needs the model.
[[ $cmd =~ $model_flag ]] && model=${BASH_REMATCH[1]}
if [ -n "$model" ]; then
    ollama_version=0.40.17
    case "$(uname -m)" in
        x86_64) ollama_arch=amd64 ollama_sha256=1df9d6228bac5a22e420b242708c0d10e5b886db97bab99d446a41760f4e79af ;;
        aarch64) ollama_arch=arm64 ollama_sha256=0ec632480057cef6300459d1fa7dbbb3fc188b9a7d56cd0b0a72d05927d90ecc ;;
        *) say "no Ollama build for $(uname -m)"; exit 2 ;;
    esac
    ollama_home=$HOME/ollama
    ollama=$ollama_home/$ollama_version/bin/ollama
    if [ ! -x "$ollama" ]; then
        say "installing Ollama $ollama_version (CPU libraries only) for the real-model pre-check"
        command -v zstd >/dev/null || {
            sudo apt-get update -qq --allow-releaseinfo-change >/dev/null || true
            sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 apt-get install -y -qq zstd >/dev/null
        }
        # One version at a time; the models stay. A half-finished install is never used.
        mkdir -p "$ollama_home"
        find "$ollama_home" -mindepth 1 -maxdepth 1 ! -name models -exec rm -rf {} +
        mkdir "$ollama_home/incoming"
        curl -fsSL --retry 3 -o "$ollama_home/incoming.tar.zst" \
            "https://github.com/ollama/ollama/releases/download/v$ollama_version/ollama-linux-$ollama_arch.tar.zst"
        echo "$ollama_sha256  $ollama_home/incoming.tar.zst" | sha256sum -c --quiet - \
            || { say "the Ollama download doesn't match its pinned SHA-256"; exit 2; }
        # The GPU libraries are most of the archive and useless here.
        tar --zstd -xf "$ollama_home/incoming.tar.zst" -C "$ollama_home/incoming" \
            --exclude='lib/ollama/cuda_*' --exclude='lib/ollama/rocm*' --exclude='lib/ollama/vulkan*'
        rm -f "$ollama_home/incoming.tar.zst"
        mv "$ollama_home/incoming" "$ollama_home/$ollama_version"
    fi
    mkdir -p .runtime/live-acceptance
    # Loaded for the whole run, so a slow action between decisions never unloads it.
    OLLAMA_HOST=127.0.0.1:11434 OLLAMA_MODELS=$ollama_home/models OLLAMA_KEEP_ALIVE=-1 \
        "$ollama" serve >.runtime/live-acceptance/ollama.log 2>&1 &
    ollama_pid=$!
    trap 'kill "$ollama_pid" 2>/dev/null || true' EXIT
    for _ in $(seq 60); do
        curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break
        kill -0 "$ollama_pid" 2>/dev/null || { say "ollama serve exited; see .runtime/live-acceptance/ollama.log"; exit 2; }
        sleep 1
    done
    say "pulling $model (kept in ~/ollama/models)"
    OLLAMA_HOST=127.0.0.1:11434 "$ollama" pull "$model" >.runtime/live-acceptance/ollama-pull.log 2>&1 \
        || { tail -n 5 .runtime/live-acceptance/ollama-pull.log >&2; say "couldn't pull $model"; exit 2; }
    say "Ollama $ollama_version serving $model on the CPU; the results are a pre-check, never evidence"
fi

say "$(git rev-parse --short HEAD 2>/dev/null || echo "no commit")$( [ -z "$(git status --porcelain 2>/dev/null)" ] || echo " (modified)"), Node $(node --version), $(javac -version 2>&1), $(nproc) vCPUs"
"${run[@]}"
