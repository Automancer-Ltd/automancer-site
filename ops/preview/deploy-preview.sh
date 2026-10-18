#!/usr/bin/env bash
# Publish one ref to the automancer-site preview target.
#
# The target is the non-production origin described in docs/DEPLOYMENT.md:
# a marked release directory served by automancer-site-preview.service over the
# tailnet. This script is the only thing that writes a release, so the sequence
# it prints is the sequence the runbook rehearses:
#
#   fetch the ref -> run the repository's own gate -> build -> stamp the release
#   with its ref and revision -> flip `current` -> read the served revision back
#   over HTTP
#
# It refuses `main` outright: the public site deploys from main onto GitHub
# Pages, and this target must never be able to look like it.
#
# usage: deploy-preview.sh <ref|40-hex-sha> [--no-gate] [--verify] [--keep N]
#
#   <ref>      branch, tag or commit; resolved after `git fetch` in the target
#              clone, so it must exist on origin. Not `main`.
#   --no-gate  publish without running `pnpm run verify`. For a throwaway
#              candidate only; the rehearsal runs the gate.
#   --verify   also run ops/verify-production.sh --preview against the tailnet
#              URL (the runbook's verification step, same checker as production).
#   --keep N   keep the N newest release directories (default 5). The release
#              currently served is never pruned.
set -euo pipefail

ROOT="${AUTOMANCER_SITE_PREVIEW_ROOT:-/opt/automancer/srv/automancer-site-preview}"
TARGET="$ROOT/target"
BUILD="$ROOT/build"
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
STATE="$ROOT/state"
UNIT=automancer-site-preview.service
PREVIEW_HOST_PORT="${AUTOMANCER_SITE_PREVIEW_LOCAL:-http://127.0.0.1:4174}"
PREVIEW_URL="${AUTOMANCER_SITE_PREVIEW_URL:-https://automancer-vps.taild6c90e.ts.net:4174}"
DEFAULT_KEEP=5

die() { printf 'REFUSED: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*"; }

used_default_root=1
[[ $ROOT == "${AUTOMANCER_SITE_PREVIEW_ROOT:-/opt/automancer/srv/automancer-site-preview}" ]] || used_default_root=0
if (( used_default_root == 0 )) && [[ $ROOT != /opt/automancer/srv/automancer-site-preview ]]; then
  die "a custom AUTOMANCER_SITE_PREVIEW_ROOT needs a matching unit (unit ExecStart pins the default root)"
fi

ref=''; run_gate=1; run_verify=0; keep=$DEFAULT_KEEP
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-gate) run_gate=0 ;;
    --verify) run_verify=1 ;;
    --keep) keep="${2:?--keep needs a number}"; shift ;;
    -*) die "unknown option $1" ;;
    *) [[ -z $ref ]] || die "expected one ref, got '$ref' and '$1'"; ref=$1 ;;
  esac
  shift
done
[[ -n $ref ]] || die "usage: deploy-preview.sh <ref|sha> [--no-gate] [--verify] [--keep N]"

[[ -d "$TARGET/.git" ]] || die "no target clone at $TARGET — run ops/preview/install-target.sh first"

note "deploy-preview: fetching origin in $TARGET"
git -C "$TARGET" fetch --quiet --prune origin '+refs/heads/*:refs/remotes/origin/*'

sha=''
for candidate in "$ref" "origin/$ref" "refs/remotes/origin/$ref"; do
  if sha=$(git -C "$TARGET" rev-parse --verify --quiet "${candidate}^{commit}"); then break; fi
  sha=''
done
[[ -n $sha ]] || die "'$ref' does not exist on origin (fetched just now) — push it first"

main_sha=$(git -C "$TARGET" rev-parse --verify origin/main^{commit})
case "$ref" in
  main|refs/heads/main|origin/main|refs/remotes/origin/main) die "the preview target never serves main" ;;
esac
[[ $sha != "$main_sha" ]] || die "that revision is main's tip (${sha:0:7}) — the preview target never serves main"

short=${sha:0:7}
note "deploy-preview: publishing ${ref} -> ${sha}"

# A dedicated linked worktree of the target clone holds the candidate source.
# node_modules is kept between deploys (clean -fd, never -x) so the gate is
# fast; nothing else in it is trusted across runs.
git -C "$TARGET" worktree prune
if [[ -d $BUILD ]]; then
  git -C "$BUILD" checkout --quiet --detach "$sha"
  git -C "$BUILD" reset --quiet --hard "$sha"
  git -C "$BUILD" clean --quiet -fd
