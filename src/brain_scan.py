#!/usr/bin/env python3
"""
brain_scan.py — Antigravity Second Brain
Scans projects and builds a knowledge graph powered by Gemini AI.

Usage:
  brain scan [path]                     scan a project folder
  brain scan .                          scan current directory
  brain watch [path] [--interval N]     auto-scan on file changes
  brain add "Label" "Description" type  add a node manually
  brain projects                        list registered projects
  brain use <project-name>              scan a registered project
  brain clear                           reset brain.json

Valid types: project | tech | concept | person | resource | file
"""

from __future__ import annotations

import argparse
import contextlib
import itertools
import json
import logging
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)
log = logging.getLogger("brain")

# ── Constants ─────────────────────────────────────────────────────────────────
VERSION        = "2.0.0"
GEMINI_MODEL   = "gemini-2.5-flash"
MAX_FILES      = 80
MAX_FILE_SIZE  = 512 * 1024   # 512 KB
MAX_LABEL_LEN  = 64
MAX_DESC_LEN   = 120
MAX_IMPORTS    = 12
WATCH_INTERVAL = 30           # seconds

EXTENSIONS: dict[str, str] = {
    ".dart": "Flutter/Dart", ".py": "Python",    ".php": "PHP/Laravel",
    ".ts":   "TypeScript",   ".tsx": "React/TSX", ".js": "JavaScript",
    ".vue":  "Vue",          ".md":  "Markdown",  ".json": "Config/JSON",
    ".yaml": "Config/YAML",  ".yml": "Config/YAML", ".cs": "C#/.NET",
    ".java": "Java",         ".kt":  "Kotlin",    ".go": "Go",
    ".rb":   "Ruby",         ".rs":  "Rust",      ".swift": "Swift",
    ".ex":   "Elixir",       ".exs": "Elixir",    ".cpp": "C++",
    ".c":    "C",            ".h":   "C/C++ Header",
}

IGNORE_DIRS: frozenset[str] = frozenset({
    ".git", "node_modules", ".dart_tool", "build", "vendor",
    ".idea", "__pycache__", "dist", ".next", ".nuxt", "coverage",
    ".gradle", ".mvn", "target", "bin", "obj", ".terraform",
    ".serverless", "out", ".cache", ".pub-cache", "pods", "Pods",
})

VALID_TYPES: frozenset[str] = frozenset({
    "project", "tech", "concept", "person", "resource", "file",
})

_LABEL_SAFE = re.compile(r"[^\w\s\-\.\(\)/]", re.UNICODE)

# ── Projects registry file (lives next to brain.json) ────────────────────────
PROJECTS_FILE = Path(os.getenv("BRAIN_PROJECTS_FILE", "projects.json"))


# ── Custom exceptions ─────────────────────────────────────────────────────────
class BrainError(Exception):
    pass

class APIKeyMissingError(BrainError):
    pass

class InvalidNodeTypeError(BrainError):
    pass


# ── Config (no mutable globals) ───────────────────────────────────────────────
class Config:
    __slots__ = ("brain_file", "api_key", "max_files")

    def __init__(self, brain_file: Path, api_key: str, max_files: int = MAX_FILES) -> None:
        if not api_key or not api_key.strip():
            raise APIKeyMissingError(
                "GEMINI_API_KEY is not set.\n"
                "  Get your free key at: https://aistudio.google.com\n"
                "  Then run: export GEMINI_API_KEY='your-key'"
            )
        self.brain_file = brain_file
        self.api_key    = api_key.strip()
        self.max_files  = max_files

    @classmethod
    def from_env(cls, brain_file: Path, max_files: int = MAX_FILES) -> Config:
        return cls(
            brain_file=brain_file,
            api_key=os.environ.get("GEMINI_API_KEY", ""),
            max_files=max_files,
        )


# ── Sanitization ──────────────────────────────────────────────────────────────
def sanitize_label(value: str) -> str:
    return _LABEL_SAFE.sub("", str(value)).strip()[:MAX_LABEL_LEN]

