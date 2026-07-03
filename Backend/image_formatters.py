"""PNG, JPEG, and ICO output formatters — concrete :class:`base.OutputFormatter`
implementations for common image formats.

Each formatter is paired with a :class:`~step.Step` subclass so they appear
as selectable output steps in the pipeline editor.

Supported formats
-----------------
* **PNG** — lossless, supports alpha transparency natively.
  Configurable compression level (1–9).
* **JPEG** — lossy, does **not** support alpha.  RGBA images are
  composited over a configurable background colour before encoding.
  Configurable quality (1–100).
* **ICO** — lossless icon format, supports alpha natively.
  No quality setting needed.
"""

from __future__ import annotations

from io import BytesIO

from PIL import Image
from pydantic import BaseModel

from base import OutputFormatter
from frontend_types import slider_field, dropdown_field
from step import Step, StepVariant, register

# ═══════════════════════════════════════════════════════════════════════════
# ── PNG
# ═══════════════════════════════════════════════════════════════════════════

PNG_CONTENT_TYPE: str = "image/png"


class PNGConfig(BaseModel):
    """Configuration for the PNG output-formatter step.

    Attributes
    ----------
    quality : int
        PNG compression level (1 = fastest/largest, 9 = slowest/smallest).
        Internally stored as ``quality`` so the pipeline can forward it
        to the formatter.  Default is 6, which offers a good balance.
    """

    quality: int = slider_field(
        default=6,
        ge=1,
        le=9,
        title="Compression Level",
        description="PNG compression level (1 = fastest/largest, 9 = slowest/smallest)",
    )


class PNGOutputFormatter(OutputFormatter):
    """Encodes images to PNG.

    PNG supports alpha transparency natively, so RGBA images are encoded
    as-is without compositing.
    """

    def format_output(
        self,
        image: Image.Image,
        output_format: str,
        quality: int | None = None,
    ) -> tuple[bytes, str]:
        fmt = output_format.lower()
        if fmt != "png":
            raise ValueError(
                f"Unsupported output format: {output_format}. "
                f"{self.__class__.__name__} only supports PNG."
            )

        # Grayscale → RGB for consistency
        if image.mode == "L":
            image = image.convert("RGB")

        buf = BytesIO()
        # quality maps to compress_level for PNG
        compress_level = quality if quality is not None else 6
        image.save(buf, format="PNG", compress_level=compress_level)
        buf.seek(0)
        return buf.getvalue(), PNG_CONTENT_TYPE


@register(
    id="png_fmt",
    name="PNG Image Output",
    description="Encode an image to PNG (lossless, supports transparency)",
    version="1.0.0",
)
class PNGOutputFormatterStep(Step[PNGConfig]):
    """Pipeline step that wraps :class:`PNGOutputFormatter`."""

    def __init__(self) -> None:
        super().__init__(
            component=PNGOutputFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="png_fmt",
            name="PNG Image Output",
            description="Encode an image to PNG (lossless, supports transparency)",
            version="1.0.0",
            config_schema=PNGConfig,
        )

    @property
    def default_format(self) -> str:
        return "png"


# ═══════════════════════════════════════════════════════════════════════════
# ── JPEG
# ═══════════════════════════════════════════════════════════════════════════

JPEG_CONTENT_TYPE: str = "image/jpeg"


class JPEGConfig(BaseModel):
    """Configuration for the JPEG output-formatter step.

    Attributes
    ----------
    quality : int
        Compression quality (1–100).  Higher values give better quality
        but larger file sizes.
    """

    quality: int = slider_field(
        default=85,
        ge=1,
        le=100,
        title="Quality",
        description="Compression quality (1 = lowest, 100 = highest)",
    )


class JPEGOutputFormatter(OutputFormatter):
    """Encodes images to JPEG.

    JPEG does **not** support alpha transparency, so RGBA images are
    composited over the configured background colour before encoding.
    """

    def format_output(
        self,
        image: Image.Image,
        output_format: str,
        quality: int | None = None,
    ) -> tuple[bytes, str]:
        fmt = output_format.lower()
        if fmt not in ("jpeg", "jpg"):
            raise ValueError(
                f"Unsupported output format: {output_format}. "
                f"{self.__class__.__name__} only supports JPEG."
            )

        img = image.copy()

        # Composite RGBA onto white background (JPEG has no alpha support)
        if img.mode == "RGBA":
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])  # use alpha as mask
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        quality_val = quality if quality is not None else 85
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=quality_val)
        buf.seek(0)
        return buf.getvalue(), JPEG_CONTENT_TYPE


@register(
    id="jpeg_fmt",
    name="JPEG Image Output",
    description="Encode an image to JPEG (lossy, smaller file sizes, no transparency)",
    version="1.0.0",
)
class JPEGOutputFormatterStep(Step[JPEGConfig]):
    """Pipeline step that wraps :class:`JPEGOutputFormatter`."""

    def __init__(self) -> None:
        super().__init__(
            component=JPEGOutputFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="jpeg_fmt",
            name="JPEG Image Output",
            description="Encode an image to JPEG (lossy, smaller file sizes, no transparency)",
            version="1.0.0",
            config_schema=JPEGConfig,
        )

    @property
    def default_format(self) -> str:
        return "jpeg"


# ═══════════════════════════════════════════════════════════════════════════
# ── ICO
# ═══════════════════════════════════════════════════════════════════════════

ICO_CONTENT_TYPE: str = "image/x-icon"


class ICOConfig(BaseModel):
    """Configuration for the ICO output-formatter step.

    ICO is a lossless icon format.  No quality settings are needed.
    """

    pass


class ICOOutputFormatter(OutputFormatter):
    """Encodes images to ICO (Windows icon format).

    ICO supports alpha transparency natively.  No quality/compression
    settings apply.
    """

    def format_output(
        self,
        image: Image.Image,
        output_format: str,
        quality: int | None = None,
    ) -> tuple[bytes, str]:
        fmt = output_format.lower()
        if fmt != "ico":
            raise ValueError(
                f"Unsupported output format: {output_format}. "
                f"{self.__class__.__name__} only supports ICO."
            )

        img = image.copy()

        # Ensure RGBA for ICO (best compatibility)
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        # ICO has a max dimension limit — resize if needed
        max_ico_dim = 256
        if img.width > max_ico_dim or img.height > max_ico_dim:
            scale = min(max_ico_dim / img.width, max_ico_dim / img.height)
            new_w = round(img.width * scale)
            new_h = round(img.height * scale)
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        buf = BytesIO()
        img.save(buf, format="ICO")
        buf.seek(0)
        return buf.getvalue(), ICO_CONTENT_TYPE


@register(
    id="ico_fmt",
    name="ICO Image Output",
    description="Encode an image to ICO (Windows icon format, supports transparency)",
    version="1.0.0",
)
class ICOOutputFormatterStep(Step[ICOConfig]):
    """Pipeline step that wraps :class:`ICOOutputFormatter`."""

    def __init__(self) -> None:
        super().__init__(
            component=ICOOutputFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="ico_fmt",
            name="ICO Image Output",
            description="Encode an image to ICO (Windows icon format, supports transparency)",
            version="1.0.0",
            config_schema=ICOConfig,
        )

    @property
    def default_format(self) -> str:
        return "ico"
