#!/usr/bin/env bash
# Resolve a ref to a commit in a preview target clone, preferring the remote.
#
# The target clone is made with `git clone`, so it carries a LOCAL branch of
# every branch that existed at clone time — including `main`. Resolving `main`
# against that clone therefore finds whatever local `main` happened to be, not
# the branch tip on origin. The first rehearsal of the rollback runbook failed
# on exactly that: `install-target.sh main` checked out a stale local `main`
# from before the preview target existed. Callers fetch first, then ask this.
#
# usage: resolve-ref.sh <clone-dir> <ref>
# Prints the full commit on stdout; exits 64 when the ref cannot be resolved.
set -euo pipefail

clone=${1:?usage: resolve-ref.sh <clone-dir> <ref>}
ref=${2:?usage: resolve-ref.sh <clone-dir> <ref>}

for candidate in "refs/remotes/origin/$ref" "$ref"; do
  if sha=$(git -C "$clone" rev-parse --verify --quiet "${candidate}^{commit}"); then
    printf '%s\n' "$sha"
    exit 0
  fi
done

printf 'cannot resolve %s in %s (fetch origin first)\n' "$ref" "$clone" >&2
exit 64
