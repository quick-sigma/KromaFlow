"""Resize pipeline step — rescale images to any resolution.

This module provides:

* :class:`ResizeConfig` — configuration schema with preset resolutions,
  custom dimensions, and resize mode selection.
* :class:`ResizeProcessor` — core :class:`~base.Processor` implementation
  that handles the three resize modes (fit, fill, stretch).
* :class:`ResizeStep` — a :class:`~step.Step` subclass registered with the
  ``@register`` decorator for API discovery.

Resolution presets
------------------
Common display / device resolutions are available as a dropdown, plus a
``"custom"`` option that lets the user specify arbitrary width and height.

**Note**: this step is marked as **repeatable** — it can appear more than
once in a pipeline (e.g. resize to an intermediate size first, then to
the final size).

Resize modes
------------
* **Fit** — scales the image to fit *within* the target dimensions while
  preserving aspect ratio; the resulting image may be smaller than the
  target on one axis.
* **Fill** — scales the image to *cover* the target dimensions while
  preserving aspect ratio; the overflow is cropped away.
* **Stretch** — scales the image to the exact target dimensions without
  preserving aspect ratio.
"""

from __future__ import annotations

from typing import Literal

from PIL import Image as PILImage
from pydantic import BaseModel, Field

from base import Processor
from frontend_types import dropdown_field
from step import Step, StepVariant, register

# ── Resolution presets ──────────────────────────────────────────────────────
# Maps preset key → (width, height)

RESOLUTION_PRESETS: dict[str, tuple[int, int]] = {
    "custom": (0, 0),
    "3840x2160": (3840, 2160),
    "2560x1440": (2560, 1440),
    "1920x1080": (1920, 1080),
    "1600x900": (1600, 900),
    "1366x768": (1366, 768),
    "1280x720": (1280, 720),
    "1024x768": (1024, 768),
    "800x600": (800, 600),
    "640x480": (640, 480),
}

# Order for the dropdown: Custom first, then descending resolution
_PRESET_OPTIONS: list[str] = [
    "custom",
    "3840x2160",
    "2560x1440",
    "1920x1080",
    "1600x900",
    "1366x768",
    "1280x720",
    "1024x768",
    "800x600",
    "640x480",
]

ResizeMode = Literal["fit", "fill", "stretch"]
"""Allowed resize modes."""

# Build the Literal type for the preset field from the preset keys
_PresetType = Literal[
    "custom",
    "3840x2160",
    "2560x1440",
    "1920x1080",
    "1600x900",
    "1366x768",
    "1280x720",
    "1024x768",
    "800x600",
    "640x480",
]


# ── Configuration schema ────────────────────────────────────────────────────


class ResizeConfig(BaseModel):
    """Configuration for the Resize image processor.

    Attributes
    ----------
    preset : str
        A named resolution preset from :data:`RESOLUTION_PRESETS`.
        When set to ``"custom"`` the :attr:`width` and :attr:`height`
        fields are used instead.
    width : int
        Target width in pixels.  Only used when ``preset == "custom"``.
    height : int
        Target height in pixels.  Only used when ``preset == "custom"``.
    mode : ResizeMode
        How to map the source image onto the target dimensions:
        ``"fit"``, ``"fill"``, or ``"stretch"``.
    """

    preset: _PresetType = dropdown_field(
        default="1920x1080",
        options=_PRESET_OPTIONS,
        title="Preset Resolution",
        description="Select a common resolution preset, or choose 'Custom' "
        "to set your own width and height.",
    )

    width: int = Field(
        default=1920,
        ge=1,
        le=76800,
        title="Width",
        description="Target width in pixels (used when preset is 'Custom').",
    )

    height: int = Field(
        default=1080,
        ge=1,
        le=76800,
        title="Height",
        description="Target height in pixels (used when preset is 'Custom').",
    )

    mode: ResizeMode = dropdown_field(
        default="fit",
        options=["fit", "fill", "stretch"],
        ui_type="radiogroup",
        title="Resize Mode",
        description="'Fit' — resize to fit within the target dimensions, "
        "preserving aspect ratio.  "
        "'Fill' — resize to cover the target dimensions, cropping if needed.  "
        "'Stretch' — resize to exactly the target dimensions, ignoring aspect ratio.",
    )


# ── Core processor logic ────────────────────────────────────────────────────


