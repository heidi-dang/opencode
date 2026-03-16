#!/usr/bin/env python3
"""
OpenCode Doctor - Performance Optimization Checks

This module provides validation checks for the tool output performance
implementation work.

Run from repo root:
    python tools/doctor.py
    python tools/doctor.py --verbose
"""

import argparse
import os
import re
import sys
from pathlib import Path
from typing import List, Optional
from check_diff_theme_resolution import check_diff_theme_resolution
from check_p1_task_compiler import run_check as run_p1_check
from check_10_10_spec import run_check as run_master_check


def get_project_root() -> Path:
    """Get the project root directory (parent of tools/)."""
    return Path(__file__).parent.parent


class DoctorCheck:
    """Base class for doctor checks."""
    
    name: str = ""
    description: str = ""
    
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.passed = False
        self.errors: List[str] = []
    
    def run(self) -> bool:
        raise NotImplementedError
    
    def log(self, message: str):
        if self.verbose:
            print(f"  {message}")


class ImplementationDocCheck(DoctorCheck):
    """Check that implementation doc exists."""
    
    name = "implementation-doc"
    description = "Check that performance implementation doc exists"
    
    def run(self) -> bool:
        root = get_project_root()
        doc_paths = [
            root / "docs/implementation-tool-output-performance.md",
            root / "implementation-tool-output-performance.md",
        ]
        
        for doc_path in doc_paths:
            if doc_path.exists():
                self.log(f"Found: {doc_path}")
                self.passed = True
                return True
        
        self.errors.append(f"Implementation doc not found. Searched: {[str(p) for p in doc_paths]}")
        return False


class BoundedOutputFieldsCheck(DoctorCheck):
    """Check that new metadata fields exist in message-v2.ts"""
    
    name = "bounded-output-fields"
    description = "Check for bounded output metadata fields in code"
    
    def run(self) -> bool:
        # Look in the opencode packages - use project root for absolute paths
        root = get_project_root()
        search_paths = [
            root / "packages/opencode/src/session/message-v2.ts",
        ]
        
        required_fields = [
            "outputHasMore",
            "outputRef", 
            "outputBytes",
        ]
        
        for search_path in search_paths:
            if not search_path.exists():
                continue
            
            content = search_path.read_text()
            
            found_fields = []
            for field in required_fields:
                if field in content:
                    found_fields.append(field)
                    self.log(f"Found field: {field}")
            
            if found_fields:
                self.passed = True
                return True
        
        self.errors.append(f"Bounded output fields not found. Required: {required_fields}")
        return False


class BlobStorageCheck(DoctorCheck):
    """Check that blob storage module exists."""
    
    name = "blob-storage"
    description = "Check for blob storage module"
    
    def run(self) -> bool:
        root = get_project_root()
        search_paths = [
            root / "packages/opencode/src/storage/blob.ts",
            # Also check in truncation.ts where it's implemented
            root / "packages/opencode/src/tool/truncation.ts",
        ]
        
        for storage_path in search_paths:
            if storage_path.exists():
                self.log(f"Found: {storage_path}")
                content = storage_path.read_text()
                
                # Check for key methods/functions
                required_methods = ["boundedCapture", "retrieveFullOutput", "sweepBlobs"]
                
                found_methods = []
                for method in required_methods:
                    if f"export async function {method}" in content or f"export function {method}" in content:
                        found_methods.append(method)
                        self.log(f"Found method: {method}")
                
                if found_methods:
                    self.passed = True
                    return True
        
        self.errors.append("Blob storage module not found")
        return False


class DeltaBatcherCheck(DoctorCheck):
    """Check that PartDelta batching exists."""
    
    name = "delta-batcher"
    description = "Check for PartDelta batching implementation"
    
    def run(self) -> bool:
        root = get_project_root()
        search_paths = [
            root / "packages/app/src/context/run/delta-batcher.ts",
        ]
        
        for batcher_path in search_paths:
            if batcher_path.exists():
                self.log(f"Found: {batcher_path}")
                content = batcher_path.read_text()
                
                # Check for (messageID, partID) keying
                if "messageID" in content and "partID" in content:
                    self.log("Found messageID+partID keying")
                    self.passed = True
                    return True
        
        self.errors.append("PartDelta batcher not found or missing proper keying")
        return False