def sanitize_desc(value: str) -> str:
    return re.sub(r"<[^>]+>", "", str(value)).strip()[:MAX_DESC_LEN]


# ── Brain I/O — atomic writes ─────────────────────────────────────────────────
_BRAIN_SCHEMA = {"nodes": list, "edges": list, "meta": dict}

def _valid_schema(data: object) -> bool:
    return isinstance(data, dict) and all(
        isinstance(data.get(k), t) for k, t in _BRAIN_SCHEMA.items()
    )

def load_brain(brain_file: Path) -> dict:
    if not brain_file.exists():
        return {"nodes": [], "edges": [], "meta": {"version": VERSION, "scans": 0}}
    try:
        data = json.loads(brain_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        backup = brain_file.with_suffix(".corrupted.json")
        shutil.copy2(brain_file, backup)
        log.warning("⚠️  brain.json corrupted — backed up to %s. Starting fresh.", backup)
        return {"nodes": [], "edges": [], "meta": {"version": VERSION, "scans": 0}}
    if not _valid_schema(data):
        raise BrainError("brain.json has an invalid structure. Delete it and try again.")
    return data

def save_brain(brain: dict, brain_file: Path) -> None:
    """Atomic write: tempfile + os.replace — safe against crashes."""
    meta = brain.setdefault("meta", {})
    meta["version"]   = VERSION
    meta["scans"]     = meta.get("scans", 0) + 1
    meta["last_scan"] = datetime.now(timezone.utc).isoformat()

    brain_file.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=brain_file.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(brain, f, indent=2, ensure_ascii=False)
        os.replace(tmp, brain_file)
    except Exception:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise
    log.info("✅ brain.json saved — %d nodes, %d edges", len(brain["nodes"]), len(brain["edges"]))


# ── Projects registry ─────────────────────────────────────────────────────────
def load_projects(projects_file: Path) -> dict:
    if not projects_file.exists():
        return {}
    try:
        return json.loads(projects_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}

def save_projects(projects: dict, projects_file: Path) -> None:
    projects_file.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=projects_file.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(projects, f, indent=2, ensure_ascii=False)
        os.replace(tmp, projects_file)
    except Exception:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise

def register_project(name: str, path: Path, projects_file: Path) -> None:
    projects = load_projects(projects_file)
    projects[name] = {"path": str(path), "registered_at": datetime.now(timezone.utc).isoformat()}
    save_projects(projects, projects_file)
    log.info("📌 Project '%s' registered → %s", name, path)

def list_projects(projects_file: Path) -> dict:
    return load_projects(projects_file)


# ── Import extraction ─────────────────────────────────────────────────────────
_IMPORT_PATTERNS: dict[str, str] = {
    ".dart":  r"import ['\"]([^'\"]+)['\"]",
    ".py":    r"^(?:import|from)\s+([\w\.]+)",
    ".ts":    r"from ['\"]([^'\"]+)['\"]",
    ".tsx":   r"from ['\"]([^'\"]+)['\"]",
    ".js":    r"from ['\"]([^'\"]+)['\"]",
    ".vue":   r"(?:import .+ from |require\()['\"]([^'\"]+)['\"]",
    ".php":   r"use ([\w\\]+);",
    ".cs":    r"using ([\w\.]+);",
    ".java":  r"import ([\w\.]+);",
    ".kt":    r"import ([\w\.]+)",
    ".go":    r'"([\w\./\-]+)"',
    ".md":    r"\[\[([^\]]+)\]\]",
    ".ex":    r"alias ([\w\.]+)",
    ".exs":   r"alias ([\w\.]+)",
}

def extract_imports(filepath: Path) -> list[str]:
    try:
        if filepath.stat().st_size > MAX_FILE_SIZE:
            return []
        text = filepath.read_text(errors="ignore")
    except OSError:
        return []
    pattern = _IMPORT_PATTERNS.get(filepath.suffix)
    if not pattern:
        return []
    found = re.findall(pattern, text, re.MULTILINE)
    return [f for f in found if not f.startswith(".")][:MAX_IMPORTS]


# ── Directory scan ────────────────────────────────────────────────────────────
def scan_directory(root: Path, max_files: int = MAX_FILES) -> tuple[str, int]:
    root = root.resolve()
    lines: list[str] = []
    count = 0

    valid_files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Modify dirnames in-place to skip ignored directories
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]

        for f in filenames:
            path = Path(dirpath) / f
            if path.suffix not in EXTENSIONS:
                continue

            # block symlinks pointing outside root (path traversal)
            if path.is_symlink():
                try:
                    path.resolve().relative_to(root)
                except ValueError:
                    continue
            valid_files.append(path)

    for path in sorted(valid_files):
        imports = extract_imports(path)
        rel  = path.relative_to(root)
        lang = EXTENSIONS[path.suffix]
        line = f"[{lang}] {rel}"
        if imports:
            line += f" → uses: {', '.join(sanitize_label(i) for i in imports[:8])}"
        lines.append(line)
        count += 1
        if count >= max_files:
            lines.append(f"... (limit of {max_files} files reached — use --max-files to increase)")
            break

    return "\n".join(lines), count


