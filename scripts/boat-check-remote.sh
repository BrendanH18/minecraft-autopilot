#!/usr/bin/env bash
# Runs inside the Boat sandbox for scripts/boat-check.sh; don't run it directly.
#
#   boat-check-remote.sh <checkout> <check directories to keep> <base64 command>
#
# Prepares the freshly pushed checkout and runs the command in it. Everything that
# outlives one check lives in /home/user/mca-cache, which the warm snapshot keeps:
# Gradle's user home (wrapper, dependencies, Loom's Minecraft files and the vanilla
# server jar), the pinned Baritone and Fabric API jars, the npm cache, and
# node_modules for the current package-lock.json. The checkout links to them.
set -euo pipefail
dir=$1 keep=$2 encoded=$3

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
    # Restore the executable bits Git records (mod/gradlew, these scripts).
    git ls-files -s -z | while IFS= read -r -d '' entry; do
        if [[ $entry == 100755* ]]; then chmod +x "${entry#*$'\t'}"; fi
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

# node_modules, keyed by package-lock.json and hard-linked into each checkout.
lock_key=$(sha256sum package-lock.json | cut -c1-16)
if [ -d "$cache/node_modules/$lock_key/node_modules" ]; then
    cp -al "$cache/node_modules/$lock_key/node_modules" node_modules
else
    say "package-lock.json changed or no node_modules is cached; running npm ci"
    npm ci --no-audit --no-fund --prefer-offline
    find "$cache/node_modules" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    mkdir -p "$cache/node_modules/$lock_key"
    cp -al node_modules "$cache/node_modules/$lock_key/"
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

say "$(git rev-parse --short HEAD 2>/dev/null || echo "no commit")$( [ -z "$(git status --porcelain 2>/dev/null)" ] || echo " (modified)"), Node $(node --version), $(javac -version 2>&1), $(nproc) vCPUs"
bash -c "$cmd"
