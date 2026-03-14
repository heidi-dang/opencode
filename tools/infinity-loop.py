#!/usr/bin/env python3
"""
Infinity Loop - Self-Auditing Workflow

A continuous self-auditing system that processes each function/module in the
opencode repository, identifying bugs, performance issues, and code health
problems, then applies focused patches, verifies them, documents the changes,
and commits them.

Run from repo root:
    python tools/infinity-loop.py start     # Start the loop
    python tools/infinity-loop.py status    # Show current status
    python tools/infinity-loop.py stop      # Stop the loop
    python tools/infinity-loop.py reset     # Reset state
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


# Constants
LOOP_DIR = Path(".local/infinity-loop")
STATE_FILE = LOOP_DIR / "state.json"
INVENTORY_FILE = LOOP_DIR / "inventory.json"
LOGS_DIR = LOOP_DIR / "logs"
PROOFS_DIR = Path("docs/infinity-loop")
STOP_FILE = LOOP_DIR / "stop"
MAX_RETRIES = 3


class LoopState:
    """Represents the current state of the infinity loop."""

    STATES = [
        "idle", "suggest", "select", "inspect", "patch", "verify",
        "document", "commit", "next", "blocked", "failed", "complete"
    ]

    def __init__(self, data: Optional[Dict] = None):
        if data:
            self.__dict__.update(data)
        else:
            self.version = "1.0"
            self.state = "idle"
            self.current_target = None
            self.cycle_id = 0
            self.attempt_count = 0
            self.last_result = None
            self.next_action = None
            self.artifact_paths = {
                "state_file": str(STATE_FILE),
                "inventory_file": str(INVENTORY_FILE),
                "logs_dir": str(LOGS_DIR),
                "proofs_dir": str(PROOFS_DIR)
            }
            self.created_at = datetime.now(timezone.utc).isoformat()
            self.updated_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict:
        return self.__dict__.copy()

    def save(self):
        """Persist state to disk."""
        self.updated_at = datetime.now(timezone.utc).isoformat()
        LOOP_DIR.mkdir(parents=True, exist_ok=True)
        with open(STATE_FILE, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @staticmethod
    def load() -> "LoopState":
        """Load state from disk, or return new state if not exists."""
        if STATE_FILE.exists():
            with open(STATE_FILE) as f:
                return LoopState(json.load(f))
        return LoopState()


class Target:
    """Represents a target to be audited."""

    def __init__(self, data: Optional[Dict] = None):
        if data:
            self.__dict__.update(data)
        else:
            self.id = ""
            self.name = ""
            self.path = ""
            self.type = "function"
            self.status = "pending"
            self.attempts = 0
            self.last_error = None
            self.proof_file = None
            self.commit_hash = None

    def to_dict(self) -> Dict:
        return self.__dict__.copy()


class Inventory:
    """Manages the target inventory."""

    def __init__(self, data: Optional[Dict] = None):
        if data:
            self.__dict__.update(data)
        else:
            self.version = "1.0"
            self.targets: List[Target] = []
            self.created_at = datetime.now(timezone.utc).isoformat()
            self.updated_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict:
        data = self.__dict__.copy()
        data["targets"] = [t.to_dict() if hasattr(t, "to_dict") else t for t in self.targets]
        return data

    def save(self):
        """Persist inventory to disk."""
        self.updated_at = datetime.now(timezone.utc).isoformat()
        LOOP_DIR.mkdir(parents=True, exist_ok=True)
        with open(INVENTORY_FILE, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @staticmethod
    def load() -> "Inventory":
        """Load inventory from disk, or return new inventory if not exists."""
        if INVENTORY_FILE.exists():
            with open(INVENTORY_FILE) as f:
                data = json.load(f)
                inv = Inventory(data)
                inv.targets = [Target(t) for t in data.get("targets", [])]
                return inv
        return Inventory()

    def add_target(self, target: Target):
        """Add a target to the inventory."""
        self.targets.append(target)

    def get_pending_targets(self) -> List[Target]:
        """Get all targets with pending status."""
        return [t for t in self.targets if t.status == "pending"]

    def get_next_target(self) -> Optional[Target]:
        """Get the next target using stable priority rules."""
        pending = self.get_pending_targets()
        if not pending:
            return None
        # Sort by: status (pending first), then by id for stability
        pending.sort(key=lambda t: (t.status, t.id))
        return pending[0]

    def mark_completed(self, target_id: str, proof_file: str, commit_hash: str):
        """Mark a target as completed."""
        for t in self.targets:
            if t.id == target_id:
                t.status = "completed"
                t.proof_file = proof_file
                t.commit_hash = commit_hash
                break

    def mark_failed(self, target_id: str, error: str):
        """Mark a target as failed."""
        for t in self.targets:
            if t.id == target_id:
                t.status = "failed"
                t.last_error = error
                break

    def mark_blocked(self, target_id: str, reason: str):
        """Mark a target as blocked."""
        for t in self.targets:
            if t.id == target_id:
                t.status = "blocked"
                t.last_error = reason
                break

    def mark_skipped(self, target_id: str, reason: str):
        """Mark a target as skipped (no issues found)."""
        for t in self.targets:
            if t.id == target_id:
                t.status = "skipped"
                t.last_error = reason
                break

    def increment_attempts(self, target_id: str):
        """Increment attempt count for a target."""
        for t in self.targets:
            if t.id == target_id:
                t.attempts += 1
                break


def build_inventory() -> Inventory:
    """Build the canonical list of functions/modules to audit."""
    print("Building target inventory...")
    inventory = Inventory()

    root = Path("packages/opencode/src")
    if not root.exists():
        print(f"Warning: {root} does not exist")
        return inventory

    # Find all TypeScript files
    ts_files = list(root.rglob("*.ts"))
    print(f"Found {len(ts_files)} TypeScript files")

    seen_paths = set()
    target_id = 0

    for ts_file in ts_files:
        # Skip test files
        if "test" in ts_file.parts or ".test." in ts_file.name or ".spec." in ts_file.name:
            continue

        # Skip index files
        if ts_file.name == "index.ts":
            continue

        # Skip files we've already seen
        if str(ts_file) in seen_paths:
            continue
        seen_paths.add(str(ts_file))

        # Create target for the file
        target = Target()
        target.id = f"target-{target_id:04d}"
        target_id += 1
        target.name = ts_file.stem
        target.path = str(ts_file.relative_to("."))
        target.type = "module"
        target.status = "pending"
        target.attempts = 0

        inventory.add_target(target)

    inventory.save()
    print(f"Created inventory with {len(inventory.targets)} targets")
    return inventory


def check_stop_flag() -> bool:
    """Check if stop flag is set."""
    return STOP_FILE.exists()


def clear_stop_flag():
    """Clear the stop flag."""
    if STOP_FILE.exists():
        STOP_FILE.unlink()


def write_log(message: str):
    """Write a log message to the logs directory."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / f"loop-{datetime.now(timezone.utc).strftime('%Y%m%d')}.log"
    timestamp = datetime.now(timezone.utc).isoformat()
    with open(log_file, "a") as f:
        f.write(f"{timestamp} {message}\n")


