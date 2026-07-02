"""Image processing engine.

Provides:

* :class:`ImageProcessor` — concrete :class:`base.Processor` that applies
  crop, resize, rotate, flip, and grayscale transformations.
* :func:`process_order` — a convenience function that ties a processor
  and an output formatter together for the common case.
"""

from __future__ import annotations

from PIL import Image

from base import Processor
from models import Order, ProcessingInstructions
from output_formatter import ImageOutputFormatter


# ── Concrete implementation ───────────────────────────────────────────────


class ImageProcessor(Processor):
    """Default :class:`Processor` that applies the standard transformations.

    Transformation order (chosen for visual consistency):

    #. Crop
    #. Resize
    #. Rotate
    #. Flip
    #. Grayscale

    The input image is **copied** before any mutation.
    """

    def process(
        self,
        image: Image.Image,
        instructions: ProcessingInstructions,
    ) -> Image.Image:
        image = image.copy()

        image = _apply_crop(image, instructions.crop)
        image = _apply_resize(image, instructions.resize)
        image = _apply_rotate(image, instructions.rotate)
        image = _apply_flip(image, instructions.flip)
        image = _apply_grayscale(image, instructions.grayscale)

        return image


# ── Convenience orchestrator ──────────────────────────────────────────────


def process_order(order: Order) -> tuple[bytes, str]:
    """Apply *order.instructions* to *order.image* and encode the result.

    This is a convenience function that internally instantiates an
    :class:`ImageProcessor` and an :class:`ImageOutputFormatter`.
    For more control (e.g. custom subclasses) use those classes directly.

    Parameters
    ----------
    order : Order
        The order to process.  ``order.image`` is **not** mutated.

    Returns
    -------
    tuple[bytes, str]
        ``(image_data, content_type)``.

    Raises
    ------
    ValueError
        If ``order.output_format`` is not supported.
    """
    processor = ImageProcessor()
    formatter = ImageOutputFormatter()

    processed = processor.process(order.image, order.instructions)
    return formatter.format_output(
        processed,
        order.output_format,
        order.instructions.quality,
    )


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


def _apply_grayscale(
    image: Image.Image, grayscale: bool | None
) -> Image.Image:
    if grayscale:
        return image.convert("L")
    return image
