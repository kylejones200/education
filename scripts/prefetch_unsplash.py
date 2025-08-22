#!/usr/bin/env python3
"""
Prefetch Unsplash images for pages and write URL + attribution into front matter.

Usage:
  UNSPLASH_ACCESS_KEY=... python3 scripts/prefetch_unsplash.py [--force] [--dry-run]

Behavior:
- Scans content/ for *.md files with front matter (YAML or TOML).
- Determines a query per page:
  * If params.hero_unsplash.photo_id is set: fetch that exact photo.
  * Else, if params.hero_unsplash.query is set: use it.
  * Else, if file path is under content/schools/: "<Title> campus".
  * Else: "<Title>".
- Fetches 1 image (by ID or random by query/collections/orientation) and writes into front matter under params.hero_unsplash:
  * image_url, image_alt, credit_name, credit_profile, photo_link, photo_id, query_used
- Skips pages that already have image_url unless --force is provided.

Requirements:
- Python 3.8+
- pip install -r requirements.txt (requests, PyYAML, toml)
"""
from __future__ import annotations
import os
import re
import sys
import json
import argparse
from pathlib import Path

try:
    import yaml  # PyYAML
except Exception:
    yaml = None

try:
    import toml  # for TOML front matter
except Exception:
    toml = None

try:
    import requests
except Exception:
    requests = None

# Optional: load .env automatically if present
def _maybe_load_dotenv():
    try:
        from dotenv import load_dotenv  # type: ignore
    except Exception:
        return
    # Load from repo root .env
    root_env = Path(__file__).resolve().parents[1] / ".env"
    if root_env.exists():
        load_dotenv(dotenv_path=root_env)
    # Fallback: load from scripts/.env if present
    scripts_env = Path(__file__).resolve().parent / ".env"
    if scripts_env.exists():
        load_dotenv(dotenv_path=scripts_env)

CONTENT_DIR = Path(__file__).resolve().parents[1] / "content"
API_BASE = "https://api.unsplash.com"

FRONT_MATTER_PATTERNS = [
    (re.compile(r"^---\n(.*?)\n---\n(.*)$", re.S), "yaml"),
    (re.compile(r"^\+\+\+\n(.*?)\n\+\+\+\n(.*)$", re.S), "toml"),
]


def load_front_matter(text: str):
    for rx, kind in FRONT_MATTER_PATTERNS:
        m = rx.match(text)
        if m:
            meta_raw, body = m.group(1), m.group(2)
            if kind == "yaml":
                if not yaml:
                    raise RuntimeError("PyYAML not installed. Run: pip3 install PyYAML")
                meta = yaml.safe_load(meta_raw) or {}
            else:
                if not toml:
                    raise RuntimeError("toml not installed. Run: pip3 install toml")
                meta = toml.loads(meta_raw or "")
            return kind, meta, body
    # If no front matter, default to YAML with empty meta
    return "yaml", {}, text


def dump_front_matter(kind: str, meta: dict, body: str) -> str:
    if kind == "yaml":
        if not yaml:
            raise RuntimeError("PyYAML not installed. Run: pip3 install PyYAML")
        meta_str = yaml.safe_dump(meta, sort_keys=False).strip()
        return f"---\n{meta_str}\n---\n{body}"
    else:
        if not toml:
            raise RuntimeError("toml not installed. Run: pip3 install toml")
        meta_str = toml.dumps(meta).strip()
        return f"+++\n{meta_str}\n+++\n{body}"


def ensure_path_title(meta: dict, path: Path) -> str:
    t = meta.get("title")
    if isinstance(t, str) and t.strip():
        return t.strip()
    # derive from filename
    return path.stem.replace("-", " ").replace("_", " ").title()


def build_query(meta: dict, path: Path, title: str) -> tuple[str | None, dict]:
    params = ((meta.get("params") or {}).get("hero_unsplash") or {})
    photo_id = params.get("photo_id")
    query = params.get("query")
    collections = params.get("collections")
    orientation = params.get("orientation", "landscape")

    if not query:
        # section-aware default
        if "/schools/" in str(path.as_posix() + "/"):
            query = f"{title} campus"
        else:
            query = title

    return photo_id, {
        "query": query,
        "collections": collections,
        "orientation": orientation,
    }