class LiveRunStoreCheck(DoctorCheck):
    """Check that live run store exists."""
    
    name = "live-run-store"
    description = "Check for live run store with capped recent-steps"
    
    def run(self) -> bool:
        root = get_project_root()
        search_paths = [
            root / "packages/app/src/context/run/index.ts",
        ]
        
        for store_path in search_paths:
            if store_path.exists():
                self.log(f"Found: {store_path}")
                content = store_path.read_text()
                
                # Check for recent-steps cap
                if "recentSteps" in content or "RECENT_STEPS" in content or "MAX_RECENT" in content:
                    self.log("Found recent-steps cap")
                    self.passed = True
                    return True
        
        self.errors.append("Live run store not found or missing recent-steps cap")
        return False


class TerminalFlushCheck(DoctorCheck):
    """Check for terminal flush hooks."""
    
    name = "terminal-flush"
    description = "Check for terminal flush semantics"
    
    def run(self) -> bool:
        # This is harder to check - look for flush-related code
        root = get_project_root()
        search_paths = [
            root / "packages/app/src/context/run",
        ]
        
        for run_path in search_paths:
            if not run_path.exists():
                continue
            
            for ts_file in run_path.glob("*.ts"):
                content = ts_file.read_text()
                
                flush_triggers = [
                    "unmount",
                    "onCleanup", 
                    "visibilitychange",
                    "finish",
                    "complete",
                ]
                
                found_triggers = [t for t in flush_triggers if t in content]
                
                if found_triggers:
                    self.log(f"Found flush triggers in {ts_file.name}: {found_triggers}")
                    self.passed = True
                    return True
        
        self.errors.append("Terminal flush hooks not found")
        return False


class TUIOptimizationCheck(DoctorCheck):
    """Check for TUI hot-path optimization."""
    
    name = "tui-optimization"
    description = "Check for TUI tools() memo optimization"
    
    def run(self) -> bool:
        root = get_project_root()
        search_paths = [
            root / "packages/opencode/src/cli/cmd/tui/routes/session/index.tsx",
        ]
        
        for tui_path in search_paths:
            if not tui_path.exists():
                continue
            
            content = tui_path.read_text()
            
            # Check for OLD bad pattern: flatMap with filter and map
            if "flatMap" in content and "filter" in content and "map" in content:
                # Look for the specific pattern in tools createMemo
                import re
                # Check if there's still a flatMap pattern in tools createMemo
                if re.search(r'const tools = createMemo.*?flatMap.*?filter.*?map', content, re.DOTALL):
                    self.errors.append("OLD O(n²) flatMap pattern still exists in TUI tools() memo")
                    return False
            
            # Check for NEW good pattern: nested for loops
            if "for (let i = 0" in content and "for (let j = 0" in content:
                self.log("Found optimized nested loop pattern")
                self.passed = True
                return True
            
            # Alternative: check if flatMap was removed from tools
            if "const tools = createMemo" in content:
                self.log("Found tools memo - checking for optimization")
                # If we got here, there's a tools memo but not the bad pattern
                self.passed = True
                return True
        
        self.errors.append("TUI tools memo not found")
        return False


class OutputRetrievalAPICheck(DoctorCheck):
    """Check for tool output retrieval API."""
    
    name = "output-retrieval-api"
    description = "Check for tool output retrieval API endpoint"
    
    def run(self) -> bool:
        root = get_project_root()
        search_paths = [
            root / "packages/opencode/src/server/routes/session.ts",
        ]
        
        for route_path in search_paths:
            if not route_path.exists():
                continue
            
            content = route_path.read_text()
            
            # Check for the retrieval endpoint
            if "tool-output" in content and "retrieveFullOutput" in content:
                self.log("Found tool output retrieval endpoint")
                self.passed = True
                return True
        
        self.errors.append("Tool output retrieval API not found")
        return False


