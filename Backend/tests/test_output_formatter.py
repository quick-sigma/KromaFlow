"""Tests for the ImageOutputFormatter concrete class."""

from __future__ import annotations

from io import BytesIO

import sys
sys.path.insert(0, "..")

import pytest
from PIL import Image

from output_formatter import (
    ImageOutputFormatter,
    SUPPORTED_FORMATS,
)


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture
def formatter():
    return ImageOutputFormatter()


@pytest.fixture
def rgb_image():
    return Image.new("RGB", (100, 100), color=(255, 0, 0))


@pytest.fixture
def rgba_image():
    return Image.new("RGBA", (100, 100), (255, 0, 0, 128))


# ── SUPPORTED_FORMATS ──────────────────────────────────────────────────────


def test_supported_formats_exported():
    assert "png" in SUPPORTED_FORMATS
    assert "jpeg" in SUPPORTED_FORMATS
    assert "webp" in SUPPORTED_FORMATS
    assert "gif" in SUPPORTED_FORMATS
    assert "bmp" in SUPPORTED_FORMATS
    assert "tiff" in SUPPORTED_FORMATS


# ── Basic output ───────────────────────────────────────────────────────────


def test_format_output_png(formatter, rgb_image):
    data, content_type = formatter.format_output(rgb_image, "png")
    assert content_type == "image/png"
    result = Image.open(BytesIO(data))
    assert result.format == "PNG"
    assert result.size == (100, 100)


def test_format_output_jpeg(formatter, rgb_image):
    data, content_type = formatter.format_output(rgb_image, "jpeg")
    assert content_type == "image/jpeg"
    result = Image.open(BytesIO(data))
    assert result.format == "JPEG"


def test_format_output_webp(formatter, rgb_image):
    data, content_type = formatter.format_output(rgb_image, "webp")
    assert content_type == "image/webp"
    result = Image.open(BytesIO(data))
    assert result.format == "WEBP"


def test_format_output_gif(formatter, rgb_image):
    data, content_type = formatter.format_output(rgb_image, "gif")
    assert content_type == "image/gif"
    result = Image.open(BytesIO(data))
    assert result.format == "GIF"


# ── Format aliases ─────────────────────────────────────────────────────────


def test_format_output_jpg_alias(formatter, rgb_image):
    data, content_type = formatter.format_output(rgb_image, "jpg")
    assert content_type == "image/jpeg"


def test_format_output_tif_alias(formatter, rgb_image):
    data, content_type = formatter.format_output(rgb_image, "tif")
    assert content_type == "image/tiff"


# ── Unsupported format ─────────────────────────────────────────────────────


def test_unsupported_format(formatter, rgb_image):
    with pytest.raises(ValueError, match="Unsupported output format: pdf"):
        formatter.format_output(rgb_image, "pdf")


# ── RGBA → JPEG compatibility ──────────────────────────────────────────────


def test_rgba_to_jpeg_composite(formatter, rgba_image):
    """JPEG cannot store alpha; RGBA should be composited over white."""
    data, content_type = formatter.format_output(rgba_image, "jpeg")
    assert content_type == "image/jpeg"
    result = Image.open(BytesIO(data))
    assert result.mode == "RGB"


# ── Quality ────────────────────────────────────────────────────────────────


def test_quality_applied_to_jpeg(formatter, rgb_image):
    data, content_type = formatter.format_output(rgb_image, "jpeg", quality=50)
    assert content_type == "image/jpeg"
    result = Image.open(BytesIO(data))
    assert result.format == "JPEG"


def test_quality_default_for_png(formatter, rgb_image):
    """Quality should be ignored (PNG is lossless)."""
    data, _ = formatter.format_output(rgb_image, "png", quality=50)
    result = Image.open(BytesIO(data))
    assert result.format == "PNG"


def test_no_quality_defaults_to_none(formatter, rgb_image):
    """Calling without quality should work (uses None)."""
    data, _ = formatter.format_output(rgb_image, "png")
    result = Image.open(BytesIO(data))
    assert result.format == "PNG"
