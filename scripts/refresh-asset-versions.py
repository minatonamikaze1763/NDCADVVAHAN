#!/usr/bin/env python3
"""Update local index.html asset query strings from file content hashes.
Only changes cache tokens; never edits UI content, markup or remote URLs.
"""
from pathlib import Path
import hashlib
import re

root = Path(__file__).resolve().parents[1]
index = root / "index.html"
source = index.read_text(encoding="utf-8")
pattern = re.compile(r'(?P<prefix>\b(?:src|href)=")(?P<path>(?!https?://|//|#|data:)[^"?#]+\.(?:js|css|png|jpg|jpeg|webp|svg))(?P<query>\?[^"#]*)?(?P<suffix>")', re.I)

def replace(match):
    path = match.group("path")
    target = (root / path.lstrip("/")).resolve()
    if not target.is_file() or not target.is_relative_to(root):
        return match.group(0)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()[:12]
    # Preserve any unrelated query parameters while replacing only the cache token.
    params = [p for p in (match.group("query") or "").lstrip("?").split("&") if p and not p.startswith("v=")]
    params.append("v=" + digest)
    return match.group("prefix") + path + "?" + "&".join(params) + match.group("suffix")

result = pattern.sub(replace, source)
if result != source:
    index.write_text(result, encoding="utf-8")
    print("Updated local asset cache tokens")
else:
    print("Asset cache tokens already current")