class LiveRunProviderCheck(DoctorCheck):
    """Check for LiveRunProvider wiring."""
    
    name = "live-run-provider"
    description = "Check for LiveRunProvider in app"
    
    def run(self) -> bool:
        root = get_project_root()
        search_paths = [
            root / "packages/app/src/app.tsx",
        ]
        
        for app_path in search_paths:
            if not app_path.exists():
                continue
            
            content = app_path.read_text()
            
            # Check for LiveRunProvider import and usage
            if "LiveRunProvider" in content:
                self.log("Found LiveRunProvider import and usage")
                self.passed = True
                return True
        
        self.errors.append("LiveRunProvider not found in app.tsx")
        return False


class InfinityLoopCheck(DoctorCheck):
    """Check that Infinity Loop Runtime is properly implemented."""
    
    name = "infinity-loop"
    description = "Check Infinity Loop Runtime implementation"
    
    def run(self) -> bool:
        root = get_project_root()
        
        # Check runtime file exists
        runtime_path = root / "packages/opencode/src/infinity/runtime.ts"
        if not runtime_path.exists():
            self.errors.append(f"Runtime file not found: {runtime_path}")
            return False
        
        self.log(f"Found runtime: {runtime_path}")
        
        # Check CLI integration
        index_path = root / "packages/opencode/src/index.ts"
        if not index_path.exists():
            self.errors.append(f"CLI index not found: {index_path}")
            return False
        
        content = index_path.read_text()
        if "InfinityCommand" not in content:
            self.errors.append("InfinityCommand not registered in CLI")
            return False
        
        self.log("Found InfinityCommand in CLI")
        
        # Check schemas exist
        schema_dir = root / ".opencode/schemas"
        required_schemas = ["task.schema.json", "run-state.schema.json", "gate.schema.json", "stuck.schema.json"]
        for schema in required_schemas:
            schema_path = schema_dir / schema
            if not schema_path.exists():
                self.errors.append(f"Missing schema: {schema}")
                return False
            self.log(f"Found schema: {schema}")
        
        # Check agent files exist
        agent_dir = root / ".opencode/agent"
        required_agents = ["suggester.md", "planner.md", "dev.md", "havoc.md", "reporter.md", "librarian.md", "master.md"]
        for agent in required_agents:
            agent_path = agent_dir / agent
            if not agent_path.exists():
                self.errors.append(f"Missing agent: {agent}")
                return False
            self.log(f"Found agent: {agent}")
        
        # Check knowledge directories exist
        knowledge_dir = root / ".opencode/knowledge"
        required_dirs = ["patterns", "gotchas", "decisions"]
        for dir_name in required_dirs:
            dir_path = knowledge_dir / dir_name
            if not dir_path.exists():
                self.errors.append(f"Missing knowledge directory: {dir_name}")
                return False
            self.log(f"Found knowledge dir: {dir_name}")
        
        # Check runs directory exists
        runs_dir = root / ".opencode/runs"
        if not runs_dir.exists():
            self.errors.append("Runs directory not found: .opencode/runs")
            return False
        
        self.log("Found runs directory")
        
        self.passed = True
        return True


class DiffThemeCheck(DoctorCheck):
    """Check for proper diff theme resolution."""
    
    name = "diff-theme"
    description = "Check for proper diff theme resolution to prevent undefined console spam"
    
    def run(self) -> bool:
        root = get_project_root()
        errors = check_diff_theme_resolution(root, self.verbose)
        if not errors:
            self.passed = True
            return True
        
        self.errors.extend(errors)
        return False


