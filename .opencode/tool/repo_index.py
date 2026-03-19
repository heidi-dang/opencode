#!/usr/bin/env python3
import argparse
import fnmatch
import json
import os
import re
import sqlite3
import subprocess
import time
from collections import Counter, defaultdict
from pathlib import Path

EXT = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".swift",
    ".cs",
}

SKIP = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
    ".idea",
    ".vscode",
    "target",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
}

SYM = [
    (re.compile(r"^\s*export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)"), "function", True),
    (re.compile(r"^\s*(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)"), "function", False),
    (re.compile(r"^\s*export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)"), "class", True),
    (re.compile(r"^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)"), "class", False),
    (re.compile(r"^\s*export\s+(?:interface|type|enum)\s+([A-Za-z_][A-Za-z0-9_]*)"), "type", True),
    (re.compile(r"^\s*(?:interface|type|enum)\s+([A-Za-z_][A-Za-z0-9_]*)"), "type", False),
    (re.compile(r"^\s*export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\("), "function", True),
    (re.compile(r"^\s*const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\("), "function", False),
    (re.compile(r"^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("), "function", False),
    (re.compile(r"^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\b"), "class", False),
    (re.compile(r"^\s*pub\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("), "function", True),
    (re.compile(r"^\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("), "function", False),
    (re.compile(r"^\s*pub\s+(?:struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)"), "type", True),
    (re.compile(r"^\s*(?:struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)"), "type", False),
    (re.compile(r"^\s*func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("), "function", False),
    (re.compile(r"^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s+struct\b"), "type", False),
]

IMP = [
    re.compile(r"^\s*import\s+.+?\s+from\s+[\"']([^\"']+)[\"']"),
    re.compile(r"^\s*import\s+[\"']([^\"']+)[\"']"),
    re.compile(r"^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+"),
    re.compile(r"require\(\s*[\"']([^\"']+)[\"']\s*\)"),
]


def rel(root: Path, file: Path) -> str:
    return file.relative_to(root).as_posix()


def files(root: Path, glob: str):
    out = []
    for cur, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP and not d.startswith(".")]
        base = Path(cur)
        for name in names:
            file = base / name
            if file.suffix not in EXT:
                continue
            rp = rel(root, file)
            if not fnmatch.fnmatch(rp, glob):
                continue
            out.append(file)
    return sorted(out)


def imports(text: str):
    out = []
    for line in text.splitlines():
        for pat in IMP:
            m = pat.search(line)
            if m:
                out.append(m.group(1))
    seen = set()
    return [x for x in out if not (x in seen or seen.add(x))]


def doc(lines, idx):
    buf = []
    i = idx - 1
    while i >= 0 and len(buf) < 6:
        line = lines[i].strip()
        if not line:
            if not buf:
                i -= 1
                continue
            break
        if line.startswith("//") or line.startswith("#") or line.startswith("/*") or line.startswith("*"):
            buf.append(line.lstrip("/*# "))
            i -= 1
            continue
        break
    buf.reverse()
    return " ".join(buf).strip()


def scan(root: Path, file: Path):
    text = file.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    rp = rel(root, file)
    syms = []
    for idx, line in enumerate(lines):
        for pat, kind, pub in SYM:
            m = pat.search(line)
            if not m:
                continue
            name = m.group(1)
            exp = pub
            if file.suffix == ".py":
                exp = not name.startswith("_")
            if not pub and re.search(r"\bexport\b", line):
                exp = True
            syms.append(
                {
                    "name": name,
                    "kind": kind,
                    "path": rp,
                    "exported": 1 if exp else 0,
                    "signature": line.strip()[:240],
                    "doc": doc(lines, idx),
                    "line": idx + 1,
                    "imports": [],
                    "callers": [],
                    "callees": [],
                    "body": "",
                    "mtime": int(file.stat().st_mtime),
                }
            )
            break

    imp = imports(text)
    for row in syms:
        row["imports"] = imp

    syms.sort(key=lambda x: x["line"])
    for i, row in enumerate(syms):
        start = row["line"] - 1
        stop = len(lines)
        if i + 1 < len(syms):
            stop = syms[i + 1]["line"] - 1
        row["body"] = "\n".join(lines[start:stop])

    exp = [x["name"] for x in syms if x["exported"]]
    names = ", ".join([x["name"] for x in syms[:6]])
    sumry = f"{len(syms)} symbols"
    if names:
        sumry += f": {names}"

    return {
        "path": rp,
        "summary": sumry,
        "imports": imp,
        "exports": exp,
        "related_tests": [],
        "mtime": int(file.stat().st_mtime),
        "symbols": syms,
    }


