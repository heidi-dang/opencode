from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _read(path: str) -> str:
  return (ROOT / path).read_text(encoding="utf-8")


def run() -> tuple[bool, str, str]:
  name = "live-activity-chips"

  session = _read("packages/ui/src/components/session-turn.tsx")
  theater = _read("packages/ui/src/components/thinking-theater.tsx")
  css = _read("packages/ui/src/components/thinking-theater.css")
  doc = ROOT / ".local/implementation-live-activity-chips.md"

  checks = [
    "LiveActivity" in theater,
    "kind: \"tool\" | \"command\" | \"subagent\" | \"verify\"" in theater,
    ("liveActivities = createMemo" in session) or ("acts = createMemo" in session),
    ("toolKind(" in session) or ("function kind(" in session),
    ("commandLabel(" in session) or ("function cmd(" in session),
    "cap = createMemo" in theater,
    "+{more()} active" in theater,
    "fallback(" in theater,
    "&[data-status=\"running\"]" in css,
    "&[data-status=\"completed\"]" in css,
    "&[data-status=\"error\"]" in css,
    doc.exists(),
  ]

  ok = all(checks)
  if ok:
    return (True, name, "live activity chip model, mapping, caps, fallback, and doc present")

  return (False, name, "missing live activity chip implementation artifacts")
