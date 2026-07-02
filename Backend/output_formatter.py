"""Output formatter — concrete implementation of :class:`base.OutputFormatter`.

Encodes a Pillow ``Image`` into a requested output format, handling
format-specific concerns like alpha-channel compositing for formats
that do not support transparency (e.g. JPEG).
"""

from __future__ import annotations

from io import BytesIO

from PIL import Image

from base import OutputFormatter

# ── Supported output formats ──────────────────────────────────────────────

SUPPORTED_FORMATS: set[str] = {"png", "jpeg", "webp", "gif", "bmp", "tiff"}

_FORMAT_ALIASES: dict[str, str] = {
    "jpg": "jpeg",
    "tif": "tiff",
}

_CONTENT_TYPE: dict[str, str] = {
    "png": "image/png",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
    "bmp": "image/bmp",
    "tiff": "image/tiff",
}


# ── Concrete implementation ───────────────────────────────────────────────


class ImageOutputFormatter(OutputFormatter):
    """Default :class:`OutputFormatter` that uses Pillow for encoding.

    The formatter:

    * Resolves format aliases (``"jpg"`` → ``"jpeg"``).
    * Validates the requested format.
    * Composites RGBA images over a white background when the target
      format does not support alpha (JPEG).
    * Saves with optional ``quality`` for lossy formats.
    """

    def format_output(
        self,
        image: Image.Image,
        output_format: str,
        quality: int | None = None,
    ) -> tuple[bytes, str]:
        # ── Resolve alias & validate ──────────────────────────────────
        fmt = _FORMAT_ALIASES.get(output_format, output_format).lower()

        if fmt not in SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported output format: {output_format}")

        # ── Ensure format compatibility ───────────────────────────────
        image = _ensure_format_compatibility(image, fmt)

        # ── Encode ────────────────────────────────────────────────────
        data = _encode(image, fmt, quality)
        content_type = _CONTENT_TYPE[fmt]

        return data, content_type


# ── Internal helpers ──────────────────────────────────────────────────────


def _ensure_format_compatibility(
    image: Image.Image, output_format: str
) -> Image.Image:
    """Convert image mode when the target format cannot handle it natively."""
    if output_format == "jpeg":
        if image.mode == "RGBA":
            bg = Image.new("RGB", image.size, (255, 255, 255))
            bg.paste(image, mask=image.split()[3])  # use alpha as mask
            return bg
        if image.mode in ("P", "L"):
            return image.convert("RGB")
    return image


def _encode(
    image: Image.Image, output_format: str, quality: int | None
) -> bytes:
    """Encode the Pillow image into bytes using the requested format."""
    buf = BytesIO()
    save_kwargs: dict = {}

    if output_format in ("jpeg", "webp") and quality is not None:
        save_kwargs["quality"] = quality

    image.save(buf, format=output_format, **save_kwargs)
    buf.seek(0)
    return buf.getvalue()
