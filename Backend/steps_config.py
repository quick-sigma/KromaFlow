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

from PIL import Image as PILImage
from pydantic import BaseModel

from step import Step, StepInfo, StepVariant, register
from frontend_types import slider_field

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

# Import Real-ESRGAN step to trigger @register decorator.
# The step is always available; model loading is deferred until first execution.
try:
    import real_esrgan_step  # noqa: F401  # register side-effect
except ImportError as exc:
    import logging

    logging.getLogger(__name__).warning(
        "Real-ESRGAN step not available: %s", exc
    )

# Import BRIA RMBG-1.4 Background Removal step to trigger @register decorator.
# Model loading is deferred until first execution.
try:
    import bg_removal_step  # noqa: F401  # register side-effect
except ImportError as exc:
    import logging

    logging.getLogger(__name__).warning(
        "BRIA Background Removal step not available: %s", exc
    )

# Import SRCSet distribution step to trigger @register decorator.
# Available unconditionally (pure Pillow dependency).
try:
    import srcset_distribution  # noqa: F401  # register side-effect
except ImportError as exc:
    import logging

    logging.getLogger(__name__).warning(
        "SRCSet Distribution step not available: %s", exc
    )

# Import Favicon distribution step to trigger @register decorator.
# Available unconditionally (pure Pillow dependency).
try:
    import favicon_distribution  # noqa: F401  # register side-effect
except ImportError as exc:
    import logging

    logging.getLogger(__name__).warning(
        "Favicon Distribution step not available: %s", exc
    )

# Import Resize step to trigger @register decorator.
# Available unconditionally (pure Pillow dependency).
try:
    import resize_step  # noqa: F401  # register side-effect
except ImportError as exc:
    import logging

    logging.getLogger(__name__).warning(
        "Resize step not available: %s", exc
    )

# Import Adjust step to trigger @register decorator.
# Available unconditionally (pure Pillow dependency).
try:
    import adjust_step  # noqa: F401  # register side-effect
except ImportError as exc:
    import logging

    logging.getLogger(__name__).warning(
        "Adjust step not available: %s", exc
    )

# Import PNG, JPEG, ICO output formatters to trigger @register decorator.
# Available unconditionally (pure Pillow dependency).
try:
    import image_formatters  # noqa: F401  # register side-effect
except ImportError as exc:
    import logging

    logging.getLogger(__name__).warning(
        "Image formatters (PNG, JPEG, ICO) not available: %s", exc
    )


# ── Configuration schemas ───────────────────────────────────────────────────


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
            is_base_node=True,
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
