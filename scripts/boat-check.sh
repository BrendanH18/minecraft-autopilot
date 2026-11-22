#!/usr/bin/env bash
# Run checks in this worktree's own long-lived Boat sandbox instead of this computer.
#
#   scripts/boat-check.sh                  the hand-off checks from CONTRIBUTING.md
#   scripts/boat-check.sh -- CMD...        run CMD in a fresh copy of the working tree instead
#   scripts/boat-check.sh --fetch PATH -- CMD...
#                                          then copy PATH (relative to the checkout, repeatable)
#                                          back into .runtime/boat-check/<check>/ here
#   scripts/boat-check.sh --save [-- CMD]  after a passing run, save the sandbox (caches and
#                                          toolchain, no checkouts) as the warm snapshot
#   scripts/boat-check.sh --status         show this worktree's sandbox
#   scripts/boat-check.sh --done           delete this worktree's sandbox; run it when the work ends
#
# The first check creates the sandbox from the saved snapshot minecraft-autopilot-warm
# (cold if there is none) and records its id in .runtime/boat-check/. Later checks reuse
# it: each one pushes the working tree into a new directory and runs there with no time
# limit. The sandbox is stopped as soon as the check ends, so it bills nothing between
# checks; the next check resumes it. A resume within about 10 minutes of the stop
# usually takes back Boat's kept machine, which is no start. While a check runs, the
# sandbox's auto-stop is 30 minutes, renewed every 10 minutes only while this script is
# alive, so a killed check leaves it up at most 30 minutes. Overrides: MCA_BOAT_IDLE
# (seconds to keep the sandbox up after a check instead of stopping it, default 0),
# MCA_BOAT_KEY (a second agent sharing this checkout gets its own sandbox),
# MCA_BOAT_SNAPSHOT, MCA_BOAT_TYPE (default "default"), MCA_BOAT_MAX_CHECK (seconds after
# which the script stops renewing the auto-stop, default 7200) and MCA_BOAT_KEEP_CHECKS
# (check directories kept in the sandbox, default 3). Starts beyond the plan's included
# ones cost money; the script refuses them unless MCA_BOAT_PAID_STARTS=1.
# See docs/DEVELOPMENT.md#boat-checks.
main() {
set -euo pipefail
export BOAT_NO_UPDATE=1
snapshot=${MCA_BOAT_SNAPSHOT:-minecraft-autopilot-warm}
type=${MCA_BOAT_TYPE:-default}
idle=${MCA_BOAT_IDLE:-0}
max_check=${MCA_BOAT_MAX_CHECK:-7200}
keep_checks=${MCA_BOAT_KEEP_CHECKS:-3}
key=${MCA_BOAT_KEY:-default}
action=check cmd="" save=0 fetch=()
while [ $# -gt 0 ]; do
    case "$1" in
        --save) save=1 ;;
        --fetch)
            [ $# -gt 1 ] || die 2 "--fetch needs a path"
            fetch+=("$2"); shift ;;
        --status) action=status ;;
        --done) action=finish ;;
        --) shift
            [ $# -gt 0 ] || die 2 "-- needs a command"
            if [ $# -eq 1 ]; then cmd=$1; else cmd=$(printf '%q ' "$@"); fi
            [ -n "$cmd" ] || die 2 "-- needs a command"
            break ;;
        -h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
        *) die 2 "unknown option $1 (try --help)" ;;
    esac
    shift
done
for tool in boat jq git base64; do
    command -v "$tool" >/dev/null || die 2 "$tool is not installed"
done
[[ $idle =~ ^(0|[1-9][0-9]*)$ ]] || die 2 "MCA_BOAT_IDLE must be a whole number of seconds (0 stops the sandbox when a check ends)"
for n in "$max_check" "$keep_checks"; do
    [[ $n =~ ^[1-9][0-9]*$ ]] || die 2 "MCA_BOAT_MAX_CHECK and MCA_BOAT_KEEP_CHECKS must be positive whole numbers"
done
# Auto-stop while a check runs, renewed every keepalive_every seconds while this script
# lives (owner decision, 2026-11-22). A hard-killed check stops renewing it, so Boat
# stops the sandbox within busy_ttl seconds.
busy_ttl=1800 keepalive_every=600
[[ $key =~ ^[A-Za-z0-9_-]{1,40}$ ]] || die 2 "MCA_BOAT_KEY may only use letters, digits, - and _ (at most 40)"
if [ -z "$cmd" ]; then
    # The hand-off checks, as CONTRIBUTING.md lists them.
    cmd="npm run lint && npm run lint:mod && npm run check && npm test && npm start -- demo --smoke && npm run build:mod && npm run verify:mod"
elif [[ $cmd =~ (dev:mod|runClient|--model|--ollama) ]]; then
    die 2 "the Minecraft client and Ollama runs stay on the Mac (AGENTS.md); Boat has no GPU or display for them"
fi

root=$(git rev-parse --show-toplevel)
cd "$root"
local_dir=$root/.runtime/boat-check
state=$local_dir/sandbox-$key
lock=$state.lock
mkdir -p "$local_dir"
id=$(cat "$state" 2>/dev/null || true)

if [ "$action" = status ]; then
    [ -n "$id" ] || { echo "boat-check: this worktree has no sandbox (key $key)"; exit 0; }
    boat info "$id" --json 2>/dev/null | jq -r --arg key "$key" \
        '.sandbox // . | "boat-check: sandbox \(.id) (key \($key)): \(.state), \(.type), auto-stop timer \(.ttlSeconds // "off") s"' \
        || echo "boat-check: sandbox $id (key $key) isn't found; the next check replaces it"
    exit 0
fi

have_lock=0
take_lock
id=$(cat "$state" 2>/dev/null || true)   # again, now that no other run can change it
armed=0 extended=0 keepalive_pid="" remote_dir="" bundle="" new_log="" exec_log="" remote_running=1
trap cleanup EXIT
trap 'exit 130' INT TERM

if [ "$action" = finish ]; then
    [ -n "$id" ] || { echo "boat-check: this worktree has no sandbox (key $key)"; exit 0; }
    if boat delete "$id" --yes --json >/dev/null 2>&1 || [ "$(sandbox_state "$id")" = gone ]; then
        rm -f "$state"
        echo "boat-check: deleted sandbox $id"
        exit 0
    fi
    die 1 "couldn't delete sandbox $id: boat delete $id --yes"
fi

# From here on, whatever sandbox this run creates or resumes is stopped (or set back to
# MCA_BOAT_IDLE) on exit, even if starting it fails part way.
armed=1
ensure_sandbox

check="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
[ -z "$(git status --porcelain --untracked-files=normal)" ] || check="$check-dirty"
remote_dir=/home/user/checks/$check
# Keep the sandbox up for the check, but no longer than busy_ttl after this script dies.
boat extend "$id" --ttl "$busy_ttl" >/dev/null
extended=1
start_keepalive
echo "boat-check: pushing the working tree to $id:$remote_dir" >&2
boat push "$id" . --to "$remote_dir" >/dev/null
# `boat push` copies files, not Git metadata. A bundle of HEAD lets the sandbox rebuild
# the repository, so build stamps and acceptance results record the real commit and
# whether the tree was modified.
bundle=$local_dir/$check.bundle
git bundle create "$bundle" HEAD 2>/dev/null
boat scp "$bundle" "$id:$remote_dir.bundle" >/dev/null
rm -f "$bundle"

# boat exec streams JSON frames when its output isn't a terminal: print each frame's
# text (stdout and stderr together) and keep the frames for the exit status.
encoded=$(printf '%s' "$cmd" | base64 | tr -d '\n')
# The tracked files that are executable here, so the sandbox copy matches this tree's
# modes rather than the commit's (which would hide a dropped execute bit).
modes=$(git ls-files -z | while IFS= read -r -d '' path; do
            if [ -f "$path" ] && [ -x "$path" ]; then printf '%s\0' "$path"; fi
        done | base64 | tr -d '\n')
[ -n "$modes" ] || modes=-
exec_log=$local_dir/$check.jsonl
set +e
boat exec "$id" --json --timeout 0 "bash $remote_dir/scripts/boat-check-remote.sh $remote_dir $keep_checks $encoded $modes" \
    | tee "$exec_log" \
    | jq -R --unbuffered -j '. as $line | (try fromjson catch null) as $frame
        | if ($frame | type) != "object" then $line + "\n"
          elif $frame.type == "stdout" or $frame.type == "stderr" then $frame.data
          else empty end'
status=${PIPESTATUS[0]}
set -e
# Only an exit frame proves the check ended; without one, cleanup still interrupts it.
code=$(jq -R -r 'try fromjson catch null | select(type == "object" and .type == "exit") | .exitCode // 1' "$exec_log" 2>/dev/null | tail -n 1 || true)
if [ -n "$code" ]; then
    status=$code
    remote_running=0
else
    echo "boat-check: boat exec ended without the check's exit status" >&2
    [ "$status" != 0 ] || status=1
fi
rm -f "$exec_log"

for path in ${fetch[@]+"${fetch[@]}"}; do
    mkdir -p "$local_dir/$check"
    if boat scp -r "$id:$remote_dir/$path" "$local_dir/$check/" >/dev/null; then
        echo "boat-check: copied $path to .runtime/boat-check/$check/" >&2
    else
        echo "boat-check: couldn't copy $path back" >&2
        [ "$status" != 0 ] || status=1
    fi
done
echo "boat-check: $( [ "$status" = 0 ] && echo passed || echo "failed ($status)" ) in $id:$remote_dir" >&2
[ "$status" = 0 ] || exit "$status"
[ "$save" = 1 ] || exit 0

# The snapshot keeps the toolchain and the caches in /home/user/mca-cache, not checkouts.
boat exec "$id" --timeout 600 "rm -rf /home/user/checks" >/dev/null
remote_dir=""
# Reusing a name keeps its createdAt, so wait for a new snapshotId under the name.
prev=$(boat snapshots --json 2>/dev/null | jq -r --arg n "$snapshot" \
    '[.named[]? | select(.name == $n) | .snapshotId // ""][0] // ""' || true)
echo "boat-check: saving $id as $snapshot" >&2
boat snapshot "$id" "$snapshot" >/dev/null || die 1 "saving $snapshot failed"
deadline=$((SECONDS + 600)) snap=""
while :; do   # poll once more after the deadline before giving up
    snap=$(boat snapshots --json 2>/dev/null | jq -r --arg n "$snapshot" --arg id "$id" --arg prev "$prev" \
        '[.named[]? | select(.name == $n and .sourceSandboxId == $id and (.snapshotId // "") != $prev)
          | .status][0] // ""' || true)
    case "$snap" in ready|failed) break ;; esac
    [ "$SECONDS" -lt "$deadline" ] || break
    sleep 5
