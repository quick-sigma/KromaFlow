"""Tests for WatermarkRemoverProcessor."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import sys

sys.path.insert(0, "..")

import numpy as np
import pytest
from PIL import Image

from base import Processor
from models import ProcessingInstructions


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture
def rgb_image():
    """Create a 100x100 solid red RGB test image."""
    return Image.new("RGB", (100, 100), color=(255, 0, 0))


@pytest.fixture
def rgba_image():
    """Create a 100x100 RGBA test image."""
    return Image.new("RGBA", (100, 100), (255, 0, 0, 128))


@pytest.fixture
def mock_gemini_engine():
    """Mock GeminiEngine that simulates a detected and removed watermark."""
    engine = MagicMock()

    # detect_watermark returns an object with .detected and .confidence
    detect_result = MagicMock()
    detect_result.detected = True
    detect_result.confidence = 0.95
    engine.detect_watermark.return_value = detect_result

    # remove_watermark returns a modified numpy array (simulate removal)
    def _fake_remove(img: np.ndarray) -> np.ndarray:
        # Return a slightly different array to simulate processing
        result = img.copy()
        result[80:96, 80:96] = [0, 255, 0]  # simulate cleaned area
        return result

    engine.remove_watermark.side_effect = _fake_remove
    return engine


# ── Integration tests (with actual GeminiEngine) ──────────────────────────


class TestWatermarkRemoverImport:
    """Verify the external library imports successfully."""

    def test_can_import_gemini_engine(self):
        from remove_ai_watermarks.gemini_engine import GeminiEngine

        assert GeminiEngine is not None

    def test_can_import_watermark_remover(self):
        from watermark_remover import WatermarkRemoverProcessor

        assert WatermarkRemoverProcessor is not None


class TestWatermarkRemoverImplementsProcessor:
    """Ensure WatermarkRemoverProcessor fulfills the Processor contract."""

    def test_is_subclass_of_processor(self):
        from watermark_remover import WatermarkRemoverProcessor

        assert issubclass(WatermarkRemoverProcessor, Processor)

    def test_can_instantiate(self):
        from watermark_remover import WatermarkRemoverProcessor

        instance = WatermarkRemoverProcessor()
        assert isinstance(instance, Processor)

    def test_has_process_method(self):
        from watermark_remover import WatermarkRemoverProcessor

        assert hasattr(WatermarkRemoverProcessor, "process")


# ── Unit tests with mocked GeminiEngine ───────────────────────────────────


class TestWatermarkRemoverMocked:
    """Test WatermarkRemoverProcessor logic with a mock engine."""

    def test_process_returns_pillow_image(self, rgb_image, mock_gemini_engine):
        from watermark_remover import WatermarkRemoverProcessor

        proc = WatermarkRemoverProcessor(engine=mock_gemini_engine)
        instructions = ProcessingInstructions()
        result = proc.process(rgb_image, instructions)

        assert isinstance(result, Image.Image)

    def test_process_calls_detect_and_remove(self, rgb_image, mock_gemini_engine):
        from watermark_remover import WatermarkRemoverProcessor

        proc = WatermarkRemoverProcessor(engine=mock_gemini_engine)
        proc.process(rgb_image, ProcessingInstructions())

        assert mock_gemini_engine.detect_watermark.called
        assert mock_gemini_engine.remove_watermark.called

    def test_process_does_not_mutate_original(self, rgb_image, mock_gemini_engine):
        from watermark_remover import WatermarkRemoverProcessor

        original_pixels = list(rgb_image.getdata())
        proc = WatermarkRemoverProcessor(engine=mock_gemini_engine)
        proc.process(rgb_image, ProcessingInstructions())

        assert list(rgb_image.getdata()) == original_pixels

    def test_preserves_image_mode_rgb(self, rgb_image, mock_gemini_engine):
        from watermark_remover import WatermarkRemoverProcessor

        proc = WatermarkRemoverProcessor(engine=mock_gemini_engine)
        result = proc.process(rgb_image, ProcessingInstructions())

        assert result.mode == "RGB"

    def test_preserves_image_size(self, rgb_image, mock_gemini_engine):
        from watermark_remover import WatermarkRemoverProcessor

        proc = WatermarkRemoverProcessor(engine=mock_gemini_engine)
        result = proc.process(rgb_image, ProcessingInstructions())

        assert result.size == (100, 100)

    def test_converts_rgba_to_rgb_for_opencv(self, rgba_image, mock_gemini_engine):
        """OpenCV uses BGR (3-channel), so RGBA must be converted."""
        from watermark_remover import WatermarkRemoverProcessor

        proc = WatermarkRemoverProcessor(engine=mock_gemini_engine)
        result = proc.process(rgba_image, ProcessingInstructions())

        # After conversion back, should be RGB
        assert result.mode == "RGB"


# ── Edge cases ────────────────────────────────────────────────────────────


class TestWatermarkRemoverEdgeCases:
    """Edge cases: no watermark, grayscale, etc."""

    def test_no_watermark_detected(self, rgb_image):
        """When detect_watermark returns False, the image is returned as-is."""
        from watermark_remover import WatermarkRemoverProcessor

        mock_engine = MagicMock()
        detect_result = MagicMock()
        detect_result.detected = False
        detect_result.confidence = 0.05
        mock_engine.detect_watermark.return_value = detect_result

        proc = WatermarkRemoverProcessor(engine=mock_engine)
        result = proc.process(rgb_image, ProcessingInstructions())

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)
        # remove_watermark should NOT have been called
        mock_engine.remove_watermark.assert_not_called()

    def test_engine_exception_returns_original_image(self, rgb_image):
        """If GeminiEngine raises, the original image is returned."""
        from watermark_remover import WatermarkRemoverProcessor

        mock_engine = MagicMock()
        mock_engine.detect_watermark.side_effect = RuntimeError("Engine failed")

        proc = WatermarkRemoverProcessor(engine=mock_engine)
        instructions = ProcessingInstructions()
        result = proc.process(rgb_image, instructions)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_constructor_default_engine(self):
        """Without arguments, WatermarkRemoverProcessor creates a real engine."""
        from watermark_remover import WatermarkRemoverProcessor

        proc = WatermarkRemoverProcessor()
        assert proc._engine is not None


# ── OpenCV_Pillow conversion ──────────────────────────────────────────────


class TestConversionUtils:
    """Test the PIL ↔ OpenCV conversion helpers."""

    def test_pil_to_cv_rgb(self, rgb_image):
        from watermark_remover import _pil_to_cv

        cv_img = _pil_to_cv(rgb_image)
        assert isinstance(cv_img, np.ndarray)
        assert cv_img.shape == (100, 100, 3)  # H, W, C

    def test_cv_to_pil_rgb(self):
        from watermark_remover import _cv_to_pil

        cv_img = np.zeros((100, 100, 3), dtype=np.uint8)
        cv_img[:, :] = [255, 0, 0]  # RGB red (no BGR conversion — GeminiEngine uses RGB)
        pil_img = _cv_to_pil(cv_img)
        assert isinstance(pil_img, Image.Image)
        assert pil_img.mode == "RGB"
        assert pil_img.size == (100, 100)
        # Top-left pixel should be red
        assert pil_img.getpixel((0, 0)) == (255, 0, 0)