def fetch_unsplash(access_key: str, photo_id: str | None, opts: dict) -> dict | None:
    headers = {"Authorization": f"Client-ID {access_key}"}
    try:
        if photo_id:
            url = f"{API_BASE}/photos/{photo_id}"
            r = requests.get(url, headers=headers, timeout=20)
            r.raise_for_status()
            return r.json()
        # random
        params = {
            "orientation": opts.get("orientation") or "landscape",
            "content_filter": "high",
            "count": 1,
        }
        if opts.get("collections"):
            params["collections"] = str(opts["collections"])  # could be comma-separated
        else:
            params["query"] = opts.get("query") or "education"
        url = f"{API_BASE}/photos/random"
        r = requests.get(url, headers=headers, params=params, timeout=20)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            return data[0] if data else None
        return data
    except Exception as e:
        print(f"Error fetching Unsplash: {e}", file=sys.stderr)
        return None


def extract_fields(photo: dict, fallback_query: str) -> dict:
    urls = (photo or {}).get("urls") or {}
    links = (photo or {}).get("links") or {}
    user = (photo or {}).get("user") or {}
    ulinks = user.get("links") or {}
    return {
        "image_url": urls.get("regular") or urls.get("full") or urls.get("raw"),
        "image_alt": photo.get("alt_description") or fallback_query,
        "credit_name": user.get("name"),
        "credit_profile": ulinks.get("html") or "https://unsplash.com",
        "photo_link": links.get("html") or "https://unsplash.com",
        "photo_id": photo.get("id"),
    }


def update_meta_with_result(meta: dict, result: dict, query_used: str):
    params = meta.setdefault("params", {}).setdefault("hero_unsplash", {})
    params.update(result)
    params["query_used"] = query_used


def process_file(p: Path, access_key: str, force: bool, dry_run: bool) -> bool:
    text = p.read_text(encoding="utf-8")
    kind, meta, body = load_front_matter(text)

    params = meta.setdefault("params", {}).setdefault("hero_unsplash", {})
    if params.get("disable") is True:
        print(f"[skip-disabled] {p}")
        return False

    if params.get("image_url") and not force:
        print(f"[skip-existing] {p}")
        return False

    title = ensure_path_title(meta, p)
    photo_id, opts = build_query(meta, p, title)
    photo = fetch_unsplash(access_key, photo_id, opts)
    if not photo:
        print(f"[no-photo] {p}")
        return False

    result = extract_fields(photo, opts.get("query") or title)
    update_meta_with_result(meta, result, opts.get("query") or title)

    out = dump_front_matter(kind, meta, body)
    if dry_run:
        print(f"[dry-run] Would update {p}")
        return False

    p.write_text(out, encoding="utf-8")
    print(f"[updated] {p}")
    return True


def main():
    _maybe_load_dotenv()
    if requests is None:
        print("Please install dependencies: pip3 install -r requirements.txt", file=sys.stderr)
        sys.exit(2)

    apikey = os.getenv("UNSPLASH_ACCESS_KEY")
    if not apikey:
        print("UNSPLASH_ACCESS_KEY not set in environment (checked .env at repo root and scripts/.env)", file=sys.stderr)
        sys.exit(2)

    parser = argparse.ArgumentParser(description="Prefetch Unsplash images into front matter")
    parser.add_argument("paths", nargs="*", help="Optional specific files or directories under content/ to process")
    parser.add_argument("--force", action="store_true", help="Overwrite even if image_url already present")
    parser.add_argument("--dry-run", action="store_true", help="Do not write files; just report")
    args = parser.parse_args()

    targets: list[Path] = []
    if args.paths:
        for s in args.paths:
            p = Path(s)
            targets.append(p)
    else:
        targets.append(CONTENT_DIR)

    md_files: list[Path] = []
    for t in targets:
        t = t.resolve()
        if t.is_dir():
            md_files.extend(sorted(t.rglob("*.md")))
        elif t.is_file() and t.suffix == ".md":
            md_files.append(t)

    if not md_files:
        print("No Markdown files found to process.")
        return

    updated = 0
    for f in md_files:
        try:
            if process_file(f, apikey, args.force, args.dry_run):
                updated += 1
        except Exception as e:
            print(f"[error] {f}: {e}", file=sys.stderr)

    print(f"Done. Updated {updated} files.")


if __name__ == "__main__":
    main()