done
case "$snap" in
    ready) echo "boat-check: saved $snapshot; this worktree keeps using $id" >&2 ;;
    failed) die 1 "saving $snapshot failed (boat snapshots shows why)" ;;
    *) die 1 "$snapshot isn't ready after about 10 minutes; check boat snapshots" ;;
esac
}

die() { local code=$1; shift; echo "boat-check: $*" >&2; exit "$code"; }

# One check at a time per sandbox. mkdir is atomic and, unlike flock, exists on macOS.
# The owner writes its pid right after mkdir, so a contender that finds no pid waits
# a few seconds for it before it treats the lock as stale.
take_lock() {
    local other cur tries=0
    until mkdir "$lock" 2>/dev/null; do
        tries=$((tries + 1))
        [ "$tries" -le 10 ] \
            || die 4 "couldn't take $lock. If no boat-check is running, remove it (and $lock.reclaim)."
        other=$(cat "$lock/pid" 2>/dev/null || true)
        if [ -z "$other" ]; then sleep 1; continue; fi   # its owner is still writing the pid
        if kill -0 "$other" 2>/dev/null; then
            die 4 "another boat-check (pid $other) is using this worktree's sandbox. Wait for it, or give a second agent in this checkout its own sandbox with MCA_BOAT_KEY=<name>."
        fi
        # Stale: its owner is gone. Contenders reclaim it one at a time, and only while it
        # still holds the dead pid, so none can remove a lock another one just took.
        if mkdir "$lock.reclaim" 2>/dev/null; then
            cur=$(cat "$lock/pid" 2>/dev/null || true)
            if [ "$cur" = "$other" ]; then rm -rf "$lock"; fi
            rmdir "$lock.reclaim"
        else
            sleep 1
        fi
    done
    echo $$ > "$lock/pid"
    have_lock=1
}