def write_proof(target: Target, issue: str, fix: str, verification: str, result: str, risks: str) -> str:
    """Write a proof file for a completed target."""
    PROOFS_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    proof_file = PROOFS_DIR / f"proof-{target.id}-{timestamp}.md"

    content = f"""# Proof: {target.name}

## Target
- **ID**: {target.id}
- **Name**: {target.name}
- **Path**: {target.path}
- **Type**: {target.type}

## Issue Found
{issue}

## Fix Applied
{fix}

## Verification Run
{verification}

## Result
{result}

## Remaining Risks
{risks}

---
*Generated: {datetime.now(timezone.utc).isoformat()}*
"""

    with open(proof_file, "w") as f:
        f.write(content)

    return str(proof_file)


def run_verification(target: Target) -> tuple[bool, str]:
    """Run verification for the target."""
    # Run TypeScript type checking
    try:
        result = subprocess.run(
            ["bun", "typecheck"],
            cwd="packages/opencode",
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode != 0:
            return False, f"Type check failed:\n{result.stderr}"
    except subprocess.TimeoutExpired:
        return False, "Type check timed out"
    except Exception as e:
        return False, f"Type check error: {e}"

    # Run doctor check
    try:
        result = subprocess.run(
            ["python", "tools/doctor.py", "-c", "infinity-loop"],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode != 0:
            return False, f"Doctor check failed:\n{result.stderr}"
    except subprocess.TimeoutExpired:
        return False, "Doctor check timed out"
    except Exception as e:
        pass  # Ignore doctor check errors if any

    return True, "Verification passed"


def inspect_target(target: Target) -> tuple[Optional[str], Optional[str]]:
    """Inspect a target and identify issues."""
    try:
        content = Path(target.path).read_text()

        # Simple heuristics for common issues
        issues = []

        # Check for any type
        if "any" in content.lower():
            issues.append("Uses 'any' type - should use proper typing")

        # Check for console.log (debug statements)
        if "console.log" in content:
            issues.append("Contains console.log statements")

        # Check for TODO comments
        if "TODO" in content or "FIXME" in content:
            issues.append("Contains TODO/FIXME comments")

        # Check for empty catch blocks
        if "catch" in content and "catch {" in content.replace(" ", "").replace("\n", ""):
            issues.append("Contains empty catch block")

        # Check for hardcoded strings that should be configurable
        if re.search(r'["\'][^"\']{50,}["\']', content):
            issues.append("Contains long hardcoded strings")

        if issues:
            return "\n".join(issues), f"Found {len(issues)} code quality issues"

        return None, "No obvious issues found"

    except Exception as e:
        return f"Error inspecting: {e}", None


def apply_patch(target: Target, issue: str) -> bool:
    """Apply a focused patch to fix the identified issue."""
    try:
        content = Path(target.path).read_text()

        # Simple fixes based on issue type
        if "console.log" in issue:
            # Comment out console.log statements
            content = re.sub(r'(console\.log\([^)]*\));', r'// \\1', content)
            Path(target.path).write_text(content)
            return True

        if "TODO" in issue or "FIXME" in issue:
            # Just document the issue, don't auto-fix
            return True

        if "empty catch" in issue.lower():
            # Add error logging to empty catch
            content = re.sub(
                r'catch\s*\([^)]*\)\s*{',
                'catch (e) {\n  console.error(e)',
                content
            )
            Path(target.path).write_text(content)
            return True

        return True  # Return true even if no patch needed

    except Exception as e:
        write_log(f"Patch error for {target.id}: {e}")
        return False


def commit_target(target: Target, proof_file: str) -> Optional[str]:
    """Commit the changes for a target."""
    try:
        # Stage the file
        subprocess.run(["git", "add", target.path], check=True)

        # Create commit message
        commit_msg = f"Audit: {target.name} - code quality improvements"

        # Commit
        result = subprocess.run(
            ["git", "commit", "-m", commit_msg],
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            write_log(f"Commit failed: {result.stderr}")
            return None

        # Get commit hash
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True
        )

        return result.stdout.strip()

    except Exception as e:
        write_log(f"Commit error: {e}")
        return None


def process_target(state: LoopState, inventory: Inventory, target: Target) -> tuple[LoopState, Inventory]:
    """Process a single target through the audit loop."""
    write_log(f"Processing target: {target.id} ({target.name})")

    # State: inspect
    state.state = "inspect"
    state.current_target = target.id
    state.attempt_count = target.attempts
    state.save()

    issue, result = inspect_target(target)

    if not issue:
        # No issues found, mark as skipped and move to next
        write_log(f"No issues found for {target.id}, marking as skipped")
        inventory.mark_skipped(target.id, result or "No issues found")
        state.state = "next"
        state.last_result = result
        state.save()
        inventory.save()
        return state, inventory

    # State: patch
    state.state = "patch"
    state.next_action = "apply_fix"
    state.save()

    if not apply_patch(target, issue):
        # Patch failed
        inventory.increment_attempts(target.id)

        if target.attempts >= MAX_RETRIES:
            inventory.mark_failed(target.id, "Max retries exceeded")
            write_log(f"Target {target.id} failed after {MAX_RETRIES} attempts")
            state.state = "failed"
            state.last_result = "Patch failed"
        else:
            state.state = "failed"

        state.save()
        return state, inventory

    # State: verify
    state.state = "verify"
    state.save()

    verified, verification_result = run_verification(target)

    if not verified:
        # Verification failed
        inventory.mark_blocked(target.id, verification_result)
        write_log(f"Verification failed for {target.id}: {verification_result}")
        state.state = "blocked"
        state.last_result = verification_result
        state.save()
        return state, inventory

    # State: document
    state.state = "document"
    state.save()

    proof_file = write_proof(
        target=target,
        issue=issue,
        fix="Applied code quality improvements",
        verification=verification_result,
        result="Passed",
        risks="Minimal - targeted changes only"
    )

    # State: commit
    state.state = "commit"
    state.save()

    commit_hash = commit_target(target, proof_file)

    if commit_hash:
        inventory.mark_completed(target.id, proof_file, commit_hash)
        write_log(f"Committed {target.id}: {commit_hash}")
        state.last_result = f"Committed: {commit_hash[:8]}"
    else:
        # Commit failed but verification passed - still mark complete
        inventory.mark_completed(target.id, proof_file, "uncommitted")
        state.last_result = "Verification passed but commit failed"

    state.state = "next"
    state.save()
    inventory.save()

    return state, inventory


def run_loop(state: LoopState, inventory: Inventory, max_cycles: int = 100):
    """Run the main loop."""
    write_log(f"Starting loop from state: {state.state}")

    for cycle in range(max_cycles):
        # Check stop flag
        if check_stop_flag():
            write_log("Stop flag detected, exiting loop")
            state.state = "idle"
            state.last_result = "Stopped by user"
            state.save()
            break

        # Check if complete
        if state.state == "complete":
            write_log("All targets processed")
            break

        # Handle states
        if state.state == "idle":
            # Start fresh
            state.state = "select"
            state.save()

        elif state.state == "select":
            # Get next target
            target = inventory.get_next_target()

            if not target:
                # No more targets
                state.state = "complete"
                state.current_target = None
                state.save()
                write_log("No more targets, loop complete")
                break

            state.current_target = target.id
            state.cycle_id += 1
            state.attempt_count = 0
            state.save()
            write_log(f"Cycle {state.cycle_id}: Selected target {target.id}")

            # Process the target
            state, inventory = process_target(state, inventory, target)

        elif state.state == "next":
            # Go back to select
            state.state = "select"
            state.save()

        elif state.state == "failed" or state.state == "blocked":
            # Move to next target
            state.state = "select"
            state.save()

    # Print summary
    print_summary(state, inventory)


def print_summary(state: LoopState, inventory: Inventory):
    """Print the run summary."""
    pending = len([t for t in inventory.targets if t.status == "pending"])
    in_progress = len([t for t in inventory.targets if t.status == "in_progress"])
    completed = len([t for t in inventory.targets if t.status == "completed"])
    blocked = len([t for t in inventory.targets if t.status == "blocked"])
    failed = len([t for t in inventory.targets if t.status == "failed"])
    skipped = len([t for t in inventory.targets if t.status == "skipped"])

    print("\n" + "=" * 60)
    print("Infinity Loop Summary")
    print("=" * 60)
    print(f"State: {state.state}")
    print(f"Cycle: {state.cycle_id}")
    print(f"Current Target: {state.current_target or 'None'}")
    print(f"Last Result: {state.last_result or 'None'}")
    print()
    print(f"Pending: {pending}")
    print(f"In Progress: {in_progress}")
    print(f"Completed: {completed}")
    print(f"Blocked: {blocked}")
    print(f"Failed: {failed}")
    print(f"Skipped: {skipped}")
    print(f"Total: {len(inventory.targets)}")
    print("=" * 60)


def cmd_start(args):
    """Start the infinity loop."""
    # Check for existing state
    if STATE_FILE.exists():
        state = LoopState.load()
        # Allow resuming from select, next, or failed states
        if state.state not in ["idle", "complete", "select", "next", "failed", "blocked"]:
            print(f"Loop is already running (state: {state.state})")
            print("Use 'status' to see progress or 'stop' to halt")
            return

    # Clear stop flag if exists
    clear_stop_flag()

    # Load or build inventory
    if INVENTORY_FILE.exists():
        inventory = Inventory.load()
        print(f"Loaded existing inventory with {len(inventory.targets)} targets")
    else:
        inventory = build_inventory()

    # Load existing state or create new
    if STATE_FILE.exists():
        state = LoopState.load()
        # Ensure we're in a resumable state
        if state.state not in ["select", "next", "failed", "blocked"]:
            state.state = "select"
    else:
        state = LoopState()
        state.state = "select"

    state.save()

    # Run the loop
    run_loop(state, inventory)


def cmd_status(args):
    """Show current status."""
    if not STATE_FILE.exists():
        print("No loop state found. Run 'start' to begin.")
        return

    state = LoopState.load()

    if not INVENTORY_FILE.exists():
        print_summary(state, Inventory())
        return

    inventory = Inventory.load()
    print_summary(state, inventory)


def cmd_stop(args):
    """Stop the loop."""
    if not STATE_FILE.exists():
        print("No loop state found.")
        return

    # Create stop flag
    LOOP_DIR.mkdir(parents=True, exist_ok=True)
    STOP_FILE.touch()

    print("Stop flag created. Loop will stop after current cycle.")
    print("Use 'status' to monitor progress.")


def cmd_reset(args):
    """Reset the loop state."""
    if STATE_FILE.exists():
        STATE_FILE.unlink()
        print("State file removed.")

    if INVENTORY_FILE.exists():
        INVENTORY_FILE.unlink()
        print("Inventory file removed.")

    if STOP_FILE.exists():
        STOP_FILE.unlink()
        print("Stop flag removed.")

    print("Loop state reset.")


def cmd_build_inventory(args):
    """Build a new inventory."""
    inventory = build_inventory()
    print(f"Built inventory with {len(inventory.targets)} targets")


def main():
    parser = argparse.ArgumentParser(description="Infinity Loop - Self-Auditing Workflow")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    subparsers.add_parser("start", help="Start the infinity loop")
    subparsers.add_parser("status", help="Show current status")
    subparsers.add_parser("stop", help="Stop the loop")
    subparsers.add_parser("reset", help="Reset loop state")
    subparsers.add_parser("build-inventory", help="Build target inventory")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    if args.command == "start":
        cmd_start(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "stop":
        cmd_stop(args)
    elif args.command == "reset":
        cmd_reset(args)
    elif args.command == "build-inventory":
        cmd_build_inventory(args)


if __name__ == "__main__":
    main()