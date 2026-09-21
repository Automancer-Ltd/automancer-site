#!/usr/bin/env bash
# safe-git-config.sh — a `git config` wrapper that refuses the linked-worktree
# foot-gun.
#
# In a LINKED WORKTREE `.git` is a FILE pointing into the primary checkout, and
# a plain `git config` write there lands on the primary's SHARED config — it
# silently changes every other worktree too. On 31 Aug 2026 an agent elsewhere
# on the estate disarmed a working checkout's hooks exactly this way.
# In a STANDALONE clone `.git` is a DIRECTORY and the write stays local.
#
# Usage:
#   scripts/safe-git-config.sh <git config args...>   guarded passthrough
#   scripts/safe-git-config.sh --classify             print layout and exit:
#                                                     standalone(0) linked-worktree(1) not-git(2)
#
# Suggested alias so the guard is the path of least resistance:
#   git config alias.cfg '!scripts/safe-git-config.sh'   # then: git cfg user.name ...
#
# When sharing or targeting a specific file is the point, say so explicitly —
# these always pass through unguarded:
#   git config --worktree ...      writes THIS worktree's own config
#   git config --file <path> ...   writes a file you named
#   ALLOW_LINKED_WORKTREE_CONFIG=1 scripts/safe-git-config.sh ...
set -euo pipefail

classify() {
  local root
  if ! root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
    echo "not-git"
    return 2
  fi
  if [ -f "$root/.git" ]; then
    echo "linked-worktree"
    return 1
  fi
  echo "standalone"
  return 0
}

if [ "${1:-}" = "--classify" ]; then
  classify
  exit $?
fi

case "$(classify)" in
  standalone)
    exec git config "$@"
    ;;
  linked-worktree)
    if [ "${ALLOW_LINKED_WORKTREE_CONFIG:-}" = "1" ]; then
      echo "warning: .git is a file — this git config write lands on the PRIMARY checkout's shared config" >&2
      exec git config "$@"
    fi
    cat >&2 <<'EOF'
refused: .git is a FILE, so this is a linked worktree and a plain `git config`
write would silently change the PRIMARY checkout's shared config (that is how a
working checkout's hooks were disarmed on 31 Aug).

Do one of these instead:
  git config --worktree <args...>                        writes only this worktree's config
  cd <primary checkout> && git config <args...>          if the shared change is intended
  ALLOW_LINKED_WORKTREE_CONFIG=1 scripts/safe-git-config.sh <args...>   explicit bypass
EOF
    exit 1
    ;;
  *)
    echo "refused: not inside a git repository" >&2
    exit 2
    ;;
esac