# Deletes the recorded sandbox before it's replaced; keeps its id when that fails.
delete_for_replacement() {
    boat delete "$id" --yes --json >/dev/null 2>&1 || [ "$(sandbox_state "$id")" = gone ] \
        || die 1 "couldn't delete $id to replace it; it stays recorded. Try again, or boat delete $id --yes"
}

# Prints the sandbox's state, "gone" when Boat confirms it doesn't exist, or "unknown"
# when the lookup failed, so a passing network error never replaces or forgets one.
sandbox_state() {
    local out st
    if out=$(boat info "$1" --json 2>&1); then
        st=$(printf '%s' "$out" | jq -r '(.sandbox // .).state // empty' 2>/dev/null || true)
        case "$st" in
            deleted) printf gone ;;
            "") printf unknown ;;
            *) printf '%s' "$st" ;;
        esac
    elif printf '%s' "$out" | jq -e 'select(.code == "not_found" or .status == 404)' >/dev/null 2>&1; then
        printf gone
    else
        printf unknown
    fi
}

# Prints why no sandbox can start now, or nothing when one can. Starts beyond the plan's
# included ones cost money, so they need MCA_BOAT_PAID_STARTS=1. Fails closed: when the
# limits can't be read, it gives that as the reason.
no_start_reason() {
    local limits
    if ! limits=$(boat limits --json 2>/dev/null) \
        || ! printf '%s' "$limits" | jq -e '.starts | type == "object"' >/dev/null 2>&1; then
        echo "Couldn't read boat limits, so it isn't known whether a start is free; try again."
        return
    fi
    printf '%s' "$limits" | jq -r --arg paid "${MCA_BOAT_PAID_STARTS:-0}" '
        if .starts.unlimited == true then empty else
        ([.starts.minute.remaining, .starts.hour.remaining, .starts.day.remaining] | map(. // 0) | min) as $left
        | if $left > 0 then empty
          elif .nextStartDollars != null and $paid == "1" then empty
          elif .nextStartDollars != null then
            "Every included start is used; the next one would cost $\(.nextStartDollars). Set MCA_BOAT_PAID_STARTS=1 to pay for it, or wait. \(.startWindowFull.short // "")"
          else (.startWindowFull.short // "No Boat starts are left.") end end' 2>/dev/null \
        || echo "Couldn't read boat limits, so it isn't known whether a start is free; try again."
}

# Runs a boat new or resume with --fail-fast, retrying briefly while no machine is
# ready: such an attempt fails at once and doesn't count against the start limits.
# A failed attempt can leave Boat finishing a resume for a moment, so the next one is
# answered "resume already in progress"; that is waited out too.
fail_fast() {
    local attempt out wait why
    for attempt in 1 2 3 4 5 6; do
        if out=$("$@" --fail-fast 2>&1); then printf '%s\n' "$out"; return 0; fi
        case "$out" in
            *no_ready_machine*) wait=5 why="no machine is ready" ;;
            *"already in progress"*) wait=10 why="Boat is still busy with an earlier attempt" ;;
            *) printf '%s\n' "$out"; return 1 ;;
        esac
        [ "$attempt" -lt 6 ] || { printf '%s\n' "$out"; return 1; }
        echo "boat-check: $why; retrying in $wait s" >&2
        sleep "$wait"
    done
}

