#!/usr/bin/env bash
# Run a CI step's command beside the steps after it, then collect its verdict (t27546).
#
#   ops/ci/beside.sh start <name> <command> [args...]   start it in the background and return
#   ops/ci/beside.sh wait <name>                        wait for it, print its output, exit with its status
#
# For commands that mostly wait (on a download, a local fixture server) rather than compute: the
# pull-request check ran them one after another behind steps they never read from. The command's
# output goes to a log that `wait` prints whole, so it never interleaves with the steps it ran
# beside. A background process keeps running through the job's later steps; the runner ends
# whatever is left when the job completes.
set -euo pipefail

dir() { printf '%s/beside/%s' "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" "$1"; }

case "${1:-}" in
  start)
    [ $# -ge 3 ] || { echo "usage: $0 start <name> <command> [args...]" >&2; exit 2; }
    d=$(dir "$2"); shift 2
    rm -rf "$d"; mkdir -p "$d"
    # The status file appears only once the command has ended, with its exit code.
    # shellcheck disable=SC2016 # expanded by the inner bash, from its own arguments
    nohup bash -c '"$@" > "$0/log" 2>&1; echo $? > "$0/status.part"; mv "$0/status.part" "$0/status"' "$d" "$@" > /dev/null 2>&1 &
    echo "started beside the next steps: $*"
    ;;
  wait)
    [ $# -eq 2 ] || { echo "usage: $0 wait <name>" >&2; exit 2; }
    d=$(dir "$2")
    [ -d "$d" ] || { echo "$2 was never started" >&2; exit 2; }
    # The step's own timeout-minutes bounds this wait.
    while [ ! -f "$d/status" ]; do sleep 1; done
    cat "$d/log"
    exit "$(cat "$d/status")"
    ;;
  *)
    echo "usage: $0 start <name> <command> [args...] | wait <name>" >&2
    exit 2
    ;;
esac
