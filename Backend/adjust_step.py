"""Adjust pipeline step — auto-crop an image to the visible content bounds.

This module provides:

* :class:`AdjustConfig` — configuration schema with alpha threshold and
  padding controls.
* :class:`AdjustProcessor` — core :class:`~base.Processor` implementation
  that finds the bounding box of non-transparent pixels and crops the
  image tightly around the visible content.
* :class:`AdjustStep` — a :class:`~step.Step` subclass registered with the
  ``@register`` decorator for API discovery.

Use case
--------
After removing the background from an image, the focused object often
occupies only a small portion of the canvas, leaving a lot of empty
transparent space.  This processor automatically trims that empty space
so the canvas fits tightly around the visible content — equivalent to
manually cropping in Paint.

The crop is based on the **alpha channel** (pixels with alpha ≤ threshold
are considered empty).  For RGB images without alpha, every pixel is
treated as visible.
"""

from __future__ import annotations

from PIL import Image as PILImage
from pydantic import BaseModel, Field

from base import Processor
from frontend_types import slider_field, switch_field
from step import Step, StepVariant, register


# ── Configuration schema ────────────────────────────────────────────────────


class AdjustConfig(BaseModel):
    """Configuration for the Adjust (auto-crop) processor.

    Attributes
    ----------
    alpha_threshold : int
        Alpha value (0–255) below which a pixel is considered transparent /
        empty.  0 means only fully transparent pixels are trimmed.
    padding : int
        Extra pixels added around the computed bounding box.  A small
        padding (4–8 px) prevents the object from being clipped too
        tightly.
    padding_mode : str
        How padding is applied: ``"absolute"`` adds exactly *padding*
        pixels on each side; ``"relative"`` adds a percentage of the
        bounding box dimensions.
    preserve_square : bool
        If ``True``, the cropped region is extended to a square (the
        larger side) so the output is always 1:1 aspect ratio.  Useful
        when the result will be used for icon/profile photo generation.
    """

    alpha_threshold: int = slider_field(
        default=0,
        ge=0,
        le=255,
        title="Alpha Threshold",
        description="Alpha value (0–255) below which a pixel is considered "
        "transparent. Default 0 trims only fully transparent pixels.",
    )

    padding: int = slider_field(
        default=4,
        ge=0,
        le=100,
        title="Padding",
        description="Extra pixels added around the visible content "
        "(0 = tight crop, 4–8 recommended).",
    )

    preserve_square: bool = switch_field(
        default=False,
        title="Preserve Square",
        description="If enabled, the cropped region is extended to a square "
        "(1:1 aspect ratio). Useful for profile photos or icons.",
    )


# ── Core processor logic ────────────────────────────────────────────────────


