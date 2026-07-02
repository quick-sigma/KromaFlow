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

from base import OutputFormatter, Processor
from models import ProcessingInstructions
from output_formatter import ImageOutputFormatter
from processor import ImageProcessor
from step import Step, StepInfo, StepVariant, register

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


class ImageProcessingConfig(ProcessingInstructions):
    """Configuration for the :class:`ImageProcessorStep`.

    This is a direct subclass of :class:`~models.ProcessingInstructions` so
    that the existing processor interface is preserved.  The frontend will
    receive the JSON Schema of all recognised fields (resize, rotate,
    flip, grayscale, crop, quality).
    """


class WatermarkRemovalConfig(BaseModel):
    """Configuration for the :class:`WatermarkRemovalStep`.

    Attributes
    ----------
    enabled : bool
        Whether to attempt watermark detection and removal.
    """

    enabled: bool = True


class OutputFormatConfig(BaseModel):
    """Configuration for output-formatter steps.

    Attributes
    ----------
    format : str
        Target image format (e.g. ``"png"``, ``"jpeg"``, ``"webp"``,
        ``"avif"``).
    quality : int | None
        Compression quality for lossy formats (1–100).  ``None`` means
        the encoder default.
    """

    format: str = "png"
    quality: Optional[int] = 85


# ── Concrete Step implementations ────────────────────────────────────────────


@register(
    name="image-processor",
    description="Apply crop, resize, rotate, flip, and grayscale transformations",
    version="1.0.0",
)
class ImageProcessorStep(Step[ImageProcessingConfig]):
    """Wraps :class:`~processor.ImageProcessor` as a pipeline step.

    The configuration schema is :class:`ImageProcessingConfig`, which is
    a subclass of :class:`~models.ProcessingInstructions`.  The base
    :meth:`Step.execute` passes the config directly to
    :meth:`Processor.process`.
    """

    def __init__(self) -> None:
        super().__init__(
            component=ImageProcessor(),
            variant=StepVariant.PROCESSOR,
            name="image-processor",
            description="Apply crop, resize, rotate, flip, and grayscale transformations",
            version="1.0.0",
            config_schema=ImageProcessingConfig,
        )


@register(
    name="watermark-remover",
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
            name="watermark-remover",
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
        """Run watermark removal if *config* says it's enabled.

        When ``config.enabled`` is ``False`` the image is returned
        unchanged (copied).
        """
        if config is not None and not config.enabled:
            return image.copy()

        return self._component.process(image, None)


@register(
    name="image-output-formatter",
    description="Encode an image to PNG, JPEG, WebP, GIF, BMP, or TIFF",
    version="1.0.0",
)
class ImageOutputFormatterStep(Step[OutputFormatConfig]):
    """Wraps :class:`~output_formatter.ImageOutputFormatter` as a pipeline step."""

    def __init__(self) -> None:
        super().__init__(
            component=ImageOutputFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            name="image-output-formatter",
            description="Encode an image to PNG, JPEG, WebP, GIF, BMP, or TIFF",
            version="1.0.0",
            config_schema=OutputFormatConfig,
        )


if _avif_formatter_available:

    @register(
        name="avif-output-formatter",
        description="Encode an image to AVIF (AV1 Image File Format) with superior compression",
        version="1.0.0",
    )
    class AVIFOutputFormatterStep(Step[OutputFormatConfig]):
        """Wraps :class:`~avif_output_formatter.AVIFOutputFormatter` as a
        pipeline step (only available if Pillow's AVIF plugin is present).
        """

        def __init__(self) -> None:
            super().__init__(
                component=AVIFOutputFormatter(),
                variant=StepVariant.OUTPUT_FORMATTER,
                name="avif-output-formatter",
                description="Encode an image to AVIF (AV1 Image File Format) with superior compression",
                version="1.0.0",
                config_schema=OutputFormatConfig,
            )