# ── Snapshot for watch mode (detect changes) ──────────────────────────────────
def _dir_snapshot(root: Path) -> dict[str, float]:
    """Returns {relative_path: mtime} for all tracked files."""
    root = root.resolve()
    snap: dict[str, float] = {}

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
        for f in filenames:
            path = Path(dirpath) / f
            if path.suffix in EXTENSIONS:
                with contextlib.suppress(OSError):
                    snap[str(path.relative_to(root))] = path.stat().st_mtime
    return snap

def _has_changed(old: dict[str, float], new: dict[str, float]) -> bool:
    return old != new


# ── Gemini classification ─────────────────────────────────────────────────────
def classify_with_gemini(summary: str, config: Config) -> dict:
    try:
        from google import genai
    except ImportError:
        raise BrainError("Missing dependency. Run: pip install google-genai")

    # API key is never logged
    client = genai.Client(api_key=config.api_key)

    prompt = (
        "You are a software project analysis assistant.\n\n"
        "Analyze the file summary below and return a JSON with:\n"
        '- "nodes": list of {id (int), label (str), '
        'type (str), desc (str, in English)}\n'
        '- "edges": list of pairs [source_id, target_id]\n\n'
        "Rules:\n"
        "1. Group similar files into representative nodes"
        " -- do NOT create one node per file\n"
        "2. Identify architectural patterns: "
        "Clean Arch, DDD, MVC, layers, domains\n"
        f"3. Use ONLY these types: "
        f"{', '.join(sorted(VALID_TYPES))}\n"
        "4. Create edges only for real dependencies\n"
        "5. Return ONLY valid JSON "
        "-- no markdown fences, no extra text\n\n"
        f"PROJECT SUMMARY:\n{summary}"
    )

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw)
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise BrainError(f"Invalid JSON from Gemini: {exc}") from exc
    except Exception as exc:
        raise BrainError(f"Gemini API error: {exc}") from exc

    # sanitize all AI-generated fields before persisting
    for node in data.get("nodes", []):
        node["label"] = sanitize_label(str(node.get("label", "")))
        node["desc"]  = sanitize_desc(str(node.get("desc", "")))
        if node.get("type") not in VALID_TYPES:
            node["type"] = "file"

    return data


