#!/usr/bin/env python3
"""
Generate a preview dataset of top electronic releases for the 3D frontend.
Reads from the JSONL output of ingest_releases.py and creates a lighter JSON.
"""

import json
import os
from collections import defaultdict

INPUT = os.path.expanduser("~/repos/discoworld/data/processed/electronic_releases.jsonl")
OUTPUT = os.path.expanduser("~/repos/discoworld/packages/web/public/data/releases_preview.json")

# We want: releases with YouTube links, vinyl format, interesting styles
# Take top releases per style (to get coverage of all sub-genres)

releases_by_style = defaultdict(list)
total = 0
with_youtube = 0
vinyl = 0

print("Reading electronic releases...")
with open(INPUT) as f:
    for line in f:
        total += 1
        r = json.loads(line)

        # Must have YouTube
        if not r.get("videos"):
            continue
        with_youtube += 1

        # Prefer vinyl
        is_vinyl = False
        for fmt in r.get("formats", []):
            name = fmt.get("name", "").lower()
            descs = [d.lower() for d in fmt.get("descriptions", [])]
            if name == "vinyl" or '12"' in descs or '10"' in descs or '7"' in descs:
                is_vinyl = True
                break
        if is_vinyl:
            vinyl += 1

        # Simplify for frontend
        artists_str = ", ".join(a["name"] for a in r.get("artists", [])[:3])
        label_str = r["labels"][0]["name"] if r.get("labels") else ""
        catno = r["labels"][0]["catno"] if r.get("labels") else ""
        yt_videos = [v for v in r.get("videos", []) if "youtube.com" in v.get("url", "") or "youtu.be" in v.get("url", "")]
        youtube_url = yt_videos[0]["url"] if yt_videos else ""

        simplified = {
            "id": r["id"],
            "title": r["title"],
            "artist": artists_str,
            "label": label_str,
            "catno": catno,
            "year": r.get("year", ""),
            "country": r.get("country", ""),
            "styles": r.get("styles", []),
            "youtube": youtube_url,
            "vinyl": is_vinyl,
            "tracks": len(r.get("tracklist", [])),
        }

        for style in r.get("styles", []):
            releases_by_style[style].append(simplified)

        if total % 100000 == 0:
            print(f"  Processed {total:,} releases...")

print(f"\nTotal: {total:,} | With YouTube: {with_youtube:,} | Vinyl: {vinyl:,}")
print(f"Styles found: {len(releases_by_style)}")

# Take top N per style (by year descending — prefer recent)
MAX_PER_STYLE = 30
MAX_TOTAL = 5000

selected = {}
for style, releases in sorted(releases_by_style.items()):
    # Sort by year descending, take top N
    sorted_releases = sorted(releases, key=lambda r: r.get("year", "0"), reverse=True)[:MAX_PER_STYLE]
    for r in sorted_releases:
        if r["id"] not in selected and len(selected) < MAX_TOTAL:
            selected[r["id"]] = r

print(f"Selected {len(selected)} releases for preview")

# Style distribution
style_dist = defaultdict(int)
for r in selected.values():
    for s in r["styles"]:
        style_dist[s] += 1

output = {
    "meta": {
        "version": "0.1.0",
        "total_electronic": total,
        "with_youtube": with_youtube,
        "vinyl_count": vinyl,
        "preview_count": len(selected),
        "styles_count": len(releases_by_style),
    },
    "releases": list(selected.values()),
    "style_distribution": dict(sorted(style_dist.items(), key=lambda x: -x[1])[:50]),
}

with open(OUTPUT, "w") as f:
    json.dump(output, f)

print(f"Written to {OUTPUT}")
print(f"\nTop 15 styles in preview:")
for style, count in sorted(style_dist.items(), key=lambda x: -x[1])[:15]:
    print(f"  {style}: {count}")