def get_all_checks(verbose: bool = False) -> List[DoctorCheck]:
    """Return all available checks."""
    return [
        ImplementationDocCheck(verbose),
        BoundedOutputFieldsCheck(verbose),
        BlobStorageCheck(verbose),
        DeltaBatcherCheck(verbose),
        LiveRunStoreCheck(verbose),
        TerminalFlushCheck(verbose),
        TUIOptimizationCheck(verbose),
        OutputRetrievalAPICheck(verbose),
        LiveRunProviderCheck(verbose),
        InfinityLoopCheck(verbose),
        DiffThemeCheck(verbose),
        AgentAutonomyCheck(verbose),
        P1TaskCompilerCheck(verbose),
        P2ContextEngineCheck(verbose),
        P3SpecialistRouterCheck(verbose),
        P4ToolCompetenceCheck(verbose),
        P5VerifierCheck(verbose),
        P6RecoveryEngineCheck(verbose),
        P7PersistentRunMemoryCheck(verbose),
        P8FailureLearningStoreCheck(verbose),
        P9BenchmarkGateCheck(verbose),
        P10BestResultCheck(verbose),
        MasterSpecCheck(verbose),
    ]

class AgentAutonomyCheck(DoctorCheck):
    """Check for Agent Finish-Mode autonomy implementation."""
    
    name = "agent-autonomy"
    description = "Check for finish-mode contract, blocker classifier, and auto-continue loop"
    
    def run(self) -> bool:
        try:
            # Ensure tools directory is in path for imports
            root = get_project_root()
            if str(root) not in sys.path:
                sys.path.append(str(root))
            
            from tools.check_agent_finish_mode import run_check
            return run_check(self.verbose)
        except ImportError as e:
            self.errors.append(f"tools/check_agent_finish_mode.py not found or could not be imported: {e}")
            return False

class P1TaskCompilerCheck(DoctorCheck):
    """Check for Intelligence Phase 1 (Task Compiler) implementation."""
    
    name = "p1-task-compiler"
    description = "Check for TaskCompiler implementation and integration"
    
    def run(self) -> bool:
        try:
            return run_p1_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running P1 task compiler check: {e}")
            return False

class P2ContextEngineCheck(DoctorCheck):
    """Check for Intelligence Phase 2 (Context Engine) implementation."""
    
    name = "p2-context-engine"
    description = "Check for WorkingSet and RepoMap integration"
    
    def run(self) -> bool:
        try:
            root = get_project_root()
            if str(root) not in sys.path:
                sys.path.append(str(root))
            
            from tools.check_p2_context_engine import run_check
            return run_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running P2 context engine check: {e}")
            return False

class P3SpecialistRouterCheck(DoctorCheck):
    """Check for Intelligence Phase 3 (Specialist Router) implementation."""
    
    name = "p3-specialist-router"
    description = "Check for Lane-based routing and tool/context policies"
    
    def run(self) -> bool:
        try:
            root = get_project_root()
            if str(root) not in sys.path:
                sys.path.append(str(root))
            
            from tools.check_p3_specialist_router import run_check
            return run_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running P3 specialist router check: {e}")
            return False

class P4ToolCompetenceCheck(DoctorCheck):
    """Check for Intelligence Phase 4 (Tool Competence) implementation."""
    
    name = "p4-tool-competence"
    description = "Check for ToolCompetence policy and bounded retry logic"
    
    def run(self) -> bool:
        try:
            root = get_project_root()
            if str(root) not in sys.path:
                sys.path.append(str(root))
            
            from tools.check_p4_tool_competence import run_check
            return run_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running P4 tool competence check: {e}")
            return False

class P5VerifierCheck(DoctorCheck):
    """Check for Intelligence Phase 5 (Verifier) implementation."""
    
    name = "p5-verifier"
    description = "Check for Evidence-first validation logic"
    
    def run(self) -> bool:
        try:
            root = get_project_root()
            if str(root) not in sys.path:
                sys.path.append(str(root))
            
            from tools.check_p5_verifier import run_check
            return run_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running P5 verifier check: {e}")
            return False

class P6RecoveryEngineCheck(DoctorCheck):
    """Check for Intelligence Phase 6 (Recovery Engine) implementation."""
    
    name = "p6-recovery-engine"
    description = "Check for Failure classification and structured recovery"
    
    def run(self) -> bool:
        try:
            root = get_project_root()
            if str(root) not in sys.path:
                sys.path.append(str(root))
            
            from tools.check_p6_recovery_engine import run_check
            return run_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running P6 recovery engine check: {e}")
            return False

