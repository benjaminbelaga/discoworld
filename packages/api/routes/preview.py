"""Preview routes — YouTube video matching for releases."""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..youtube_matcher import find_youtube_video_cached

router = APIRouter(prefix="/api/preview", tags=["preview"])


@router.get("/youtube")
async def youtube_preview(
    artist: str = Query(..., description="Artist name"),
    title: str = Query(..., description="Track or release title"),
    label: Optional[str] = Query(None, description="Label name (optional, improves search)"),
):
    """
    Find the best-matching YouTube video for a given artist + title.

    Returns video_id, url, score (0-100), title, and channel.
    Results are cached in a local JSON file.
    """
    try:
        result = find_youtube_video_cached(artist, title, label)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No YouTube match found for '{artist} - {title}'",
        )

    return result