# ── Merge ─────────────────────────────────────────────────────────────────────
def merge_brain(existing: dict, new_data: dict) -> tuple[dict, list[str], int]:
    existing_labels: dict[str, int] = {n["label"].lower(): n["id"] for n in existing["nodes"]}
    next_id = max((n["id"] for n in existing["nodes"]), default=0) + 1
    id_map:  dict[int, int] = {}
    added_nodes: list[str]  = []

    for node in new_data.get("nodes", []):
        key     = node.get("label", "").lower()
        orig_id = int(node.get("id", -1))
        if not key:
            continue
        if key not in existing_labels:
            existing["nodes"].append({
                "id":    next_id,
                "label": node["label"],
                "type":  node.get("type", "file"),
                "desc":  node.get("desc", ""),
            })
            existing_labels[key] = next_id
            id_map[orig_id]      = next_id
            added_nodes.append(node["label"])
            next_id += 1
        else:
            id_map[orig_id] = existing_labels[key]

    edge_set: set[tuple[int, int]] = {(e[0], e[1]) for e in existing["edges"]}
    added_edges = 0
    for edge in new_data.get("edges", []):
        if not (isinstance(edge, (list, tuple)) and len(edge) == 2):
            continue
        a = id_map.get(int(edge[0]), int(edge[0]))
        b = id_map.get(int(edge[1]), int(edge[1]))
        if a != b and (a, b) not in edge_set:
            existing["edges"].append([a, b])
            edge_set.add((a, b))
            added_edges += 1

    return existing, added_nodes, added_edges

# ── Spinner ───────────────────────────────────────────────────────────────────
class Spinner:
    def __init__(self, message: str = "Processing..."):
        self.message = message
        self.done = False
        self.spinner = itertools.cycle(["-", "\\", "|", "/"])
        self.thread: threading.Thread | None = None

    def _spin(self) -> None:
        try:
            while not self.done:
                sys.stderr.write(f"\r{next(self.spinner)} {self.message}")
                sys.stderr.flush()
                time.sleep(0.1)
        except Exception:
            pass

    def __enter__(self) -> Spinner:
        self.done = False
        sys.stderr.write(f"\r- {self.message}")
        sys.stderr.flush()
        self.thread = threading.Thread(target=self._spin, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.done = True
        if self.thread:
            self.thread.join(timeout=0.2)
        sys.stderr.write("\r\033[K")
        sys.stderr.flush()


# ── Core scan pipeline ────────────────────────────────────────────────────────
def run_scan(root: Path, config: Config) -> tuple[dict, list[str], int]:
    """Scan → classify → merge → save. Returns (brain, added_nodes, added_edges)."""
    summary, count = scan_directory(root, config.max_files)
    if not summary.strip():
        raise BrainError("No recognized source files found in this folder.")

    log.info("   %d file(s) found", count)

    with Spinner(f"🤖 Classifying with Gemini ({GEMINI_MODEL})..."):
        new_data = classify_with_gemini(summary, config)

    brain    = load_brain(config.brain_file)
    brain, added_nodes, added_edges = merge_brain(brain, new_data)
    save_brain(brain, config.brain_file)
    return brain, added_nodes, added_edges


# ── Manual node add ───────────────────────────────────────────────────────────
def add_node_manual(label: str, desc: str, node_type: str, brain_file: Path) -> None:
    label     = sanitize_label(label)
    desc      = sanitize_desc(desc)
    node_type = node_type.strip().lower()

    if not label:
        raise BrainError("Label cannot be empty after sanitization.")
    if node_type not in VALID_TYPES:
        raise InvalidNodeTypeError(
            f"Invalid type: '{node_type}'. Valid: {', '.join(sorted(VALID_TYPES))}"
        )

    brain = load_brain(brain_file)
    if label.lower() in {n["label"].lower() for n in brain["nodes"]}:
        raise BrainError(f"Node '{label}' already exists in the brain.")

    next_id = max((n["id"] for n in brain["nodes"]), default=0) + 1
    brain["nodes"].append({"id": next_id, "label": label, "type": node_type, "desc": desc})
    save_brain(brain, brain_file)
    log.info("➕ Node added: [%s] %s", node_type, label)


# ── CLI ───────────────────────────────────────────────────────────────────────
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="brain",
        description="Antigravity Second Brain — knowledge graph powered by Gemini AI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  brain scan .\n"
            "  brain scan ~/projects/my-app\n"
            "  brain watch ~/projects/my-app --interval 60\n"
            "  brain add 'Redis' 'Session cache' 'tech'\n"
            "  brain projects\n"
            "  brain use my-app\n"
            "  brain clear\n"
        ),
    )
    parser.add_argument(
        "--output", default=None,
        help="Path to brain.json (default: ./brain.json or $BRAIN_FILE)",
    )
    parser.add_argument(
        "--max-files", type=int, default=MAX_FILES,
        help=f"Max files to scan (default: {MAX_FILES})",
    )
    parser.add_argument("--version",   action="version", version=f"brain {VERSION}")

    sub = parser.add_subparsers(dest="command", metavar="command")

    # brain scan
    p_scan = sub.add_parser("scan", help="Scan a project folder")
    p_scan.add_argument("path", nargs="?", default=".", help="Project folder (default: .)")

    # brain watch
    p_watch = sub.add_parser("watch", help="Auto-scan when files change")
    p_watch.add_argument("path", nargs="?", default=".", help="Project folder (default: .)")
    p_watch.add_argument("--interval", type=int, default=WATCH_INTERVAL,
                         help=f"Polling interval in seconds (default: {WATCH_INTERVAL})")

    # brain add
    p_add = sub.add_parser("add", help="Add a node manually")
    p_add.add_argument("label", help="Node label")
    p_add.add_argument("desc",  help="Short description")
    p_add.add_argument("type",  help=f"Node type: {', '.join(sorted(VALID_TYPES))}")

    # brain projects
    sub.add_parser("projects", help="List registered projects")

    # brain use
    p_use = sub.add_parser("use", help="Scan a registered project by name")
    p_use.add_argument("name", help="Project name (from 'brain projects')")

    # brain scan-all
    sub.add_parser("scan-all", help="Scan all registered projects sequentially")

    # brain register
    p_reg = sub.add_parser("register", help="Register a project folder with a name")
    p_reg.add_argument("name", help="Project name")
    p_reg.add_argument("path", nargs="?", default=".", help="Project folder (default: .)")

    # brain view
    sub.add_parser("view", help="Start local server and open the graph viewer in browser")

    # brain clear
    sub.add_parser("clear", help="Reset brain.json")

    return parser


