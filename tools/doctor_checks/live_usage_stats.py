from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _read(path: str) -> str:
  return (ROOT / path).read_text(encoding="utf-8")


def run() -> tuple[bool, str, str]:
  name = "live-usage-stats"

  theater = _read("packages/ui/src/components/thinking-theater.tsx")
  css = _read("packages/ui/src/components/thinking-theater.css")
  session = _read("packages/ui/src/components/session-turn.tsx")

  checks = [
    "UsageBlock" in theater,
    "usage={" in theater,
    "data-slot=\"usage-block\"" in theater,
    "data-slot=\"usage-tokens\"" in theater,
    "data-slot=\"usage-cost\"" in theater,
    "data-slot=\"usage-pr-progress\"" in theater,
    "[data-slot=\"usage-block\"]" in css,
    "[data-slot=\"usage-tokens\"]" in css,
    "[data-slot=\"usage-cost\"]" in css,
    "[data-slot=\"usage-pr-progress\"]" in css,
    "usage={turnUsage()}" in session,
    "const turnUsage = createMemo(" in session,
  ]

  ok = all(checks)
  if ok:
    return (True, name, "live usage stats component, vertical layout, and wiring present")

  return (False, name, "missing live usage stats implementation artifacts")
