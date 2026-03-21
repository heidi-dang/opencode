from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Check:
    name: str
    ok: bool
    detail: str


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _has(path: Path, *needles: str) -> Check:
    if not path.exists():
        return Check(str(path), False, "missing")
    text = _text(path)
    missing = [needle for needle in needles if needle not in text]
    if missing:
        return Check(str(path), False, f"missing markers: {', '.join(missing)}")
    return Check(str(path), True, "ok")


def run(root: Path) -> list[Check]:
    return [
        _has(
            root / "packages/opencode/src/heidi/memory.ts",
            "export const HeidiMemoryRules",
            "export function inspect",
            'name: "credentials"',
            'name: "entropy"',
        ),
        _has(
            root / "packages/opencode/test/heidi/memory-rules.test.ts",
            '"flags obvious secrets as unsafe"',
            '"keeps obvious false positives safe"',
            '"marks long opaque strings as unknown"',
        ),
        _has(
            root / "packages/opencode/src/tool/task.ts",
            "HeidiHealth.conflict()",
            "HeidiHealth.timeout()",
        ),
        _has(
            root / "packages/opencode/src/server/routes/global.ts",
            "heidi: HeidiHealthSummary",
            "heidi: HeidiHealth.summary()",
        ),
        _has(
            root / ".local/implementation-heidi-stability-hardening.md",
            "## Rollback Proof",
            "## Timeout Design",
            "## Conflict Model",
            "## Health Payload",
            "## Limitations",
        ),
    ]