def _resolve_brain_file(args: argparse.Namespace) -> Path:
    return Path(args.output or os.environ.get("BRAIN_FILE", "brain.json")).resolve()

def _resolve_projects_file(brain_file: Path) -> Path:
    return brain_file.parent / "projects.json"


def _print_help(brain_file: Path, proj_file: Path) -> int:
    """Prints a rich welcome banner and command reference."""
    # Fix Unicode encoding on Windows terminals
    if sys.platform == "win32":
        with contextlib.suppress(AttributeError):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    brain    = load_brain(brain_file)
    projects = load_projects(proj_file)
    n_nodes  = len(brain["nodes"])
    n_edges  = len(brain["edges"])
    n_proj   = len(projects)
    last_scan = brain.get("meta", {}).get("last_scan", "never")
    if last_scan != "never":
        try:
            dt = datetime.fromisoformat(last_scan)
            last_scan = dt.strftime("%Y-%m-%d %H:%M UTC")
        except Exception:
            pass

    W  = "\033[1;37m"   # bold white
    C  = "\033[0;36m"   # cyan
    G  = "\033[0;32m"   # green
    Y  = "\033[1;33m"   # yellow
    DM = "\033[2m"      # dim
    R  = "\033[0m"      # reset
    AC = "\033[0;35m"   # accent (purple)

    print(f"""
{AC}  +==========================================+{R}
{AC}  |  {W}Antigravity Second Brain  v{VERSION}{AC}          |{R}
{AC}  +==========================================+{R}

{DM}  Knowledge graph powered by Gemini AI{R}

  {W}Brain Status{R}
  {DM}------------------------------------------{R}
  Nodes      {G}{n_nodes:>6}{R}    Edges      {G}{n_edges:>6}{R}
  Projects   {G}{n_proj:>6}{R}    Last scan  {DM}{last_scan}{R}

  {W}Commands{R}
  {DM}------------------------------------------{R}
  {C}brain scan .{R}                   Scan current folder
  {C}brain scan ~/projects/my-app{R}   Scan a specific folder
  {C}brain scan-all{R}                 Scan all registered projects
  {C}brain watch .{R}                  Auto-scan on file changes
  {C}brain use {Y}<name>{R}               Scan a registered project
  {C}brain projects{R}                 List all registered projects
  {C}brain register {Y}<name> <path>{R}   Register a project folder
  {C}brain add {Y}'Label' 'Desc' type'{R}  Add a node manually
  {C}brain view{R}                     Open graph viewer in browser
  {C}brain clear{R}                    Reset brain.json
  {C}brain --version{R}                Show version

  {W}Node types{R}  {DM}project tech concept person resource file{R}
""")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser     = build_parser()
    args       = parser.parse_args(argv)
    brain_file = _resolve_brain_file(args)
    proj_file  = _resolve_projects_file(brain_file)
    command    = args.command

    # ── no subcommand → show help screen ──────────────────────────
    if not command:
        return _print_help(brain_file, proj_file)

    # ── view ──────────────────────────────────────────────────
    if command == "view":
        # Always serve from the project root (where brain_viewer.html lives),
        # regardless of what directory the user is in when they run the command.
        serve_dir = Path(__file__).parent.parent.resolve()
        # find a free port starting at 8000
        port = 8000
        for p in range(8000, 8010):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(("localhost", p)) != 0:
                    port = p
                    break
        url = f"http://localhost:{port}/brain_viewer.html"
        log.info("\n  Starting server at %s", url)
        log.info("  Press Ctrl+C to stop\n")
        server = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(port)],
            cwd=serve_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(0.8)   # let server spin up
        webbrowser.open(url)
        try:
            server.wait()
        except KeyboardInterrupt:
            server.terminate()
            log.info("\n  Server stopped.")
        return 0

    # ── clear ─────────────────────────────────────────────────────
    if command == "clear":
        if brain_file.exists():
            brain_file.unlink()
            log.info("🗑️  brain.json removed.")
        else:
            log.info("ℹ️  Nothing to clear.")
        return 0

    # ── add ───────────────────────────────────────────────────────
    if command == "add":
        try:
            add_node_manual(args.label, args.desc, args.type, brain_file)
        except BrainError as exc:
            log.error("❌ %s", exc)
            return 1
        return 0

    # ── register ──────────────────────────────────────────────────
    if command == "register":
        path = Path(args.path).resolve()
        if not path.is_dir():
            log.error("❌ Folder not found: %s", path)
            return 1
        register_project(args.name, path, proj_file)
        return 0

    # ── projects ──────────────────────────────────────────────────
    if command == "projects":
        projects = list_projects(proj_file)
        if not projects:
            log.info("ℹ️  No registered projects. Use: brain register <name> <path>")
        else:
            log.info("\n📂 Registered projects:")
            for name, info in projects.items():
                log.info("   %-20s → %s", name, info["path"])
            log.info("")
        return 0

    # ── use ───────────────────────────────────────────────────────
    if command == "use":
        projects = list_projects(proj_file)
        if args.name not in projects:
            log.error("❌ Project '%s' not registered. Run: brain projects", args.name)
            return 1
        path = Path(projects[args.name]["path"])
        args.path = str(path)
        command = "scan"

    # ── scan-all ──────────────────────────────────────────────────
    if command == "scan-all":
        projects = list_projects(proj_file)
        if not projects:
            log.info("ℹ️  No registered projects to scan.")
            return 0

        try:
            config = Config.from_env(brain_file=brain_file, max_files=args.max_files)
        except APIKeyMissingError as exc:
            log.error("❌ %s", exc)
            return 1

        log.info("\n🧠 Antigravity Second Brain  v%s — Scanning all projects", VERSION)

        total_added_nodes = 0
        total_added_edges = 0
        try:
            for name, info in projects.items():
                path = Path(info["path"]).resolve()
                if not path.is_dir():
                    log.error("❌ Skipping '%s': Folder not found: %s", name, path)
                    continue

                log.info("\n📂 Scanning project '%s': %s", name, path)
                try:
                    brain, added_nodes, added_edges = run_scan(path, config)
                    total_added_nodes += len(added_nodes)
                    total_added_edges += added_edges
                except BrainError as exc:
                    log.error("❌ %s", exc)
                    continue

            log.info("\n✅ All scans completed.")
        except KeyboardInterrupt:
            log.info("\n\n⏹️  Scan aborted by user.")
        log.info(
            "   Total added: +%d node(s), +%d edge(s)",
            total_added_nodes, total_added_edges,
        )

        final_brain = load_brain(brain_file)
        log.info(
            "   Final Brain Size: %d nodes / %d edges",
            len(final_brain["nodes"]), len(final_brain["edges"]),
        )
        log.info("   Run 'brain view' to visualize\n")
        return 0

    # ── config (needed for scan + watch) ──────────────────────────
    try:
        config = Config.from_env(brain_file=brain_file, max_files=args.max_files)
    except APIKeyMissingError as exc:
        log.error("❌ %s", exc)
        return 1

    root = Path(getattr(args, "path", ".")).resolve()
    if not root.is_dir():
        log.error("❌ Folder not found: %s", root)
        return 1

    # ── scan ──────────────────────────────────────────────────────
    if command == "scan":
        log.info("\n🧠 Antigravity Second Brain  v%s", VERSION)
        log.info("📂 Scanning: %s", root)
        try:
            brain, added_nodes, added_edges = run_scan(root, config)
            log.info("\n📊 Results:")
            log.info("   +%d node(s), +%d edge(s)", len(added_nodes), added_edges)
            for name in added_nodes[:8]:
                log.info("      · %s", name)
            if len(added_nodes) > 8:
                log.info("      ... and %d more", len(added_nodes) - 8)
            log.info("\n   Total: %d nodes · %d edges", len(brain["nodes"]), len(brain["edges"]))
            log.info("   Open brain_viewer.html in your browser and load brain.json ✨\n")
        except BrainError as exc:
            log.error("❌ %s", exc)
            return 1
        except KeyboardInterrupt:
            log.info("\n\n⏹️  Scan aborted by user.")
            return 1
        return 0

    # ── watch ─────────────────────────────────────────────────────
    if command == "watch":
        interval = args.interval
        log.info("\n🧠 Antigravity Second Brain  v%s — Watch mode", VERSION)
        log.info("👁️  Watching: %s (every %ds)", root, interval)
        log.info("   Press Ctrl+C to stop\n")

        snapshot = _dir_snapshot(root)
        # run immediately on start
        try:
            run_scan(root, config)
        except BrainError as exc:
            log.error("❌ %s", exc)

        while True:
            try:
                time.sleep(interval)
                new_snap = _dir_snapshot(root)
                if _has_changed(snapshot, new_snap):
                    log.info("\n🔄 Changes detected — rescanning...")
                    try:
                        brain, added_nodes, added_edges = run_scan(root, config)
                        log.info("   +%d node(s), +%d edge(s)", len(added_nodes), added_edges)
                    except BrainError as exc:
                        log.error("❌ %s", exc)
                    snapshot = new_snap
                else:
                    log.info("   [%s] No changes.", datetime.now().strftime("%H:%M:%S"))
            except KeyboardInterrupt:
                log.info("\n👋 Watch mode stopped.")
                return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
