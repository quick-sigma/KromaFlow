"""Configuration schemas and concrete Step implementations.

This module ties the existing :class:`~base.Processor` and
:class:`~base.OutputFormatter` implementations into the :class:`~step.Step`
abstraction so they are discoverable by the frontend via the
``GET /api/steps`` endpoint.

Each concrete step:

* defines a **config schema** (a :class:`pydantic.BaseModel`) that the
  frontend uses to render a configuration form;
* uses the :func:`@register <step.register>` decorator to populate the
  global step registry;
* wraps the corresponding :mod:`base` implementation.
"""

from __future__ import annotations

from typing import Optional

from PIL import Image as PILImage
from pydantic import BaseModel

from step import Step, StepInfo, StepVariant, register
from frontend_types import slider_field, dropdown_field

# ── Attempt to import optional components ──────────────────────────────────

try:
    from avif_output_formatter import AVIFOutputFormatter

    _avif_formatter_available = True
except ImportError:
    _avif_formatter_available = False

try:
    from watermark_remover import WatermarkRemoverProcessor

    _watermark_available = True
except ImportError:
    _watermark_available = False


# ── Configuration schemas ───────────────────────────────────────────────────


class ImageProcessorConfig(BaseModel):
    """Configuration for the :class:`ImageProcessorStep`.

    Matches the fields accepted by :class:`~processor.ImageProcessor`
    so that configs pass through transparently.
    """

    resize_width: Optional[int] = None
    resize_height: Optional[int] = None
    resize_percent: Optional[float] = None
    rotate: Optional[int] = None
    flip: Optional[str] = None
    grayscale: Optional[bool] = None
    crop_left: Optional[int] = None
    crop_top: Optional[int] = None
    crop_right: Optional[int] = None
    crop_bottom: Optional[int] = None


class ImageOutputFormatConfig(BaseModel):
    """Configuration for the :class:`ImageOutputFormatterStep`.

    Attributes
    ----------
    format : str
        Output image format.
    quality : int
        Compression quality for lossy formats (0–100).
    """

    format: str = dropdown_field(
        default="png",
        options=["png", "jpeg", "webp", "gif", "bmp", "tiff"],
        title="Format",
        description="Output image format",
    )
    quality: int = slider_field(
        default=85,
        ge=0,
        le=100,
        title="Quality",
        description="Compression quality (0 = lowest, 100 = highest)",
    )


class WatermarkRemovalConfig(BaseModel):
    """Configuration for the :class:`WatermarkRemovalStep`.

    This step currently requires no user-configurable options; watermark
    removal runs whenever the step is present in the pipeline.
    """

    pass


class AVIFOutputFormatConfig(BaseModel):
    """Configuration for the AVIF output-formatter step.

    Attributes
    ----------
    quality : int
        Compression quality (0–100).  Rendered as a slider in the frontend.
    """

    quality: int = slider_field(
        default=85,
        ge=0,
        le=100,
        title="Quality",
        description="Compression quality (0 = lowest, 100 = highest)",
    )


# ── Concrete Step implementations ────────────────────────────────────────────