ensure_sandbox() {
    local st waited=0 out
    if [ -n "$id" ]; then
        st=$(sandbox_state "$id")
        case "$st" in
            provisioned|cloning|ready|idle|running)
                echo "boat-check: reusing sandbox $id" >&2
                return ;;
            stopping|stopped)
                echo "boat-check: resuming sandbox $id" >&2
                # A resume during stopping takes back the same machine, which is no start;
                # when Boat can't, it refuses with sandbox_stopping and starts nothing.
                if [ "$st" = stopping ]; then
                    if out=$(fail_fast boat resume "$id" --ttl "$busy_ttl" --json); then return; fi
                    [[ $out == *sandbox_stopping* ]] || { echo "$out" >&2; die 3 "couldn't resume $id; it stays recorded for the next check (or --done)"; }
                    echo "boat-check: Boat can't take $id back while it stops; waiting for the stop to finish" >&2
                    while st=$(sandbox_state "$id"); [ "$st" = stopping ] && [ "$waited" -lt 300 ]; do
                        sleep 5; waited=$((waited + 5))
                    done
                    [ "$st" = stopped ] || die 1 "sandbox $id is $st; try again when it settles (boat info $id)"
                fi
                # A resume counts as one start, unless Boat still holds the machine (for
                # about 10 minutes after the stop).
                local reason
                reason=$(no_start_reason)
                [ -z "$reason" ] || die 3 "can't resume $id now. $reason"
                if out=$(fail_fast boat resume "$id" --ttl "$busy_ttl" --json); then return; fi
                # An earlier attempt's resume may have finished after all.
                case "$(sandbox_state "$id")" in
                    provisioned|cloning|ready|idle|running)
                        echo "boat-check: $id is up after all; reusing it" >&2
                        return ;;
                esac
                echo "$out" >&2
                # Replace it only when its data is gone; otherwise keep it for the next try.
                [[ $out == *snapshot_data_expired* ]] \
                    || die 3 "couldn't resume $id; it stays recorded for the next check (or --done)"
                echo "boat-check: $id's data has expired; replacing it" >&2
                delete_for_replacement ;;
            gone) echo "boat-check: sandbox $id is gone; creating a new one" >&2 ;;
            unknown) die 1 "couldn't look up sandbox $id; try again (boat info $id)" ;;
            error) echo "boat-check: sandbox $id is in an error state; replacing it" >&2
               delete_for_replacement ;;
            *) die 1 "sandbox $id is $st; try again when it settles (boat info $id)" ;;
        esac
        rm -f "$state"
        id=""
    fi

    local reason from=() name
    reason=$(no_start_reason)
    [ -z "$reason" ] || die 3 "can't create a sandbox now. $reason"
    if boat snapshots --json 2>/dev/null | jq -e --arg n "$snapshot" '.named[]? | select(.name == $n and .status == "ready")' >/dev/null; then
        from=(--from "$snapshot")
        echo "boat-check: creating a sandbox from $snapshot" >&2
    else
        echo "boat-check: no ready $snapshot snapshot, so this sandbox starts cold; --save makes one" >&2
    fi
    # The account is shared by every project, so the name says which one this is
    # (Boat allows 120 characters).
    # A short hash of the checkout's path tells apart checkouts with the same folder name.
    name=$(printf '%s' "$(basename "$root")" | tr -c 'A-Za-z0-9_-' '-' | cut -c1-40)
    name="minecraft-autopilot-check-$name-$(printf '%s' "$root" | cksum | awk '{ printf "%06x", $1 % 16777216 }')-$key"
    new_log=$local_dir/new-$key.log
    # --no-env: none of the account's stored logins, tokens or keys go into the sandbox.
    if ! fail_fast boat new --json --no-env --type "$type" --ttl "$busy_ttl" --name "$name" ${from[@]+"${from[@]}"} >"$new_log"; then
        cat "$new_log" >&2
        record_new_id
        die 1 "creating a sandbox failed${id:+ (recorded $id; --done deletes it)}"
    fi
    id=$(jq -r 'select(.event == "ready") | .id // empty' "$new_log" 2>/dev/null | head -n 1 || true)
    [ -n "$id" ] || record_new_id
    [ -n "$id" ] || { cat "$new_log" >&2; die 1 "couldn't find the new sandbox's id; boat list shows it"; }
    echo "$id" > "$state"
    rm -f "$new_log"
    new_log=""
    echo "boat-check: created sandbox $id ($name)" >&2
}

