"""Data models for image processing orders."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, field_validator


class ProcessingInstructions(BaseModel):
    """Structured instructions describing how to process an image.

    Sent as a JSON object from the frontend. Each field is optional
    so an empty object ``{}`` means "no transformations".
    """

    resize: Optional[dict] = None  # {"width": int, "height": int, "percent": float}
    rotate: Optional[int] = None  # degrees clockwise (90, 180, 270, …)
    flip: Optional[str] = None  # "horizontal" | "vertical"
    grayscale: Optional[bool] = None
    crop: Optional[dict] = None  # {"left": int, "top": int, "right": int, "bottom": int}
    quality: Optional[int] = 85  # for lossy formats (1-100)
    remove_watermark: Optional[bool] = None  # enable Gemini watermark removal

    @field_validator("rotate")
    @classmethod
    def rotate_valid(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (0 <= v < 360):
            raise ValueError("Rotate must be between 0 and 359")
        return v

    @field_validator("flip")
    @classmethod
    def flip_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("horizontal", "vertical"):
            raise ValueError('Flip must be "horizontal" or "vertical"')
        return v

    @field_validator("quality")
    @classmethod
    def quality_in_range(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (1 <= v <= 100):
            raise ValueError("Quality must be between 1 and 100")
        return v

    @field_validator("crop")
    @classmethod
    def crop_valid(cls, v: Optional[dict]) -> Optional[dict]:
        if v is not None:
            required = {"left", "top", "right", "bottom"}
            if not required.issubset(v.keys()):
                raise ValueError(f"Crop must contain {required}")
            for key in required:
                if not isinstance(v[key], int) or v[key] < 0:
                    raise ValueError(f"Crop {key} must be a non-negative integer")
            if v["right"] <= v["left"] or v["bottom"] <= v["top"]:
                raise ValueError("Crop right must be > left, bottom must be > top")
        return v
