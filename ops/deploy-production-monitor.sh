#!/usr/bin/env bash
# Deploy the production verifier from a reviewed automancer-site main commit.
set -euo pipefail

PIN_ROOT="${AUTOMANCER_SITE_MONITOR_PIN_ROOT:-/opt/automancer/auto/automancer-detectors/site}"
REPO_URL="${AUTOMANCER_SITE_MONITOR_REPO_URL:-https://github.com/Automancer-Ltd/automancer-site.git}"
USER_UNIT_DIR="${AUTOMANCER_USER_UNIT_DIR:-$HOME/.config/systemd/user}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-/usr/bin/systemctl}"
UNIT_NAME=automancer-site-production-verify
RELEASE_NOTE_NAMES=(automancer-site wick gdp-chorus gdp-ic1)

refuse_broken_release_note_units() {
  local name suffix path broken=0
  for name in "${RELEASE_NOTE_NAMES[@]}"; do
    for suffix in service timer; do
      path="$USER_UNIT_DIR/${name}-release-notes-catchup.${suffix}"
      if [[ -L "$path" && ! -e "$path" ]]; then
        printf 'REFUSED: %s is a dangling symlink; a user-manager reload would remove a live release-note unit. Resolve AUT-9801 first.\n' "$path" >&2
        broken=1
      fi
    done
  done
  (( broken == 0 ))
}

if [[ ${1:-} == --preflight-only ]]; then
  [[ $# -eq 1 ]] || { printf 'usage: %s --preflight-only\n' "$0" >&2; exit 64; }
  refuse_broken_release_note_units
  printf 'production monitor deploy preflight passed\n'
  exit 0
fi

if [[ $# -ne 1 || ! $1 =~ ^[0-9a-fA-F]{40}$ ]]; then
  printf 'usage: %s <reviewed-automancer-site-main-sha>\n' "$0" >&2
  exit 64
fi
requested=${1,,}

# This check must happen before cloning, moving a pin, linking units, or asking
# systemd to reload. AUT-9801 records four release-note units that currently
# survive only in systemd's in-memory copy.
refuse_broken_release_note_units

if [[ -z ${XDG_RUNTIME_DIR:-} ]]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi

if "$SYSTEMCTL_BIN" --user is-active --quiet "$UNIT_NAME.service"; then
  printf 'REFUSED: %s.service is running; retry after it finishes\n' "$UNIT_NAME" >&2
  exit 1
fi

if [[ ! -d "$PIN_ROOT/.git" ]]; then
  mkdir -p "$(dirname -- "$PIN_ROOT")"
  git clone --quiet --branch main --single-branch "$REPO_URL" "$PIN_ROOT"
fi

(
  cd "$PIN_ROOT"
  [[ -z $(git status --porcelain) ]] || {
    printf 'REFUSED: production pin is dirty: %s\n' "$PIN_ROOT" >&2
    exit 1
  }
  git fetch --quiet origin main
  git cat-file -e "${requested}^{commit}" || {
    printf 'REFUSED: requested revision does not exist after fetching origin\n' >&2
    exit 65
  }
  git merge-base --is-ancestor "$requested" origin/main || {
    printf 'REFUSED: requested revision is not an ancestor of origin/main\n' >&2
    exit 66
  }
  git merge --ff-only "$requested"
  [[ $(git rev-parse HEAD) == "$requested" ]]
  [[ -z $(git status --porcelain) ]]
)

mkdir -p "$USER_UNIT_DIR"
for suffix in service timer; do
  ln -sfn \
    "$PIN_ROOT/ops/systemd/user/$UNIT_NAME.$suffix" \
    "$USER_UNIT_DIR/$UNIT_NAME.$suffix"
done

"$SYSTEMCTL_BIN" --user daemon-reload
"$SYSTEMCTL_BIN" --user enable --now "$UNIT_NAME.timer"
"$SYSTEMCTL_BIN" --user start "$UNIT_NAME.service"

"$SYSTEMCTL_BIN" --user show "$UNIT_NAME.service" \
  -p Result -p ExecMainStatus -p ExecMainCode -p FragmentPath
"$SYSTEMCTL_BIN" --user show "$UNIT_NAME.timer" \
  -p ActiveState -p UnitFileState -p NextElapseUSecRealtime -p FragmentPath
printf 'site-monitor landed=%s\n' "$(git -C "$PIN_ROOT" rev-parse HEAD)"