class AdjustProcessor(Processor):
    """Auto-crops an image to the bounding box of its visible content.

    The processor analyses the alpha channel to find the smallest
    rectangle that contains all non-transparent pixels, then crops the
    image to that rectangle (with optional padding).

    For images without an alpha channel, the full image is returned
    unchanged.
    """

    def process(
        self,
        image: PILImage.Image,
        config: object | None = None,
    ) -> PILImage.Image:
        """Crop *image* to the visible content bounds.

        Parameters
        ----------
        image : PIL.Image.Image
            Source image (not mutated if no crop is needed).
        config : AdjustConfig | None
            Adjustment configuration.  When ``None``, defaults are used.

        Returns
        -------
        PIL.Image.Image
            Cropped image (or a copy if no crop was needed).
        """
        cfg = config if isinstance(config, AdjustConfig) else AdjustConfig()

        # Work on a copy
        img = image.copy()

        # If there's no alpha channel, there's nothing to trim
        if img.mode not in ("RGBA", "LA", "PA"):
            return img

        # ── Find bounding box of visible pixels ──────────────────────
        bbox = self._find_visible_bbox(img, cfg.alpha_threshold)

        # If nothing visible or the bbox covers the whole image, return as-is
        if bbox is None:
            # Nothing visible — return a small transparent image
            return PILImage.new("RGBA", (1, 1), (0, 0, 0, 0))

        x1, y1, x2, y2 = bbox

        # If crop covers the whole image (or nearly), skip
        if (
            x1 <= 0
            and y1 <= 0
            and x2 >= img.width
            and y2 >= img.height
        ):
            return img

        # ── Apply padding ─────────────────────────────────────────────
        pad_x = pad_y = cfg.padding

        x1 = max(0, x1 - pad_x)
        y1 = max(0, y1 - pad_y)
        x2 = min(img.width, x2 + pad_x)
        y2 = min(img.height, y2 + pad_y)

        cropped = img.crop((x1, y1, x2, y2))

        # ── Preserve square ──────────────────────────────────────────
        if cfg.preserve_square:
            cropped = self._make_square(cropped)

        return cropped

    # ── Internal helpers ───────────────────────────────────────────────

    @staticmethod
    def _find_visible_bbox(
        image: PILImage.Image,
        alpha_threshold: int,
    ) -> tuple[int, int, int, int] | None:
        """Return ``(left, top, right, bottom)`` of visible pixels.

        Pixels whose alpha channel is ≤ *alpha_threshold* are considered
        invisible.  Returns ``None`` when no visible pixel is found.
        """
        if image.mode == "RGBA":
            r, g, b, a = image.split()
        elif image.mode in ("LA", "PA"):
            # LA: (L, A), PA: (P, A)
            a = image.split()[-1]
        else:
            # No alpha → everything is visible
            return (0, 0, image.width, image.height)

        # Get alpha as a list of bytes
        alpha_bytes = a.tobytes()
        width = image.width
        height = image.height

        # Find top-most visible row
        top = None
        for y in range(height):
            row_start = y * width
            row_end = row_start + width
            for px in alpha_bytes[row_start:row_end]:
                if px > alpha_threshold:
                    top = y
                    break
            if top is not None:
                break

        if top is None:
            return None  # no visible pixels

        # Find bottom-most visible row
        bottom = None
        for y in range(height - 1, -1, -1):
            row_start = y * width
            row_end = row_start + width
            for px in alpha_bytes[row_start:row_end]:
                if px > alpha_threshold:
                    bottom = y
                    break
            if bottom is not None:
                break

        # Find left-most visible column
        left = None
        for x in range(width):
            for y in range(top, bottom + 1):
                idx = y * width + x
                if alpha_bytes[idx] > alpha_threshold:
                    left = x
                    break
            if left is not None:
                break

        # Find right-most visible column
        right = None
        for x in range(width - 1, -1, -1):
            for y in range(top, bottom + 1):
                idx = y * width + x
                if alpha_bytes[idx] > alpha_threshold:
                    right = x
                    break
            if right is not None:
                break

        return (left, top, right + 1, bottom + 1)

    @staticmethod
    def _make_square(image: PILImage.Image) -> PILImage.Image:
        """Extend the image to a square by adding transparent padding."""
        w, h = image.size
        if w == h:
            return image

        side = max(w, h)
        square = PILImage.new("RGBA", (side, side), (0, 0, 0, 0))
        paste_x = (side - w) // 2
        paste_y = (side - h) // 2
        square.paste(image, (paste_x, paste_y))
        return square


# ── Step wrapper ────────────────────────────────────────────────────────────


@register(
    id="adjust",
    name="Adjust",
    description=(
        "Auto-crop an image to the visible content bounds. "
        "Trims transparent/empty space so the canvas fits tightly around "
        "the focused object — ideal after background removal."
    ),
    version="1.0.0",
)
class AdjustStep(Step[AdjustConfig]):
    """Pipeline step that wraps :class:`AdjustProcessor`.

    This step is available unconditionally (pure Pillow dependency).
    """

    def __init__(self) -> None:
        super().__init__(
            component=AdjustProcessor(),
            variant=StepVariant.PROCESSOR,
            id="adjust",
            name="Adjust",
            description=(
                "Auto-crop an image to the visible content bounds. "
                "Trims transparent/empty space so the canvas fits tightly "
                "around the focused object."
            ),
            version="1.0.0",
            config_schema=AdjustConfig,
        )