# Keep the id of a sandbox whose creation didn't finish, so the next run or --done finds it.
record_new_id() {
    [ -n "$new_log" ] && [ -f "$new_log" ] || return 0
    id=$(grep -o 'bx_[a-z0-9]*' "$new_log" | head -n 1 || true)
    [ -z "$id" ] || echo "$id" > "$state"
}

# Renews the busy auto-stop every keepalive_every seconds, but only while this script's
# own process is alive (checked every few seconds) and for at most MCA_BOAT_MAX_CHECK
# seconds. The exit trap kills it; if the script is killed outright, it stops renewing
# and Boat stops the sandbox within busy_ttl seconds.
start_keepalive() {
    local parent=$$
    (
        trap - EXIT INT TERM
        set +e
        start=$(date +%s) next=$((start + keepalive_every))
        while kill -0 "$parent" 2>/dev/null; do
            now=$(date +%s)
            [ $((now - start)) -lt "$max_check" ] || exit 0
            if [ "$now" -ge "$next" ]; then
                kill -0 "$parent" 2>/dev/null || exit 0
                boat extend "$id" --ttl "$busy_ttl" >/dev/null 2>&1
                next=$((now + keepalive_every))
            fi
            sleep 5
        done
    ) </dev/null >/dev/null 2>&1 &
    keepalive_pid=$!
}