class ResizeProcessor(Processor):
    """Resizes an image to the specified dimensions using the chosen mode.

    The processor supports three modes:

    * ``"fit"`` — scale to fit *within* the target box, preserving aspect
      ratio.  The returned image may be smaller than the target on one
      axis (no padding is added).
    * ``"fill"`` — scale to *cover* the target box, preserving aspect
      ratio; crop the overflow.
    * ``"stretch"`` — scale to the exact target dimensions (ignores aspect
      ratio).
    """

    def process(
        self,
        image: PILImage.Image,
        config: object | None = None,
    ) -> PILImage.Image:
        """Resize *image* according to *config*.

        Parameters
        ----------
        image : PIL.Image.Image
            Source image (not mutated).
        config : ResizeConfig | None
            Resize configuration.  When ``None``, defaults are used.

        Returns
        -------
        PIL.Image.Image
            Resized image.
        """
        cfg = config if isinstance(config, ResizeConfig) else ResizeConfig()

        # ── Resolve target dimensions ──────────────────────────────────────
        if cfg.preset and cfg.preset != "custom":
            try:
                width, height = RESOLUTION_PRESETS[cfg.preset]
            except KeyError:
                # Fall back to custom dimensions for unknown presets
                width, height = cfg.width, cfg.height
        else:
            width, height = cfg.width, cfg.height

        # ── Apply the selected resize mode ─────────────────────────────────
        if cfg.mode == "stretch":
            return self._stretch(image, width, height)

        if cfg.mode == "fill":
            return self._fill(image, width, height)

        # mode == "fit"
        return self._fit(image, width, height)

    # ── Mode implementations ───────────────────────────────────────────────

    @staticmethod
    def _stretch(image: PILImage.Image, width: int, height: int) -> PILImage.Image:
        """Resize to exact dimensions, ignoring aspect ratio."""
        return image.copy().resize((width, height), PILImage.Resampling.LANCZOS)

    @staticmethod
    def _fill(
        image: PILImage.Image, width: int, height: int
    ) -> PILImage.Image:
        """Resize to cover the target box, cropping overflow."""
        img = image.copy()
        target_ratio = width / height
        img_ratio = img.width / img.height

        if img_ratio > target_ratio:
            # Image is proportionally wider → match heights, crop width
            new_h = height
            new_w = round(height * img_ratio)
        else:
            # Image is proportionally taller → match widths, crop height
            new_w = width
            new_h = round(width / img_ratio)

        img = img.resize((new_w, new_h), PILImage.Resampling.LANCZOS)

        # Centre crop
        left = (new_w - width) // 2
        top = (new_h - height) // 2
        return img.crop((left, top, left + width, top + height))

    @staticmethod
    def _fit(
        image: PILImage.Image,
        width: int,
        height: int,
    ) -> PILImage.Image:
        """Resize to fit within the target box, preserving aspect ratio.

        The image is scaled so that it fits *entirely* inside the target
        dimensions — it may be smaller than the target on one axis.
        Unlike ``_fill`` and ``_stretch``, no padding or cropping is
        applied.

        Both upscaling and downscaling are supported.
        """
        img = image.copy()
        src_w, src_h = img.size
        scale = min(width / src_w, height / src_h)
        new_w = round(src_w * scale)
        new_h = round(src_h * scale)
        return img.resize((new_w, new_h), PILImage.Resampling.LANCZOS)


# ── Step wrapper ────────────────────────────────────────────────────────────


@register(
    id="resize",
    name="Resize",
    description=(
        "Resize an image to a specific resolution. "
        "Choose from common display presets (Full HD, 4K, HD, …) or "
        "set a custom width and height.  Supports fit, fill, and stretch modes."
    ),
    version="1.0.0",
)
class ResizeStep(Step[ResizeConfig]):
    """Pipeline step that wraps :class:`ResizeProcessor`.

    This step is available unconditionally (pure Pillow dependency) and is
    **repeatable** — it can appear multiple times in the same pipeline
    (e.g. first shrink to an intermediate size, then to the final size).

    Examples
    --------
    Resize to Full HD using a preset::

        {"step_id": "resize", "config": {"preset": "1920x1080", "mode": "fit"}}

    Resize to a custom size with fill mode::

        {"step_id": "resize", "config": {
            "preset": "custom", "width": 800, "height": 600, "mode": "fill"
        }}
    """

    def __init__(self) -> None:
        super().__init__(
            component=ResizeProcessor(),
            variant=StepVariant.PROCESSOR,
            id="resize",
            name="Resize",
            description=(
                "Resize an image to a specific resolution. "
                "Choose from common display presets (Full HD, 4K, HD, …) or "
                "set a custom width and height."
            ),
            version="1.0.0",
            config_schema=ResizeConfig,
            repeatable=True,
        )
