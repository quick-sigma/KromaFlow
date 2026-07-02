"""Unit tests for image processing logic — ImageProcessor and process_order."""

from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

import sys

sys.path.insert(0, "..")

from output_formatter import SUPPORTED_FORMATS
from models import Order, ProcessingInstructions
from processor import ImageProcessor, process_order


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest.fixture
def processor():
    return ImageProcessor()


@pytest.fixture
def rgb_image():
    """Create a 100x100 solid red RGB test image."""
    return Image.new("RGB", (100, 100), color=(255, 0, 0))


@pytest.fixture
def rgba_image():
    """Create a 100x100 RGBA test image with partial transparency."""
    return Image.new("RGBA", (100, 100), (255, 0, 0, 128))


@pytest.fixture
def grayscale_image():
    """Create a 100x100 grayscale test image."""
    return Image.new("L", (100, 100), color=128)


def make_order(**overrides) -> Order:
    """Helper to create an Order with default instructions."""
    defaults = {
        "image": Image.new("RGB", (100, 100), (255, 0, 0)),
        "recipient": "test_user",
        "instructions": ProcessingInstructions(),
        "output_format": "png",
    }
    defaults.update(overrides)
    if "instructions" in overrides and isinstance(overrides["instructions"], dict):
        defaults["instructions"] = ProcessingInstructions(**overrides["instructions"])
    return Order(**defaults)


# ── ImageProcessor.process() ──────────────────────────────────────────────


class TestImageProcessor:
    """Tests for ImageProcessor.process() — returns a Pillow Image."""

    def test_process_returns_image(self, processor, rgb_image):
        result = processor.process(rgb_image, ProcessingInstructions())
        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_does_not_mutate_original(self, processor, rgb_image):
        original_id = id(rgb_image)
        result = processor.process(rgb_image, ProcessingInstructions())
        assert id(result) != original_id  # it's a copy

    def test_resize(self, processor, rgb_image):
        instructions = ProcessingInstructions(
            resize={"width": 50, "height": 30}
        )
        result = processor.process(rgb_image, instructions)
        assert result.size == (50, 30)

    def test_resize_by_percent(self, processor, rgb_image):
        instructions = ProcessingInstructions(resize={"percent": 50})
        result = processor.process(rgb_image, instructions)
        assert result.size == (50, 50)

    def test_rotate_90(self, processor, rgb_image):
        instructions = ProcessingInstructions(rotate=90)
        result = processor.process(rgb_image, instructions)
        assert result.size == (100, 100)

    def test_flip_horizontal(self, processor, rgb_image):
        instructions = ProcessingInstructions(flip="horizontal")
        result = processor.process(rgb_image, instructions)
        assert result.size == (100, 100)

    def test_flip_vertical(self, processor, rgb_image):
        instructions = ProcessingInstructions(flip="vertical")
        result = processor.process(rgb_image, instructions)
        assert result.size == (100, 100)

    def test_grayscale(self, processor, rgb_image):
        instructions = ProcessingInstructions(grayscale=True)
        result = processor.process(rgb_image, instructions)
        assert result.mode == "L"

    def test_crop(self, processor, rgb_image):
        instructions = ProcessingInstructions(
            crop={"left": 10, "top": 10, "right": 50, "bottom": 50}
        )
        result = processor.process(rgb_image, instructions)
        assert result.size == (40, 40)

    def test_combined_operations(self, processor, rgb_image):
        instructions = ProcessingInstructions(
            resize={"width": 80, "height": 60},
            rotate=90,
            grayscale=True,
        )
        result = processor.process(rgb_image, instructions)
        assert result.size == (60, 80)
        assert result.mode == "L"

    def test_empty_instructions_no_op(self, processor, rgb_image):
        result = processor.process(rgb_image, ProcessingInstructions())
        assert result.size == (100, 100)
        assert result.mode == "RGB"


# ── SUPPORTED_FORMATS ─────────────────────────────────────────────────────


def test_supported_formats_includes_common():
    assert "png" in SUPPORTED_FORMATS
    assert "jpeg" in SUPPORTED_FORMATS
    assert "webp" in SUPPORTED_FORMATS
    assert "gif" in SUPPORTED_FORMATS


# ── Basic processing ──────────────────────────────────────────────────────


def test_process_without_instructions_returns_same_image():
    """No instructions means the image is returned as-is."""
    order = make_order()
    data, content_type = process_order(order)

    assert content_type == "image/png"
    # re-open to verify
    result = Image.open(BytesIO(data))
    assert result.size == (100, 100)
    assert result.mode == "RGB"


def test_process_with_empty_instructions_object():
    """Empty instructions object means no transformations."""
    order = make_order(instructions=ProcessingInstructions())
    data, content_type = process_order(order)

    assert content_type == "image/png"
    result = Image.open(BytesIO(data))
    assert result.size == (100, 100)


# ── Resize ────────────────────────────────────────────────────────────────


def test_resize_width_and_height():
    order = make_order(instructions={"resize": {"width": 50, "height": 30}})
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.size == (50, 30)


def test_resize_width_only_preserves_aspect():
    order = make_order(instructions={"resize": {"width": 50}})
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.size == (50, 100)


def test_resize_height_only_preserves_aspect():
    order = make_order(instructions={"resize": {"height": 50}})
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.size == (100, 50)


