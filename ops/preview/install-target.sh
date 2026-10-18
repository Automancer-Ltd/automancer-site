#!/usr/bin/env bash
# Install or refresh the automancer-site preview target on auto-vps.
#
# The target is: a clone of this repository holding the reviewed server and
# unit, the automancer-site-preview.service user unit serving that clone's
# `ops/preview/preview.mjs`, and the tailnet exposure that makes it reachable
# over HTTPS so ops/verify-production.sh (which refuses plain http) can read it.
#
# The unit is symlinked, not copied, into the user unit directory: the file
# systemd runs is the file in the checkout, so the reviewed revision and the
# running revision cannot drift. ExecStart pins the default release root, so
# this script refuses a custom AUTOMANCER_SITE_PREVIEW_ROOT.
#
# usage: install-target.sh [<ref|40-hex-sha>] [--no-start] [--no-expose]
#
#   <ref>       default main; any ref that exists on origin (the rehearsal
#               installs the branch under test). Never run this from an
#               unreviewed ref outside a rehearsal.
#   --no-start  install the unit but do not start or enable it.
#   --no-expose skip the tailnet HTTPS mapping (loopback-only target).
set -euo pipefail

ROOT=/opt/automancer/srv/automancer-site-preview
TARGET="$ROOT/target"
UNIT=automancer-site-preview.service
REPO_URL="${AUTOMANCER_SITE_REPO_URL:-https://github.com/Automancer-Ltd/automancer-site.git}"
USER_UNIT_DIR="${AUTOMANCER_USER_UNIT_DIR:-$HOME/.config/systemd/user}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-/usr/bin/systemctl}"
SERVE_PORT="${AUTOMANCER_SITE_PREVIEW_PORT:-4174}"
RELEASE_NOTE_NAMES=(automancer-site wick gdp-chorus gdp-ic1)

[[ ${AUTOMANCER_SITE_PREVIEW_ROOT:-$ROOT} == "$ROOT" ]] || {
  printf 'REFUSED: a custom preview root needs a matching unit; ExecStart pins %s\n' "$ROOT" >&2
  exit 1
}

die() { printf 'REFUSED: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*"; }

# AUT-9801: four release-note units survive only in systemd's in-memory copy.
# `daemon-reload` would drop them, so refuse before touching systemd.
refuse_broken_release_note_units() {
  local name suffix path broken=0
  for name in "${RELEASE_NOTE_NAMES[@]}"; do
    for suffix in service timer; do
      path="$USER_UNIT_DIR/${name}-release-notes-catchup.${suffix}"
      if [[ -L $path && ! -e $path ]]; then
        printf 'REFUSED: %s is a dangling symlink; a user-manager reload would remove a live release-note unit. Resolve AUT-9801 first.\n' "$path" >&2
        broken=1
      fi
    done
  done
  (( broken == 0 ))
}

ref=main; do_start=1; do_expose=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-start) do_start=0 ;;
    --no-expose) do_expose=0 ;;
    -*) die "unknown option $1" ;;
    *) ref=$1 ;;
  esac
  shift
done

refuse_broken_release_note_units

if [[ -z ${XDG_RUNTIME_DIR:-} ]]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi

if [[ ! -d $TARGET/.git ]]; then
  note "install-target: cloning $REPO_URL into $TARGET"
  mkdir -p "$(dirname -- "$TARGET")"
  git clone --quiet "$REPO_URL" "$TARGET"
fi

git -C "$TARGET" fetch --quiet --prune origin '+refs/heads/*:refs/remotes/origin/*'
[[ -z $(git -C "$TARGET" status --porcelain) ]] || die "target clone is dirty: $TARGET"

sha=''
for candidate in "$ref" "origin/$ref" "refs/remotes/origin/$ref"; do
  if sha=$(git -C "$TARGET" rev-parse --verify --quiet "${candidate}^{commit}"); then break; fi
  sha=''
done
[[ -n $sha ]] || die "'$ref' does not exist on origin (fetched just now)"

if [[ $ref == main || $ref == refs/heads/main || $ref == origin/main ]]; then
  git -C "$TARGET" merge-base --is-ancestor "$sha" origin/main ||
    die "'$ref' is not an ancestor of origin/main"
fi

git -C "$TARGET" checkout --quiet --detach "$sha"
[[ $(git -C "$TARGET" rev-parse HEAD) == "$sha" ]] || die "checkout did not land on $sha"

for required in ops/preview/preview.mjs ops/systemd/user/$UNIT ops/verify-production.sh; do
  [[ -f "$TARGET/$required" ]] || die "$required is missing at ${sha:0:7} — that revision predates the preview target"
done

mkdir -p "$USER_UNIT_DIR"
ln -sfn "$TARGET/ops/systemd/user/$UNIT" "$USER_UNIT_DIR/$UNIT"
"$SYSTEMCTL_BIN" --user daemon-reload

if (( do_start == 1 )); then
  "$SYSTEMCTL_BIN" --user enable --now "$UNIT" >/dev/null
else
  note "install-target: --no-start, unit installed but not started"
fi

if (( do_expose == 1 )); then
  if tailscale serve status 2>/dev/null | grep -qE "^https://[^ ]*:${SERVE_PORT} "; then
    note "install-target: tailnet HTTPS :${SERVE_PORT} already mapped"
  else
    note "install-target: mapping tailnet HTTPS :${SERVE_PORT} -> http://127.0.0.1:${SERVE_PORT}"
    sudo -n tailscale serve --bg --https="$SERVE_PORT" "http://127.0.0.1:${SERVE_PORT}" ||
      die "could not map the tailnet port; run: sudo tailscale serve --bg --https=${SERVE_PORT} http://127.0.0.1:${SERVE_PORT}"
  fi
fi

if (( do_start == 1 )); then
  note "install-target: waiting for the target to answer on 127.0.0.1:${SERVE_PORT}"
  ok=0
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:${SERVE_PORT}/"; then ok=1; break; fi
    sleep 1
  done
  (( ok == 1 )) || die "the unit did not answer on 127.0.0.1:${SERVE_PORT}; see journalctl --user -u $UNIT"
  robots=$(curl -fsS -D - -o /dev/null --max-time 5 "http://127.0.0.1:${SERVE_PORT}/" | tr -d '\r' |
    awk 'tolower($1) == "x-robots-tag:" {print $2, $3}')
  [[ $robots == noindex,* ]] || die "the target did not answer with X-Robots-Tag: noindex (got '${robots:-none}')"
  note "install-target: target answers with X-Robots-Tag: $robots"
fi

"$SYSTEMCTL_BIN" --user show "$UNIT" -p ActiveState -p UnitFileState -p FragmentPath
note ""
note "target code at : $TARGET (${ref} = ${sha:0:7})"
note "release root   : $ROOT/current"
note "publish a ref  : ops/preview/deploy-preview.sh <ref>"
note "undo the target: systemctl --user disable --now $UNIT && rm -f $USER_UNIT_DIR/$UNIT &&"
note "                 sudo tailscale serve --https=${SERVE_PORT} off"
