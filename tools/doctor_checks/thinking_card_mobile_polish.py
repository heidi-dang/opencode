from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _read(path: str) -> str:
  return (ROOT / path).read_text(encoding="utf-8")


def run() -> tuple[bool, str, str]:
  name = "thinking-card-mobile-polish"

  theater_tsx = _read("packages/ui/src/components/thinking-theater.tsx")
  theater_css = _read("packages/ui/src/components/thinking-theater.css")
  orb_tsx = _read("packages/ui/src/components/heidi-orb.tsx")
  wording = _read("packages/ui/src/lib/thinking-wording.ts")
  doc = ROOT / ".local/implementation-thinking-card-mobile-polish.md"

  checks = [
    'data-slot="theater-main"' in theater_tsx,
    'data-slot="theater-subtext"' in theater_tsx,
    'data-slot="theater-chips"' in theater_tsx,
    "rendered = createMemo" in theater_tsx,
    "+${rest} more" in theater_tsx,
    "max-width: 430px" in theater_css,
    'data-slot="orb-face"' in orb_tsx,
    'data-slot="orb-shine"' in orb_tsx,
    '"focused"' in wording,
    '"warning"' in wording,
    doc.exists(),
  ]

  ok = all(checks)
  if ok:
    return (True, name, "structure, overflow logic, orb states, and doc present")

  return (False, name, "missing required thinking card/orb/doc artifacts")