def tests(file_rows, sym_rows):
    test = [x["path"] for x in file_rows if re.search(r"(^|/)(test|tests)/|\.(test|spec)\.", x["path"]) ]
    stems = defaultdict(set)
    for p in test:
        stem = Path(p).stem
        stem = re.sub(r"\.(test|spec)$", "", stem)
        stems[stem].add(p)

    by_file = defaultdict(list)
    for row in sym_rows:
        by_file[row["path"]].append(row["name"])

    for row in file_rows:
        cand = set()
        stem = Path(row["path"]).stem
        for t in stems.get(stem, set()):
            cand.add(t)
        for name in by_file.get(row["path"], []):
            key = name.lower()
            for s, arr in stems.items():
                if key in s.lower() or s.lower() in key:
                    cand.update(arr)
        row["related_tests"] = sorted(cand)[:20]


def links(sym_rows):
    names = {x["name"] for x in sym_rows}
    refs = defaultdict(set)
    for row in sym_rows:
        calls = re.findall(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(", row.get("body", ""))
        cal = sorted({x for x in calls if x in names and x != row["name"]})[:30]
        row["callees"] = cal
        for name in cal:
            refs[name].add(row["name"])
    for row in sym_rows:
        row["callers"] = sorted(refs.get(row["name"], set()))[:30]


def db(path: Path):
    conn = sqlite3.connect(path)
    conn.execute(
        "create table if not exists symbols (name text, kind text, path text, exported integer, signature text, doc text, callers text, callees text, imports text, line integer, mtime integer)"
    )
    conn.execute(
        "create table if not exists files (path text primary key, summary text, imports text, exports text, related_tests text, mtime integer)"
    )
    conn.execute("create index if not exists idx_symbols_name on symbols(name)")
    conn.execute("create index if not exists idx_symbols_path on symbols(path)")
    conn.execute("create index if not exists idx_files_path on files(path)")
    return conn


def build(root: Path, glob: str, force: bool):
    idx = root / ".opencode" / "index"
    idx.mkdir(parents=True, exist_ok=True)
    sqlite = idx / "symbols.sqlite"
    jsonl = idx / "files.jsonl"

    if sqlite.exists() and not force:
        db_mtime = sqlite.stat().st_mtime
        changed = False
        for file in files(root, glob):
            if file.stat().st_mtime > db_mtime:
                changed = True
                break
        if not changed:
            return {"status": "ok", "rebuilt": False, "sqlite": str(sqlite), "jsonl": str(jsonl)}

    file_rows = [scan(root, file) for file in files(root, glob)]
    sym_rows = [y for x in file_rows for y in x["symbols"]]
    links(sym_rows)
    tests(file_rows, sym_rows)

    conn = db(sqlite)
    with conn:
        conn.execute("delete from symbols")
        conn.execute("delete from files")
        conn.executemany(
            "insert into symbols(name, kind, path, exported, signature, doc, callers, callees, imports, line, mtime) values(?,?,?,?,?,?,?,?,?,?,?)",
            [
                (
                    x["name"],
                    x["kind"],
                    x["path"],
                    x["exported"],
                    x["signature"],
                    x["doc"],
                    json.dumps(x["callers"]),
                    json.dumps(x["callees"]),
                    json.dumps(x["imports"]),
                    x["line"],
                    x["mtime"],
                )
                for x in sym_rows
            ],
        )
        conn.executemany(
            "insert or replace into files(path, summary, imports, exports, related_tests, mtime) values(?,?,?,?,?,?)",
            [
                (
                    x["path"],
                    x["summary"],
                    json.dumps(x["imports"]),
                    json.dumps(x["exports"]),
                    json.dumps(x["related_tests"]),
                    x["mtime"],
                )
                for x in file_rows
            ],
        )

    with jsonl.open("w", encoding="utf-8") as f:
        for row in file_rows:
            payload = {
                "path": row["path"],
                "summary": row["summary"],
                "imports": row["imports"],
                "exports": row["exports"],
                "related_tests": row["related_tests"],
                "mtime": row["mtime"],
            }
            f.write(json.dumps(payload, ensure_ascii=True) + "\n")

    return {
        "status": "ok",
        "rebuilt": True,
        "sqlite": str(sqlite),
        "jsonl": str(jsonl),
        "files": len(file_rows),
        "symbols": len(sym_rows),
        "time": int(time.time()),
    }


def open_db(root: Path):
    sqlite = root / ".opencode" / "index" / "symbols.sqlite"
    if not sqlite.exists():
        raise RuntimeError("index not found, run build first")
    return sqlite3.connect(sqlite)


def query(root: Path, mode: str, path_glob: str, symbol: str, text: str, limit: int):
    conn = open_db(root)
    cur = conn.cursor()
    if mode == "symbol":
        cur.execute(
            "select name, kind, path, exported, signature, doc, line from symbols where name like ? and path like ? order by name limit ?",
            (f"%{symbol}%", path_glob.replace("*", "%"), limit),
        )
        rows = cur.fetchall()
        return {
            "mode": mode,
            "count": len(rows),
            "results": [
                {
                    "name": x[0],
                    "kind": x[1],
                    "path": x[2],
                    "exported": bool(x[3]),
                    "signature": x[4],
                    "doc": x[5],
                    "line": x[6],
                }
                for x in rows
            ],
        }

    if mode == "file":
        cur.execute(
            "select path, summary, imports, exports, related_tests, mtime from files where path like ? order by mtime desc limit ?",
            (path_glob.replace("*", "%"), limit),
        )
        rows = cur.fetchall()
        return {
            "mode": mode,
            "count": len(rows),
            "results": [
                {
                    "path": x[0],
                    "summary": x[1],
                    "imports": json.loads(x[2] or "[]"),
                    "exports": json.loads(x[3] or "[]"),
                    "related_tests": json.loads(x[4] or "[]"),
                    "mtime": x[5],
                }
                for x in rows
            ],
        }

    cur.execute(
        "select name, kind, path, signature, doc, line from symbols where (name like ? or signature like ? or doc like ? or path like ?) and path like ? order by mtime desc limit ?",
        (f"%{text}%", f"%{text}%", f"%{text}%", f"%{text}%", path_glob.replace("*", "%"), limit),
    )
    rows = cur.fetchall()
    return {
        "mode": mode,
        "count": len(rows),
        "results": [
            {"name": x[0], "kind": x[1], "path": x[2], "signature": x[3], "doc": x[4], "line": x[5]} for x in rows
        ],
    }


def symbol(root: Path, name: str):
    conn = open_db(root)
    cur = conn.cursor()
    cur.execute(
        "select name, kind, path, exported, signature, doc, callers, callees, imports, line, mtime from symbols where name = ? order by mtime desc",
        (name,),
    )
    rows = cur.fetchall()
    return {
        "symbol": name,
        "count": len(rows),
        "results": [
            {
                "name": x[0],
                "kind": x[1],
                "path": x[2],
                "exported": bool(x[3]),
                "signature": x[4],
                "doc": x[5],
                "callers": json.loads(x[6] or "[]"),
                "callees": json.loads(x[7] or "[]"),
                "imports": json.loads(x[8] or "[]"),
                "line": x[9],
                "mtime": x[10],
            }
            for x in rows
        ],
    }


def file_row(conn, path: str):
    cur = conn.cursor()
    cur.execute("select path, summary, imports, exports, related_tests, mtime from files where path = ?", (path,))
    row = cur.fetchone()
    if not row:
        return None
    return {
        "path": row[0],
        "summary": row[1],
        "imports": json.loads(row[2] or "[]"),
        "exports": json.loads(row[3] or "[]"),
        "related_tests": json.loads(row[4] or "[]"),
        "mtime": row[5],
    }


def resolve(conn, target: str):
    cur = conn.cursor()
    cur.execute("select path from files where path = ?", (target,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute("select path from symbols where name = ? order by mtime desc limit 1", (target,))
    row = cur.fetchone()
    if row:
        return row[0]
    return None


def related(root: Path, target: str):
    conn = open_db(root)
    path = resolve(conn, target)
    if not path:
        return {"target": target, "error": "not found"}

    cur = conn.cursor()
    cur.execute("select name, kind, signature, line from symbols where path = ? order by line", (path,))
    syms = [{"name": x[0], "kind": x[1], "signature": x[2], "line": x[3]} for x in cur.fetchall()]

    row = file_row(conn, path)
    return {"target": target, "path": path, "file": row, "symbols": syms[:60]}


def callgraph(root: Path, sym: str):
    conn = open_db(root)
    cur = conn.cursor()
    cur.execute("select path, callers, callees, line from symbols where name = ? order by mtime desc", (sym,))
    rows = cur.fetchall()
    return {
        "symbol": sym,
        "count": len(rows),
        "results": [
            {"path": x[0], "callers": json.loads(x[1] or "[]"), "callees": json.loads(x[2] or "[]"), "line": x[3]}
            for x in rows
        ],
    }


def owners(root: Path, target: str):
    conn = open_db(root)
    path = resolve(conn, target)
    if not path:
        return {"target": target, "error": "not found"}

    cp = subprocess.run(
        ["git", "-C", str(root), "log", "--format=%an", "--", path],
        capture_output=True,
        text=True,
    )
    if cp.returncode != 0:
        return {"target": target, "path": path, "owners": []}

    names = [x.strip() for x in cp.stdout.splitlines() if x.strip()]
    cnt = Counter(names)
    return {
        "target": target,
        "path": path,
        "owners": [{"name": k, "commits": v} for k, v in cnt.most_common(8)],
    }


def related_tests(root: Path, target: str):
    conn = open_db(root)
    path = resolve(conn, target)
    if not path:
        return {"target": target, "error": "not found"}
    row = file_row(conn, path)
    return {
        "target": target,
        "path": path,
        "related_tests": (row or {}).get("related_tests", []),
    }


def rank(root: Path, task: str, limit: int):
    conn = open_db(root)
    toks = [x.lower() for x in re.findall(r"[A-Za-z_][A-Za-z0-9_\-]{2,}", task)]
    if not toks:
        return {"task": task, "files": [], "symbols": []}

    cur = conn.cursor()
    cur.execute("select path, summary, imports, exports from files")
    file_rows = cur.fetchall()

    file_scores = []
    for row in file_rows:
        blob = " ".join([row[0], row[1] or "", row[2] or "", row[3] or ""]).lower()
        score = sum(blob.count(tok) for tok in toks)
        if score:
            file_scores.append({"path": row[0], "score": score})

    cur.execute("select name, kind, path, signature, doc, line from symbols")
    sym_rows = cur.fetchall()
    sym_scores = []
    for row in sym_rows:
        blob = " ".join([row[0], row[2], row[3] or "", row[4] or ""]).lower()
        score = sum(blob.count(tok) for tok in toks)
        if score:
            sym_scores.append({"name": row[0], "kind": row[1], "path": row[2], "signature": row[3], "line": row[5], "score": score})

    file_scores.sort(key=lambda x: x["score"], reverse=True)
    sym_scores.sort(key=lambda x: x["score"], reverse=True)

    return {
        "task": task,
        "tokens": toks,
        "files": file_scores[:limit],
        "symbols": sym_scores[:limit],
    }


def parse():
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["build", "query", "symbol", "related", "callgraph", "owners", "tests", "rank"])
    p.add_argument("--root", required=True)
    p.add_argument("--path-glob", default="**/*")
    p.add_argument("--mode", default="symbol")
    p.add_argument("--symbol", default="")
    p.add_argument("--text", default="")
    p.add_argument("--target", default="")
    p.add_argument("--task", default="")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--force", type=int, default=0)
    return p.parse_args()


def main():
    args = parse()
    root = Path(args.root).resolve()

    if args.cmd == "build":
        out = build(root, args.path_glob, bool(args.force))
    elif args.cmd == "query":
        out = query(root, args.mode, args.path_glob, args.symbol, args.text, args.limit)
    elif args.cmd == "symbol":
        out = symbol(root, args.symbol)
    elif args.cmd == "related":
        out = related(root, args.target)
    elif args.cmd == "callgraph":
        out = callgraph(root, args.symbol)
    elif args.cmd == "owners":
        out = owners(root, args.target)
    elif args.cmd == "tests":
        out = related_tests(root, args.target)
    else:
        out = rank(root, args.task, args.limit)

    print(json.dumps(out, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
