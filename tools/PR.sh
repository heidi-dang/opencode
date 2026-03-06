#!/usr/bin/env bash
set -euo pipefail

# PR.sh — push branch + create PR to dev with mandatory evidence prompts.
# Requirements: git, gh (GitHub CLI), python3, bun (if packages/app exists)
# Usage: ./PR.sh

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

get_origin_url() {
  git remote get-url origin 2>/dev/null || true
}

assert_origin_repo() {
  local url
  url="$(get_origin_url)"
  [[ -n "$url" ]] || die "Remote 'origin' not found."
  # Accept SSH or HTTPS forms.
  if [[ "$url" != *"heidi-dang/opencode"* ]]; then
    red "origin is: $url"
    die "origin is not heidi-dang/opencode. Fix origin URL, then re-run."
  fi
}

assert_gh_auth() {
  if ! gh auth status >/dev/null 2>&1; then
    die "gh not authenticated. Run: gh auth login"
  fi
}

current_branch() {
  git branch --show-current
}

assert_not_base_branch() {
  local br
  br="$(current_branch)"
  [[ -n "$br" ]] || die "Detached HEAD. Checkout a branch."
  if [[ "$br" == "dev" || "$br" == "main" || "$br" == "master" ]]; then
    die "You are on '$br'. Create a feature branch and re-run."
  fi
}

assert_clean_gitignore_junk() {
  # Block common junk from being committed.
  local junk=(
    "_doctor"
    "__pycache__"
  )
  local bad=0
  for j in "${junk[@]}"; do
    if git ls-files -z | tr '\0' '\n' | grep -qE "^${j}(/|$)"; then
      red "Junk tracked in git: ${j}/"
      bad=1
    fi
  done
  # Block *.pyc
  if git ls-files -z | tr '\0' '\n' | grep -qE "\.pyc$"; then
    red "Junk tracked in git: *.pyc"
    bad=1
  fi
  [[ "$bad" -eq 0 ]] || die "Remove tracked junk files from git before creating PR."
}

assert_has_diff_vs_base() {
  local base="$1"
  git fetch origin --prune >/dev/null 2>&1 || true

  local diffnames
  diffnames="$(git diff --name-only "origin/${base}..HEAD" || true)"
  if [[ -z "$diffnames" ]]; then
    die "No diff vs origin/${base}. Your branch is identical to ${base}."
  fi
}

run_doctor() {
  blu "Running: python3 tools/doctor.py"
  local out
  set +e
  out="$(python3 tools/doctor.py 2>&1)"
  local rc=$?
  set -e
  echo "$out" | tail -n 40
  [[ $rc -eq 0 ]] || die "tools/doctor.py failed. Fix it before PR."
  echo "$out" | tail -n 12 > .pr_doctor_tail.txt || true
  grn "Doctor passed."
}

run_build_if_app_exists() {
  if [[ -d "packages/app" ]]; then
    blu "Running: (cd packages/app && bun run build)"
    local out
    set +e
    out="$(cd packages/app && bun run build 2>&1)"
    local rc=$?
    set -e
    echo "$out" | tail -n 40
    [[ $rc -eq 0 ]] || die "packages/app build failed. Fix it before PR."
    echo "$out" | tail -n 12 > .pr_build_tail.txt || true
    grn "Build passed."
  else
    ylw "packages/app not found. Skipping bun build."
  fi
}

push_branch() {
  local br
  br="$(current_branch)"
  blu "Pushing branch: $br"
  git push -u origin HEAD
  grn "Push done."
  blu "Remote proof:"
  git ls-remote --heads origin "$br" || die "Remote branch not found after push."
}

