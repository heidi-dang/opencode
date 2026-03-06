# PR.sh Usage Guide

This repo uses `PR.sh` to prevent “phantom PRs” and “nothing changed” mistakes.

## What PR.sh does
`PR.sh` will:

1. Refuse to run if you are on `dev`, `main`, or `master`
2. Refuse to run if your branch has **no diff** vs `origin/dev`
3. Refuse to run if it detects tracked junk (e.g. `_doctor/`, `.opencode/`, `__pycache__/`, `*.pyc`)
4. Run required gates:
   - `python3 tools/doctor.py`
   - `cd packages/app && bun run build` (only if `packages/app` exists)
5. Push your branch to GitHub
6. Create a PR to `dev` (or show the existing PR)
7. Prompt you for the PR title + task summary + verification steps, and put them into the PR body

## Requirements
You must have these installed:
- `git`
- `gh` (GitHub CLI) and be logged in: `gh auth login`
- `python3`
- `bun` (only required if `packages/app/` exists)

Your `origin` remote must point to:
- `heidi-dang/opencode`

## One-time setup
Make the script executable:
```bash
chmod +x PR.sh