# shellcheck disable=SC2329  # run by the EXIT trap
cleanup() {
    set +e
    [ -z "$keepalive_pid" ] || kill "$keepalive_pid" 2>/dev/null
    [ -z "$new_log" ] || { record_new_id; rm -f "$new_log"; }
    [ -z "$bundle" ] || rm -f "$bundle"
    [ -z "$exec_log" ] || rm -f "$exec_log"
    if [ -n "$remote_dir" ] && [ "$remote_running" = 1 ] && [ "$extended" = 1 ]; then
        # Interrupted mid-check: interrupt the check's process group in the sandbox too,
        # as Ctrl+C would, so the test server and bot shut down cleanly.
        boat exec "$id" "pgid=\$(cat $remote_dir/.runtime/boat-check.pgid 2>/dev/null) && kill -INT -- -\$pgid 2>/dev/null; true" >/dev/null 2>&1
    fi
    # Armed before the sandbox is created or resumed, so a run that fails part way still
    # stops it. The id may be empty, gone or unknown; then this does nothing or warns.
    if [ "$armed" = 1 ] && [ -n "$id" ]; then
        if [ "$idle" = 0 ]; then
            # A stopped sandbox bills nothing, and a resume within about 10 minutes takes
            # back the kept machine without a start (owner decision, 2026-11-22).
            boat stop "$id" --json >/dev/null 2>&1 || [ "$(sandbox_state "$id")" = gone ] \
                || echo "boat-check: couldn't stop $id; it stops by itself within $busy_ttl s, or: boat stop $id" >&2
        else
            boat extend "$id" --ttl "$idle" >/dev/null 2>&1 || [ "$(sandbox_state "$id")" = gone ] \
                || echo "boat-check: couldn't reset $id's auto-stop: boat extend $id --ttl $idle" >&2
        fi
    fi
    if [ "${have_lock:-0}" = 1 ] && [ "$(cat "$lock/pid" 2>/dev/null)" = "$$" ]; then rm -rf "$lock"; fi
}

main "$@"; exit
