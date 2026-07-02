"""Image processing engine.

Takes an ``Order`` (which wraps a Pillow ``Image`` together with
structured instructions) and applies the requested transformations,
returning the result as raw bytes with the appropriate MIME type.
"""

from __future__ import annotations

from io import BytesIO

from PIL import Image

from models import Order

# ── Supported output formats ──────────────────────────────────────────────

SUPPORTED_FORMATS: set[str] = {"png", "jpeg", "webp", "gif", "bmp", "tiff"}

# Aliases – common alternative extensions mapped to the canonical name
_FORMAT_ALIASES: dict[str, str] = {
    "jpg": "jpeg",
    "tif": "tiff",
}

# Canonical format → MIME type
_CONTENT_TYPE: dict[str, str] = {
    "png": "image/png",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
    "bmp": "image/bmp",
    "tiff": "image/tiff",
}


# ── Public API ────────────────────────────────────────────────────────────


def process_order(order: Order) -> tuple[bytes, str]:
    """Apply the transformations described by ``order.instructions``.

    Parameters
    ----------
    order : Order
        The order to process.  ``order.image`` is **not** mutated – a
        copy is made internally.

    Returns
    -------
    tuple[bytes, str]
        ``(image_data, content_type)`` where ``image_data`` is the
        encoded result and ``content_type`` is the MIME type (e.g.
        ``"image/png"``).

    Raises
    ------
    ValueError
        If ``order.output_format`` is not in :data:`SUPPORTED_FORMATS`.
    """
    # Resolve format alias and validate
    output_format = _FORMAT_ALIASES.get(order.output_format, order.output_format).lower()
    if output_format not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported output format: {order.output_format}")

    image = order.image.copy()
    instructions = order.instructions

    # ── Apply transformations (order matters here) ────────────────────
    image = _apply_crop(image, instructions.crop)
    image = _apply_resize(image, instructions.resize)
    image = _apply_rotate(image, instructions.rotate)
    image = _apply_flip(image, instructions.flip)
    image = _apply_grayscale(image, instructions.grayscale)

    # ── Ensure compatibility with the output format ───────────────────
    image = _ensure_format_compatibility(image, output_format)

    # ── Encode ────────────────────────────────────────────────────────
    data = _encode(image, output_format, instructions.quality)
    content_type = _CONTENT_TYPE[output_format]

    return data, content_type


# ── Internal transformation steps ─────────────────────────────────────────


def _apply_crop(image: Image.Image, crop: dict | None) -> Image.Image:
    if crop is None:
        return image
    return image.crop((crop["left"], crop["top"], crop["right"], crop["bottom"]))


def _apply_resize(image: Image.Image, resize) -> Image.Image:
    if resize is None:
        return image

    if resize.percent is not None:
        w = int(image.width * resize.percent / 100)
        h = int(image.height * resize.percent / 100)
        return image.resize((w, h), Image.LANCZOS)

    w = resize.width or image.width
    h = resize.height or image.height
    return image.resize((w, h), Image.LANCZOS)


def _apply_rotate(image: Image.Image, angle: int | None) -> Image.Image:
    if angle is None or angle == 0:
        return image
    return image.rotate(angle, expand=True)


def _apply_flip(image: Image.Image, flip: str | None) -> Image.Image:
    if flip == "horizontal":
        return image.transpose(Image.FLIP_LEFT_RIGHT)
    if flip == "vertical":
        return image.transpose(Image.FLIP_TOP_BOTTOM)
    return image


def _apply_grayscale(image: Image.Image, grayscale: bool | None) -> Image.Image:
    if grayscale:
        return image.convert("L")
    return image


def _ensure_format_compatibility(image: Image.Image, output_format: str) -> Image.Image:
    """Convert image mode if the target format cannot handle it natively."""
    if output_format == "jpeg":
        if image.mode == "RGBA":
            bg = Image.new("RGB", image.size, (255, 255, 255))
            bg.paste(image, mask=image.split()[3])  # use alpha as mask
            return bg
        if image.mode in ("P", "L"):
            return image.convert("RGB")
    return image


def _encode(image: Image.Image, output_format: str, quality: int | None) -> bytes:
    """Encode the Pillow image into bytes using the requested format."""
    buf = BytesIO()
    save_kwargs: dict = {}

    if output_format in ("jpeg", "webp") and quality is not None:
        save_kwargs["quality"] = quality

    image.save(buf, format=output_format, **save_kwargs)
    buf.seek(0)
    return buf.getvalue()