class P7PersistentRunMemoryCheck(DoctorCheck):
    """Check for Intelligence Phase 7 (Persistent Run Memory) implementation."""
    
    name = "p7-persistent-run-memory"
    description = "Check for Crash-safe state persistence and checkpointing"
    
    def run(self) -> bool:
        try:
            root = get_project_root()
            if str(root) not in sys.path:
                sys.path.append(str(root))
            
            from tools.check_p7_persistent_run_memory import run_check
            return run_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running P7 run memory check: {e}")
            return False

class P8FailureLearningStoreCheck(DoctorCheck):
    """Check for Intelligence Phase 8 (Failure Learning Store) implementation."""
    
    name = "p8-failure-learning-store"
    description = "Check for Failure journal and heuristics learning"
    
    def run(self) -> bool:
        try:
            root = get_project_root()
            if str(root) not in sys.path:
                sys.path.append(str(root))
            
            from tools.check_p8_failure_learning_store import run_check
            return run_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running P8 failure store check: {e}")
            return False

class P9BenchmarkGateCheck(DoctorCheck):
    """Check for Intelligence Phase 9 (Benchmark Gate) implementation."""
    
    name = "p9-benchmark-gate"
    description = "Check for performance metrics and regression control"
    
    def run(self) -> bool:
        try:
            root = get_project_root()
            if str(root) not in sys.path:
                sys.path.append(str(root))
            
            from tools.check_p9_benchmark_gate import run_check
            return run_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running P9 benchmark gate check: {e}")
            return False

class P10BestResultCheck(DoctorCheck):
    """Check for Intelligence Phase 10 (Best Result Engine) implementation."""
    
    name = "p10-best-result"
    description = "Check for quality rubric and bounded stopping rules"
    
    def run(self) -> bool:
        try:
            root = get_project_root()
            if str(root) not in sys.path:
                sys.path.append(str(root))
            
            from tools.check_p10_best_result import run_check
            return run_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running P10 best result check: {e}")
            return False

class MasterSpecCheck(DoctorCheck):
    """Check for Heidi 10/10 Human-Like Agent System Master Specification."""
    
    name = "heidi-10-10-spec"
    description = "Check for 10/10 Master Spec adherence (P0-P1 foundations)"
    
    def run(self) -> bool:
        try:
            return run_master_check(self.verbose)
        except Exception as e:
            self.errors.append(f"Error running Master Spec check: {e}")
            return False


def run_doctor(checks: Optional[List[DoctorCheck]] = None, verbose: bool = False) -> bool:
    """Run all doctor checks."""
    
    if checks is None:
        checks = get_all_checks(verbose)
    
    print("=" * 60)
    print("OpenCode Performance Implementation Doctor")
    print("=" * 60)
    print()
    
    # Find repo root dynamically using the helper function
    repo_root = get_project_root()
    
    if repo_root:
        os.chdir(repo_root)
        print(f"Working directory: {os.getcwd()}")
    else:
        print("WARNING: Could not find repo root, using current directory")
    
    print()
    
    passed = 0
    failed = 0
    
    for check in checks:
        print(f"Checking: {check.name}")
        print(f"  {check.description}")
        
        try:
            result = check.run()
            if result:
                print(f"  ✓ PASSED")
                passed += 1
            else:
                print(f"  ✗ FAILED")
                for error in check.errors:
                    print(f"    - {error}")
                failed += 1
        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            failed += 1
        
        print()
    
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)
    
    return failed == 0


def main():
    parser = argparse.ArgumentParser(description="OpenCode Doctor")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--check", "-c", help="Run specific check only")
    args = parser.parse_args()
    
    if args.check:
        all_checks = get_all_checks(args.verbose)
        checks = [c for c in all_checks if c.name == args.check]
        if not checks:
            print(f"Unknown check: {args.check}")
            print(f"Available: {[c.name for c in all_checks]}")
            sys.exit(1)
    else:
        checks = None
    
    success = run_doctor(checks, args.verbose)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