create_or_update_pr() {
  local base="$1"
  local br
  br="$(current_branch)"

  # If PR exists, show it and exit (no duplicates).
  local existing
  existing="$(gh pr list --repo heidi-dang/opencode --head "$br" --state open --json number,url --jq '.[0].url' 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    grn "PR already exists: $existing"
    gh pr view --repo heidi-dang/opencode --head "$br" --json url,number,headRefName,baseRefName --jq '{url,number,headRefName,baseRefName}'
    return 0
  fi

  # Prompt: title/body sections
  echo ""
  blu "PR metadata"
  read -r -p "PR title: " PR_TITLE
  [[ -n "${PR_TITLE}" ]] || die "PR title is required."

  read -r -p "Task summary (1-3 sentences): " TASK_SUMMARY
  [[ -n "${TASK_SUMMARY}" ]] || die "Task summary is required."

  read -r -p "What did NOT change (1 sentence): " NOT_CHANGED
  [[ -n "${NOT_CHANGED}" ]] || die "Non-change statement is required."

  echo ""
  ylw "Verification: write EXACT commands and what you observed."
  read -r -p "Runtime verification steps (1-4 lines; use ';' to separate): " VERIFY_STEPS
  [[ -n "${VERIFY_STEPS}" ]] || die "Verification steps are required."

  read -r -p "Failure-mode checks done (comma-separated): " FAILMODES
  [[ -n "${FAILMODES}" ]] || die "Failure-mode checks are required."

  read -r -p "Any risks/notes (or 'none'): " RISKS
  [[ -n "${RISKS}" ]] || RISKS="none"

  local sha
  sha="$(git rev-parse HEAD)"

  local doctor_tail build_tail
  doctor_tail="$(cat .pr_doctor_tail.txt 2>/dev/null || echo "(doctor tail unavailable)")"
  build_tail="$(cat .pr_build_tail.txt 2>/dev/null || echo "(build tail unavailable or skipped)")"

  local diffnames
  diffnames="$(git diff --name-only "origin/${base}..HEAD" || true)"

  # Build PR body (plain, no emojis)
  local body
  body=$(
    cat <<EOF
Summary
${TASK_SUMMARY}

Not changed
${NOT_CHANGED}

Evidence
- Branch: ${br}
- SHA: ${sha}
- Changed files:
$(echo "${diffnames}" | sed 's/^/- /')

Doctor
\`\`\`
${doctor_tail}
\`\`\`

Build
\`\`\`
${build_tail}
\`\`\`

Runtime verification
${VERIFY_STEPS}

Failure-mode checks
${FAILMODES}

Risks / notes
${RISKS}
EOF
  )

  blu "Creating PR to base '${base}'..."
  gh pr create \
    --repo heidi-dang/opencode \
    --base "$base" \
    --head "$br" \
    --title "$PR_TITLE" \
    --body "$body"

  grn "PR created."
  gh pr view --repo heidi-dang/opencode --head "$br" --json url,number,headRefName,baseRefName --jq '{url,number,headRefName,baseRefName}'
}

main() {
  need_cmd git
  need_cmd gh
  need_cmd python3
  # bun is optional; required if packages/app exists
  if [[ -d "packages/app" ]]; then
    need_cmd bun
  fi

  confirm_repo_root
  assert_origin_repo
  assert_gh_auth
  assert_not_base_branch

  local base="dev"
  echo ""
  read -r -p "Base branch to PR into [dev]: " base_in
  if [[ -n "${base_in:-}" ]]; then base="$base_in"; fi

  # Make sure base exists on origin
  git fetch origin --prune >/dev/null 2>&1 || true
  git show-ref --verify --quiet "refs/remotes/origin/${base}" || die "origin/${base} not found."

  # No uncommitted work allowed
  if [[ -n "$(git status --porcelain)" ]]; then
    die "Working tree not clean. Commit or stash changes before running PR.sh."
  fi

  trap 'rm -f .pr_doctor_tail.txt .pr_build_tail.txt || true' EXIT

  assert_clean_gitignore_junk
  assert_has_diff_vs_base "$base"

  run_doctor
  run_build_if_app_exists

  push_branch
  create_or_update_pr "$base"
}

main "$@"