else
  git -C "$TARGET" worktree add --quiet --detach "$BUILD" "$sha"
fi
[[ $(git -C "$BUILD" rev-parse HEAD) == "$sha" ]] || die "worktree at $BUILD is not at $sha"

gate() {
  if command -v checkq >/dev/null 2>&1; then
    checkq -- "$@"
  else
    "$@"
  fi
}

note "deploy-preview: installing dependencies (frozen lockfile)"
( cd "$BUILD" && gate pnpm install --frozen-lockfile >/dev/null )

if (( run_gate == 1 )); then
  note "deploy-preview: running the repository gate (pnpm run verify: lint, typecheck, build, dist audit)"
  ( cd "$BUILD" && gate pnpm run verify )
else
  note "deploy-preview: --no-gate, building WITHOUT running the repository gate"
  ( cd "$BUILD" && gate pnpm run build )
fi

[[ -f "$BUILD/dist/index.html" ]] || die "no dist/index.html after the build"

mkdir -p "$RELEASES" "$STATE"
staging=$(mktemp -d "$RELEASES/.staging-${short}.XXXXXX")
trap 'rm -rf -- "$staging"' EXIT

note "deploy-preview: copying the built site and stamping it as the preview target"
rsync -a --delete "$BUILD/dist/" "$staging/"
node "$TARGET/ops/preview/preview.mjs" mark "$staging" \
  --ref "$ref" --sha "$sha" --url "$PREVIEW_URL" \
  --built-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

previous=''
if [[ -L $CURRENT ]]; then previous=$(basename "$(readlink -f "$CURRENT")"); fi

release="$RELEASES/$sha"
if [[ -e $release ]]; then
  mv "$release" "$RELEASES/.superseded-$short-$(date -u +%s)"
fi
mv "$staging" "$release"
trap - EXIT
rm -rf -- "$RELEASES"/.superseded-"$short"-* 2>/dev/null || true

ln -sfn "$release" "$CURRENT.next"
mv -Tf "$CURRENT.next" "$CURRENT"

if ! systemctl --user is-active --quiet "$UNIT"; then
  note "deploy-preview: $UNIT is not running; starting it"
  systemctl --user start "$UNIT"
fi

# Read the revision back off the running target rather than assuming it: the
# 7-character revision the site builds into its own proof strip.
served=''
for _ in $(seq 1 30); do
  body=$(curl -fsS --max-time 5 "$PREVIEW_HOST_PORT/" 2>/dev/null || true)
  served=$(printf '%s' "$body" | grep -oE 'build:</span><b>[0-9a-f]{7,40}</b>' | head -1 |
    sed -E 's#.*<b>([0-9a-f]+)</b>#\1#' | cut -c1-7 || true)
  [[ $served == "$short" ]] && break
  sleep 1
done
[[ $served == "$short" ]] || die "the target is not serving ${short} (read back '${served:-nothing}' from $PREVIEW_HOST_PORT)"

printf '%s\n' "{$(printf '"at":"%s","ref":"%s","sha":"%s","short":"%s","release":"%s","previous":"%s","servedRevision":"%s"' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ref" "$sha" "$short" "$release" "${previous:-none}" "$served")}" >>"$STATE/deployments.jsonl"

# Keep the newest releases, never the one being served.
mapfile -t olds < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -name '????????????????????????????????????????' \
  -printf '%T@ %p\n' | sort -rn | awk '{print $2}' | grep -vx "$release" | tail -n "+$keep")
for old in "${olds[@]:-}"; do
  [[ -n $old && $old != "$release" ]] || continue
  rm -rf -- "$old"
done

note ""
note "served revision : $served  ($release)"
note "previous release: ${previous:-none}"
note "local URL       : $PREVIEW_HOST_PORT/"
note "tailnet URL     : $PREVIEW_URL/"
note "undo this deploy: ln -sfn $RELEASES/${previous:-$sha} $CURRENT && systemctl --user restart $UNIT"
if (( run_verify == 1 )); then
  note ""
  note "deploy-preview: verifying the target with the production checker (preview mode)"
  "$TARGET/ops/verify-production.sh" --preview --expected-revision "$sha" "$PREVIEW_URL"
fi
