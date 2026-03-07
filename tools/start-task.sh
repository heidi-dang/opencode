#!/usr/bin/env bash
set -euo pipefail

# start-task.sh — prepare working branch from dev with clean state.
# Usage: ./start-task.sh <branch-name>
# Exit codes: 0=clean success, 1=dirty, 2=conflict

red() { printf "\033[31m%s\033[0m\n" "$*"; }
grn() { printf "\033[32m%s\033[0m\n" "$*"; }
ylw() { printf "\033[33m%s\033[0m\n" "$*"; }
blu() { printf "\033[34m%s\033[0m\n" "$*"; }

die() { red "STOP: $*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

confirm_repo_root() {
  local top
  top="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Not inside a git repo."
  if [[ "$PWD" != "$top" ]]; then
    ylw "You are not at repo root."
    ylw "cd to: $top"
    die "Re-run from repo root."
  fi
}

assert_origin() {
  git remote get-url origin >/dev/null 2>&1 || die "Remote 'origin' not found."
}

check_dirty() {
  local status
  status="$(git status --porcelain)"
  if [[ -n "$status" ]]; then
    red "Working tree not clean."
    git status --porcelain
    return 1
  fi
  return 0
}

check_rebase_progress() {
  local dir
  dir="$(git rev-parse --git-path rebase-merge 2>/dev/null)" || return 0
  if [[ -d "$dir" ]]; then
    red "Rebase in progress."
    ls -la "$dir"
    return 1
  fi

  dir="$(git rev-parse --git-path rebase-apply 2>/dev/null)"
  if [[ -d "$dir" ]]; then
    red "Rebase in progress (apply)."
    ls -la "$dir"
    return 1
  fi
  return 0
}

fetch_prune() {
  blu "Fetching and pruning origin..."
  git fetch --prune origin || die "Fetch failed."
}

sync_dev() {
  blu "Checking out dev..."
  git checkout dev || die "Checkout dev failed."

  blu "Fast-forwarding dev to origin/dev..."
  if ! git merge --ff-only origin/dev; then
    die "Fast-forward failed. dev diverged from origin/dev."
  fi
  grn "dev updated to origin/dev."
}

branch_exists() {
  local br="$1"
  git rev-parse --verify "$br" >/dev/null 2>&1
}

create_branch() {
  local br="$1"
  blu "Creating branch: $br"
  git checkout -b "$br" dev || die "Create branch $br failed."
  grn "Branch $br created from dev."
}

rebase_onto_dev() {
  local br="$1"
  blu "Checking out existing branch: $br"
  git checkout "$br" || die "Checkout $br failed."

  blu "Rebasing onto dev..."
  if ! git rebase dev; then
    red "Rebase conflict detected."
    return 1
  fi
  grn "Rebase complete."
  return 0
}

detect_conflict() {
  local status
  status="$(git status --porcelain)"
  if echo "$status" | grep -qE "^(UU|DD|AU|UD)"; then
    return 0
  fi
  return 1
}

list_conflict_files() {
  red "Conflicting files:"
  git status --porcelain | grep -E "^(UU|DD|AU|UD)" | while read -r mode file; do
    echo "  $file"
  done
}

abort_rebase() {
  red "Aborting rebase..."
  git rebase --abort || die "Abort rebase failed."
}

hot_cleanup() {
  blu "Running git clean -fdX (respecting .gitignore)..."
  git clean -fdX -e .runtime/ || die "git clean failed."
  grn "Cleanup complete."
}

verify_ahead_behind() {
  blu "Checking ahead/behind origin/dev..."
  local behind
  behind="$(git rev-list --count origin/dev..HEAD 2>/dev/null)" || behind="0"

  if [[ "$behind" -ne 0 ]]; then
    red "Branch is behind origin/dev by $behind commit(s)."
    return 1
  fi

  local ahead
  ahead="$(git rev-list --count HEAD..origin/dev 2>/dev/null)" || ahead="0"
  if [[ "$ahead" -ne 0 ]]; then
    ylw "Branch is ahead of origin/dev by $ahead commit(s) (dev moved)."
  else
    grn "Branch is up-to-date with origin/dev."
  fi
  return 0
}

show_status() {
  local br
  br="$(git branch --show-current)"
  local base
  base="$(git rev-parse dev)"
  local head
  head="$(git rev-parse HEAD)"

  echo ""
  ylw "=== Branch Info ==="
  blu "Branch: $br"
  blu "Base (dev): $base"
  blu "HEAD: $head"
  git status --short
}

main() {
  need_cmd git
  confirm_repo_root
  assert_origin

  if [[ $# -lt 1 ]]; then
    die "Usage: $0 <branch-name>"
  fi

  local br="$1"

  # Check dirty
  if ! check_dirty; then
    die "Commit or stash changes before starting task."
  fi

  # Check rebase in progress
  if ! check_rebase_progress; then
    die "Resolve rebase before starting task."
  fi

  # Fetch and prune
  fetch_prune

  # Sync dev
  sync_dev

  # Create or rebase branch
  if branch_exists "$br"; then
    if ! rebase_onto_dev "$br"; then
      list_conflict_files
      abort_rebase
      exit 2
    fi
  else
    create_branch "$br"
  fi

  # Cleanup
  hot_cleanup

  # Verify ahead/behind
  if ! verify_ahead_behind; then
    die "Cannot proceed: branch behind origin/dev."
  fi

  # Show status
  show_status

  grn "Ready to work."
  exit 0
}

main "$@"