@register(
    id="img_proc",
    name="Image Processor",
    description="Crop, resize, rotate, flip, and convert to grayscale",
    version="1.0.0",
)
class ImageProcessorStep(Step[ImageProcessorConfig]):
    """Wraps :class:`~processor.ImageProcessor` as a pipeline step."""

    def __init__(self) -> None:
        from processor import ImageProcessor

        super().__init__(
            component=ImageProcessor(),
            variant=StepVariant.PROCESSOR,
            id="img_proc",
            name="Image Processor",
            description="Crop, resize, rotate, flip, and convert to grayscale",
            version="1.0.0",
            config_schema=ImageProcessorConfig,
        )

    def execute(
        self,
        image: PILImage.Image,
        config: ImageProcessorConfig | None = None,
        /,
        **kwargs,
    ) -> PILImage.Image:
        """Convert the flat config fields into ProcessingInstructions and delegate."""
        from models import ProcessingInstructions, ResizeInstruction

        if config is None:
            return self._component.process(image, None)

        instructions = ProcessingInstructions(
            resize=(
                ResizeInstruction(
                    width=config.resize_width,
                    height=config.resize_height,
                    percent=config.resize_percent,
                )
                if any([config.resize_width, config.resize_height, config.resize_percent])
                else None
            ),
            rotate=config.rotate,
            flip=config.flip,
            grayscale=config.grayscale,
            crop=(
                {
                    "left": config.crop_left,
                    "top": config.crop_top,
                    "right": config.crop_right,
                    "bottom": config.crop_bottom,
                }
                if all([
                    config.crop_left is not None,
                    config.crop_top is not None,
                    config.crop_right is not None,
                    config.crop_bottom is not None,
                ])
                else None
            ),
        )
        return self._component.process(image, instructions)


@register(
    id="img_fmt",
    name="Image Output",
    description="Encode an image to the requested format (PNG, JPEG, WebP, etc.)",
    version="1.0.0",
)
class ImageOutputFormatterStep(Step[ImageOutputFormatConfig]):
    """Wraps :class:`~output_formatter.ImageOutputFormatter` as a pipeline step."""

    def __init__(self) -> None:
        from output_formatter import ImageOutputFormatter

        super().__init__(
            component=ImageOutputFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="img_fmt",
            name="Image Output",
            description="Encode an image to the requested format (PNG, JPEG, WebP, etc.)",
            version="1.0.0",
            config_schema=ImageOutputFormatConfig,
        )


@register(
    id="wm_remover",
    name="Watermark Remover",
    description="Detect and remove Gemini / Nano Banana watermarks using reverse-alpha blending",
    version="1.0.0",
)
class WatermarkRemovalStep(Step[WatermarkRemovalConfig]):
    """Wraps :class:`~watermark_remover.WatermarkRemoverProcessor` as a
    pipeline step (if the optional dependency is installed).

    If the dependency is missing, instantiation raises ``RuntimeError``
    and :func:`get_registered_steps` silently skips this step.
    """

    def __init__(self) -> None:
        if not _watermark_available:
            raise RuntimeError(
                "WatermarkRemoverProcessor is not available; "
                "install 'remove-ai-watermarks' to use this step"
            )
        super().__init__(
            component=WatermarkRemoverProcessor(),
            variant=StepVariant.PROCESSOR,
            id="wm_remover",
            name="Watermark Remover",
            description="Detect and remove Gemini / Nano Banana watermarks using reverse-alpha blending",
            version="1.0.0",
            config_schema=WatermarkRemovalConfig,
        )

    def execute(
        self,
        image: PILImage.Image,
        config: WatermarkRemovalConfig | None = None,
        /,
        **kwargs,
    ) -> PILImage.Image:
        """Always run watermark removal when this step is in the pipeline."""
        return self._component.process(image, None)


if _avif_formatter_available:

    @register(
        id="avif_fmt",
        name="AVIF Image Output",
        description="Encode an image to AVIF (AV1 Image File Format) with superior compression",
        version="1.0.0",
    )
    class AVIFOutputFormatterStep(Step[AVIFOutputFormatConfig]):
        """Wraps :class:`~avif_output_formatter.AVIFOutputFormatter` as a
        pipeline step (only available if Pillow's AVIF plugin is present).
        """

        def __init__(self) -> None:
            super().__init__(
                component=AVIFOutputFormatter(),
                variant=StepVariant.OUTPUT_FORMATTER,
                id="avif_fmt",
                name="AVIF Image Output",
                description="Encode an image to AVIF (AV1 Image File Format) with superior compression",
                version="1.0.0",
                config_schema=AVIFOutputFormatConfig,
            )

        @property
        def default_format(self) -> str:
            """This formatter only produces AVIF."""
            return "avif"
