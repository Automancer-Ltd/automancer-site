#!/usr/bin/env bash
# Tests the preview target's deploy-side logic: how a ref is resolved in the
# target clone, and that a revision which predates the target is refused BEFORE
# the clone is moved onto it.
#
# Both were real failures in the first rehearsal of the rollback runbook:
#   - `git clone` leaves a LOCAL `main` in the target clone, so resolving `main`
#     picked up a stale branch instead of origin/main and installed a revision
#     from before the preview target existed;
#   - `install-target.sh` moved the checkout before checking the revision
#     carried the target, which left the target unable to start.
#
# No network and no systemd: fixtures are local git repositories, and
# install-target is driven with --clone-only against a temporary root.
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
resolve="$root/ops/preview/resolve-ref.sh"
install="$root/ops/preview/install-target.sh"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/automancer-site-preview-test.XXXXXXXX")
trap 'rm -rf -- "$scratch"' EXIT

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null

fail() { printf 'FAIL - %s\n' "$*" >&2; exit 1; }

# ---- fixtures: a bare origin, a seed clone, and a target clone that is behind ----
git init -q --bare "$scratch/origin.git"
git -C "$scratch/origin.git" symbolic-ref HEAD refs/heads/main
git init -q "$scratch/seed"
cd "$scratch/seed"
mkdir -p ops/preview ops/systemd/user
printf '# server\n' >ops/preview/preview.mjs
printf '# unit\n' >ops/systemd/user/automancer-site-preview.service
printf '# verifier\n' >ops/verify-production.sh
git add -A
git commit -q -m "before the preview target (no ops/preview/)"
before=$(git rev-parse HEAD)
git rm -q -r ops && git commit -q -m "the shape the target refuses: no ops/preview"
shapeless=$(git rev-parse HEAD)
git revert --no-edit "$shapeless" >/dev/null
git remote add origin "$scratch/origin.git"
git tag -f -a v-test -m tag "$(git rev-parse HEAD)" >/dev/null 2>&1 || git tag -f v-test
git push -q origin HEAD:main
git push -q --force origin v-test
with_target=$(git rev-parse HEAD)

git clone -q "$scratch/origin.git" "$scratch/target"

# origin/main moves on after the clone, leaving the target's local main stale
printf '# server v2\n' >>ops/preview/preview.mjs
git commit -q -am "after the target clone"
newest=$(git rev-parse HEAD)
git push -q origin HEAD:main
git -C "$scratch/target" fetch -q origin

# ---- resolve-ref prefers origin/<ref> over the clone's stale local branch ----
got=$("$resolve" "$scratch/target" main) || fail "resolve-ref main exited non-zero"
[ "$got" = "$newest" ] || fail "resolve-ref main returned $got, want origin/main $newest"
stale=$(git -C "$scratch/target" rev-parse main)
[ "$stale" != "$got" ] || fail "fixture is wrong: the clone's local main is not stale"

got=$("$resolve" "$scratch/target" "$with_target") || fail "resolve-ref sha exited non-zero"
[ "$got" = "$with_target" ] || fail "resolve-ref sha returned $got, want $with_target"

got=$("$resolve" "$scratch/target" v-test) || fail "resolve-ref tag exited non-zero"
[ "$got" = "$with_target" ] || fail "resolve-ref tag returned $got, want $with_target"

if "$resolve" "$scratch/target" not-a-ref >/dev/null 2>&1; then
  fail "resolve-ref accepted a ref that does not exist"
fi

# ---- install-target --clone-only ----
fixture_root="$scratch/preview-root"
mkdir -p "$fixture_root"
AUTOMANCER_SITE_REPO_URL="$scratch/origin.git" \
  AUTOMANCER_SITE_PREVIEW_ROOT="$fixture_root" \
  "$install" main --clone-only >/dev/null
[ "$(git -C "$fixture_root/target" rev-parse HEAD)" = "$newest" ] ||
  fail "install-target --clone-only did not land on origin/main"

# A revision without the target must be refused, and the checkout must NOT move.
if AUTOMANCER_SITE_REPO_URL="$scratch/origin.git" \
  AUTOMANCER_SITE_PREVIEW_ROOT="$fixture_root" \
  "$install" "$shapeless" --clone-only >"$scratch/out" 2>"$scratch/err"; then
  fail "install-target accepted a revision that predates the preview target"
fi
grep -Fq 'predates the preview target' "$scratch/err" ||
  fail "install-target refusal did not name the missing target: $(cat "$scratch/err")"
[ "$(git -C "$fixture_root/target" rev-parse HEAD)" = "$newest" ] ||
  fail "install-target moved the checkout before refusing the revision"
[ -z "$(git -C "$fixture_root/target" status --porcelain)" ] ||
  fail "install-target left the target clone dirty"

# ---- the unit the target installs pins the root the scripts expect ----
grep -Fqx 'ExecStart=/usr/bin/node /opt/automancer/srv/automancer-site-preview/target/ops/preview/preview.mjs serve' \
  "$root/ops/systemd/user/automancer-site-preview.service" ||
  fail "the preview unit's ExecStart does not match the documented target path"

printf 'preview target ref-resolution and install-preflight tests passed\n'
