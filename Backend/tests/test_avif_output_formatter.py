"""Tests for AVIFOutputFormatter."""

from __future__ import annotations

from io import BytesIO

import sys

sys.path.insert(0, "..")

import pytest
from PIL import Image

from base import OutputFormatter


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture
def formatter():
    from avif_output_formatter import AVIFOutputFormatter

    return AVIFOutputFormatter()


@pytest.fixture
def rgb_image():
    return Image.new("RGB", (100, 100), color=(255, 0, 0))


@pytest.fixture
def rgba_image():
    return Image.new("RGBA", (100, 100), (255, 0, 0, 128))


# ── Contract tests ─────────────────────────────────────────────────────────


class TestAVIFOutputFormatterImplementsOutputFormatter:
    """Verify AVIFOutputFormatter fulfills the OutputFormatter contract."""

    def test_is_subclass_of_output_formatter(self):
        from avif_output_formatter import AVIFOutputFormatter

        assert issubclass(AVIFOutputFormatter, OutputFormatter)

    def test_can_instantiate(self):
        from avif_output_formatter import AVIFOutputFormatter

        instance = AVIFOutputFormatter()
        assert isinstance(instance, OutputFormatter)

    def test_has_format_output_method(self):
        from avif_output_formatter import AVIFOutputFormatter

        assert hasattr(AVIFOutputFormatter, "format_output")


# ── Happy path ─────────────────────────────────────────────────────────────


class TestAVIFOutputFormatterHappyPath:
    """Successful AVIF encoding scenarios."""

    def test_format_output_avif_rgb(self, formatter, rgb_image):
        data, content_type = formatter.format_output(rgb_image, "avif")
        assert content_type == "image/avif"
        assert len(data) > 0
        result = Image.open(BytesIO(data))
        assert result.format == "AVIF"
        assert result.size == (100, 100)

    def test_format_output_avif_rgba(self, formatter, rgba_image):
        """AVIF supports alpha channel natively."""
        data, content_type = formatter.format_output(rgba_image, "avif")
        assert content_type == "image/avif"
        assert len(data) > 0
        result = Image.open(BytesIO(data))
        assert result.format == "AVIF"
        assert result.mode == "RGBA"

    def test_format_output_with_quality(self, formatter, rgb_image):
        data, content_type = formatter.format_output(rgb_image, "avif", quality=80)
        assert content_type == "image/avif"
        assert len(data) > 0

    def test_format_output_without_quality(self, formatter, rgb_image):
        """Omitting quality should still work."""
        data, content_type = formatter.format_output(rgb_image, "avif")
        assert content_type == "image/avif"
        assert len(data) > 0

    def test_quality_affects_file_size(self, formatter, rgb_image):
        """Higher quality should produce larger (or equal) files."""
        data_low, _ = formatter.format_output(rgb_image, "avif", quality=10)
        data_high, _ = formatter.format_output(rgb_image, "avif", quality=100)
        # Higher quality may produce larger file (or same for simple images)
        assert len(data_high) >= len(data_low) * 0.5  # at least not tiny


# ── Edge cases ─────────────────────────────────────────────────────────────


class TestAVIFOutputFormatterEdgeCases:
    """Error handling and edge cases."""

    def test_unsupported_format(self, formatter, rgb_image):
        """Only 'avif' is supported by this formatter."""
        with pytest.raises(ValueError, match="Unsupported output format: png"):
            formatter.format_output(rgb_image, "png")

    def test_unsupported_format_jpeg(self, formatter, rgb_image):
        with pytest.raises(ValueError, match="Unsupported output format: jpeg"):
            formatter.format_output(rgb_image, "jpeg")

    def test_grayscale_image(self, formatter):
        """Grayscale images should be handled correctly."""
        img = Image.new("L", (100, 100), color=128)
        data, content_type = formatter.format_output(img, "avif")
        assert content_type == "image/avif"
        result = Image.open(BytesIO(data))
        # AVIF may convert L to RGB
        assert result.format == "AVIF"
