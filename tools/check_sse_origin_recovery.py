import sys
from pathlib import Path


def get_root() -> Path:
    return Path(__file__).parent.parent


def run_check(verbose: bool = False) -> bool:
    root = get_root()
    ok = True
    errs: list[str] = []

    def log(msg: str):
        if verbose:
            print(f"  {msg}")

    global_route = root / "packages" / "opencode" / "src" / "server" / "routes" / "global.ts"
    server_ts = root / "packages" / "opencode" / "src" / "server" / "server.ts"
    entry_tsx = root / "packages" / "app" / "src" / "entry.tsx"
    global_sdk = root / "packages" / "app" / "src" / "context" / "global-sdk.tsx"
    session_tsx = root / "packages" / "app" / "src" / "pages" / "session.tsx"

    for file in [global_route, server_ts, entry_tsx, global_sdk, session_tsx]:
        if not file.exists():
            errs.append(f"Missing required file: {file}")
            ok = False

    if not ok:
        for err in errs:
            print(f"    ✗ {err}")
        return False

    g = global_route.read_text()
    s = server_ts.read_text()
    e = entry_tsx.read_text()
    c = global_sdk.read_text()
    p = session_tsx.read_text()

    # SSE route hardening: guarded writes, heartbeat cleanup, expected disconnect handling
    if "expected disconnect" not in g or "expected disconnect" not in s:
        errs.append("SSE routes must classify expected disconnects as non-fatal")
        ok = False
    if "stream.onAbort" not in g or "stream.onAbort" not in s:
        errs.append("SSE routes must register onAbort cleanup")
        ok = False
    if "server.heartbeat" not in g or "server.heartbeat" not in s:
        errs.append("SSE routes must include heartbeat writes")
        ok = False

    # Origin resolution: reject stale hardcoded 4096 fallback pattern
    if "location.hostname.includes(\"opencode.ai\")" in e and "localhost:4096" in e:
        errs.append("entry.tsx still contains stale opencode.ai -> localhost:4096 fallback")
        ok = False
    if "console.info(\"[opencode] backend origin\"" not in e:
        errs.append("entry.tsx missing backend origin startup diagnostic")
        ok = False

    # Reconnect hardening: bounded backoff+jitter markers
    for token in ["RETRY_BASE_MS", "RETRY_MAX_MS", "RETRY_COOLDOWN_MS", "RETRY_BURST"]:
        if token not in c:
            errs.append(f"global-sdk reconnect hardening missing token: {token}")
            ok = False

    # Stale session self-heal on 404
    if "err?.statusCode === 404" not in p and "err?.status === 404" not in p:
        errs.append("session.tsx missing 404 stale-session detection")
        ok = False
    if ".session\n                  .create()" not in p and ".session.create()" not in p:
        errs.append("session.tsx missing stale-session auto-create recovery")
        ok = False
    if "Recovered from stale session" not in p:
        errs.append("session.tsx missing stale-session recovery warning")
        ok = False

    if ok:
        log("SSE hardening markers found")
        log("Origin resolution hardening found")
        log("Reconnect hardening markers found")
        log("Stale session self-heal markers found")
        return True

    for err in errs:
        print(f"    ✗ {err}")
    return False


if __name__ == "__main__":
    passed = run_check(verbose=True)
    sys.exit(0 if passed else 1)
