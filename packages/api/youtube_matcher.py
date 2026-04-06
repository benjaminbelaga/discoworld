"""
YouTube Matcher — Reusable fuzzy matching + YouTube search module.

Extracted from dkay-processor's normalize/matching logic.
Uses youtube-search-python (no API key, no quota).
"""

import json
import re
import unicodedata
from pathlib import Path
from typing import Optional

from rapidfuzz import fuzz

try:
    from youtubesearchpython import VideosSearch
    YOUTUBE_SEARCH_AVAILABLE = True
except ImportError:
    YOUTUBE_SEARCH_AVAILABLE = False


# ---------------------------------------------------------------------------
# Text normalization (from dkay-processor/apple_music_preview.py)
# ---------------------------------------------------------------------------

def normalize_text(text: str) -> str:
    """
    Normalize text for comparison.
    Strips accents, lowercases, removes common suffixes
    like 'Original Mix', 'Single', feat. credits, etc.
    """
    if not text:
        return ""

    text = text.lower()

    # NFD decomposition → strip combining marks (accents)
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")

    # Remove noise suffixes/tags that differ between sources
    suffixes_to_remove = [
        r"\s*-\s*single$",
        r"\s*\(original mix\)$",
        r"\s*\(original\)$",
        r"\s*\[original mix\]$",
        r"\s*\[original\]$",
        r"\s*\(feat\..*?\)$",
        r"\s*\[feat\..*?\]$",
        r"\s*ft\..*$",
        r"\s*\(official\s*(audio|video|music\s*video)\)$",
        r"\s*\[official\s*(audio|video|music\s*video)\]$",
    ]
    for pattern in suffixes_to_remove:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)

    # Strip special characters except spaces
    text = re.sub(r"[^\w\s]", "", text)

    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return text


# ---------------------------------------------------------------------------
# Matching score (rapidfuzz token_sort_ratio)
# ---------------------------------------------------------------------------

def match_score(query_artist: str, query_title: str, result_title: str) -> float:
    """
    Score how well *result_title* (a YouTube video title) matches the
    expected artist + title.

    Returns a float 0-100.  Uses token_sort_ratio so word order doesn't
    matter (common with YouTube titles).
    """
    norm_expected = normalize_text(f"{query_artist} {query_title}")
    norm_result = normalize_text(result_title)

    if norm_expected == norm_result:
        return 100.0

    return fuzz.token_sort_ratio(norm_expected, norm_result)


# ---------------------------------------------------------------------------
# YouTube helpers
# ---------------------------------------------------------------------------

def build_youtube_search_query(
    artist: str,
    title: str,
    label: Optional[str] = None,
) -> str:
    """Build an optimized YouTube search query string."""
    parts = [artist, title]
    if label:
        parts.append(label)
    return " ".join(parts)


def search_youtube(query: str, max_results: int = 5) -> list[dict]:
    """
    Search YouTube via youtube-search-python (scraping, no API key).

    Returns a list of dicts: [{video_id, title, duration, channel}].
    """
    if not YOUTUBE_SEARCH_AVAILABLE:
        raise RuntimeError(
            "youtube-search-python is not installed. "
            "pip install youtube-search-python"
        )

    search = VideosSearch(query, limit=max_results)
    raw = search.result().get("result", [])

    results = []
    for item in raw:
        results.append(
            {
                "video_id": item.get("id", ""),
                "title": item.get("title", ""),
                "duration": item.get("duration", ""),
                "channel": item.get("channel", {}).get("name", ""),
            }
        )
    return results


# ---------------------------------------------------------------------------
# High-level finder
# ---------------------------------------------------------------------------

_MIN_SCORE = 50.0


def find_youtube_video(
    artist: str,
    title: str,
    label: Optional[str] = None,
    min_score: float = _MIN_SCORE,
) -> Optional[dict]:
    """
    Search YouTube and return the best-matching video.

    Returns dict with keys: video_id, url, title, score, channel
    or None if nothing passes *min_score*.
    """
    query = build_youtube_search_query(artist, title, label)
    results = search_youtube(query)

    best: Optional[dict] = None
    best_score = 0.0

    for r in results:
        score = match_score(artist, title, r["title"])
        if score > best_score:
            best_score = score
            best = r

    if best is None or best_score < min_score:
        return None

    return {
        "video_id": best["video_id"],
        "url": f"https://www.youtube.com/watch?v={best['video_id']}",
        "title": best["title"],
        "score": round(best_score, 1),
        "channel": best["channel"],
    }


# ---------------------------------------------------------------------------
# Simple JSON file cache
# ---------------------------------------------------------------------------

_DEFAULT_CACHE = Path(__file__).resolve().parent.parent.parent / "data" / "youtube_cache.json"


def _load_cache(path: Path = _DEFAULT_CACHE) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_cache(data: dict, path: Path = _DEFAULT_CACHE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def _cache_key(artist: str, title: str) -> str:
    return f"{normalize_text(artist)}||{normalize_text(title)}"


def find_youtube_video_cached(
    artist: str,
    title: str,
    label: Optional[str] = None,
    min_score: float = _MIN_SCORE,
    cache_path: Path = _DEFAULT_CACHE,
) -> Optional[dict]:
    """Like find_youtube_video but with a JSON file cache."""
    key = _cache_key(artist, title)
    cache = _load_cache(cache_path)

    if key in cache:
        return cache[key]

    result = find_youtube_video(artist, title, label, min_score)

    # Cache both hits and misses (None → null in JSON)
    cache[key] = result
    _save_cache(cache, cache_path)

    return result