def test_resize_by_percent():
    order = make_order(instructions={"resize": {"percent": 50}})
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.size == (50, 50)


# ── Rotate ────────────────────────────────────────────────────────────────


def test_rotate_90():
    order = make_order(instructions={"rotate": 90})
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.size == (100, 100)


def test_rotate_45():
    """Rotation uses expand=True so canvas grows for non-right angles."""
    order = make_order(instructions={"rotate": 45})
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    # 45 degree rotation of 100x100 expands canvas
    expected = 142  # ceil(100 * sqrt(2))
    assert result.size == (expected, expected)


# ── Flip ──────────────────────────────────────────────────────────────────


def test_flip_horizontal():
    order = make_order(instructions={"flip": "horizontal"})
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.size == (100, 100)
    # A solid red image flipped is still solid red
    assert result.getpixel((0, 0)) == (255, 0, 0)


def test_flip_vertical():
    order = make_order(instructions={"flip": "vertical"})
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.size == (100, 100)


# ── Grayscale ─────────────────────────────────────────────────────────────


def test_grayscale():
    order = make_order(instructions={"grayscale": True})
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.mode == "L"


# ── Crop ──────────────────────────────────────────────────────────────────


def test_crop():
    order = make_order(
        instructions={"crop": {"left": 10, "top": 10, "right": 50, "bottom": 50}}
    )
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.size == (40, 40)


# ── Output Format ─────────────────────────────────────────────────────────


def test_output_format_png():
    order = make_order(output_format="png")
    data, content_type = process_order(order)
    assert content_type == "image/png"
    result = Image.open(BytesIO(data))
    assert result.format == "PNG"


def test_output_format_jpeg():
    order = make_order(output_format="jpeg")
    data, content_type = process_order(order)
    assert content_type == "image/jpeg"
    result = Image.open(BytesIO(data))
    assert result.format == "JPEG"


def test_output_format_webp():
    order = make_order(output_format="webp")
    data, content_type = process_order(order)
    assert content_type == "image/webp"
    result = Image.open(BytesIO(data))
    assert result.format == "WEBP"


def test_output_format_gif():
    order = make_order(output_format="gif")
    data, content_type = process_order(order)
    assert content_type == "image/gif"
    result = Image.open(BytesIO(data))
    assert result.format == "GIF"


def test_output_format_jpg_alias():
    """'jpg' should be treated as 'jpeg'."""
    order = make_order(output_format="jpg")
    data, content_type = process_order(order)
    assert content_type == "image/jpeg"


def test_output_format_tif_alias():
    """'tif' should be treated as 'tiff'."""
    order = make_order(output_format="tif")
    data, content_type = process_order(order)
    assert content_type == "image/tiff"


def test_unsupported_output_format():
    order = make_order(output_format="pdf")
    with pytest.raises(ValueError, match="Unsupported output format: pdf"):
        process_order(order)


# ── JPEG with RGBA ────────────────────────────────────────────────────────


def test_jpeg_with_rgba_image_converts_to_rgb(rgba_image):
    """JPEG doesn't support alpha; RGBA should be composited over white."""
    order = make_order(image=rgba_image, output_format="jpeg")
    data, content_type = process_order(order)
    assert content_type == "image/jpeg"
    result = Image.open(BytesIO(data))
    assert result.mode == "RGB"


# ── Quality ───────────────────────────────────────────────────────────────


def test_quality_applied_to_jpeg():
    """Quality setting should affect JPEG output (no crash, produces valid file)."""
    order = make_order(
        instructions={"quality": 50},
        output_format="jpeg",
    )
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.format == "JPEG"


def test_quality_ignored_for_png():
    """Quality is only meaningful for lossy formats; PNG should still work."""
    order = make_order(
        instructions={"quality": 50},
        output_format="png",
    )
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.format == "PNG"


# ── Combined operations ───────────────────────────────────────────────────


def test_multiple_operations():
    """Resize, grayscale, and rotate together."""
    order = make_order(
        instructions={
            "resize": {"width": 80, "height": 60},
            "rotate": 90,
            "grayscale": True,
        }
    )
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result.size == (60, 80)  # 80x60 rotated 90 = 60x80
    assert result.mode == "L"


# ── Recipient passthrough ─────────────────────────────────────────────────


def test_recipient_is_stored_in_order():
    """Ensure the recipient field is carried through."""
    order = make_order(recipient="alice@example.com")
    assert order.recipient == "alice@example.com"
    data, _ = process_order(order)
    result = Image.open(BytesIO(data))
    assert result is not None


# ── Watermark removal field in instructions ────────────────────────────────


def test_remove_watermark_default_is_none():
    """When not specified, remove_watermark should be None."""
    instructions = ProcessingInstructions()
    assert instructions.remove_watermark is None


def test_remove_watermark_true():
    instructions = ProcessingInstructions(remove_watermark=True)
    assert instructions.remove_watermark is True


def test_remove_watermark_false():
    instructions = ProcessingInstructions(remove_watermark=False)
    assert instructions.remove_watermark is False


def test_remove_watermark_in_instructions_dict():
    """Parsed from a dict (as the frontend would send it)."""
    instructions = ProcessingInstructions(**{"remove_watermark": True})
    assert instructions.remove_watermark is True
