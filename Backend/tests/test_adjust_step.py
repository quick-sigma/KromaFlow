"""Tests for the Adjust (auto-crop) pipeline step (adjust_step.py).

Covers:
* :class:`AdjustConfig` — schema defaults, validation, frontend hints.
* :class:`AdjustProcessor` — bounding box detection, cropping, padding.
* :class:`AdjustStep` — registration, instantiation, pipeline integration.
"""

from __future__ import annotations

import sys

sys.path.insert(0, "..")

import pytest
from PIL import Image
from pydantic import ValidationError

from adjust_step import AdjustConfig, AdjustProcessor, AdjustStep
from step import StepVariant, _step_id_map, get_registered_steps


# ═══════════════════════════════════════════════════════════════════════════
# ── Fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture
def processor():
    return AdjustProcessor()


@pytest.fixture
def full_rgba():
    """A 200x200 RGBA image with a 100x100 visible square in the centre."""
    img = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
    for y in range(50, 150):
        for x in range(50, 150):
            img.putpixel((x, y), (255, 0, 0, 255))
    return img


@pytest.fixture
def small_visible():
    """A 200x200 RGBA with a tiny 10x10 visible square at the top-left."""
    img = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
    for y in range(5, 15):
        for x in range(5, 15):
            img.putpixel((x, y), (0, 255, 0, 255))
    return img


@pytest.fixture
def full_visible_rgba():
    """A 200x200 RGBA where every pixel is visible (opaque)."""
    return Image.new("RGBA", (200, 200), (64, 128, 255, 255))


@pytest.fixture
def no_alpha_rgb():
    """A 100x100 RGB image (no alpha channel at all)."""
    return Image.new("RGB", (100, 100), (255, 0, 0))


@pytest.fixture
def transparent_all():
    """A 200x200 RGBA where every pixel is fully transparent."""
    return Image.new("RGBA", (200, 200), (0, 0, 0, 0))


# ═══════════════════════════════════════════════════════════════════════════
# ── AdjustConfig
# ═══════════════════════════════════════════════════════════════════════════


class TestAdjustConfig:
    def test_default_values(self):
        cfg = AdjustConfig()
        assert cfg.alpha_threshold == 0
        assert cfg.padding == 4
        assert cfg.preserve_square is False

    def test_custom_threshold(self):
        cfg = AdjustConfig(alpha_threshold=128)
        assert cfg.alpha_threshold == 128

    def test_custom_padding(self):
        cfg = AdjustConfig(padding=10)
        assert cfg.padding == 10

    def test_preserve_square(self):
        cfg = AdjustConfig(preserve_square=True)
        assert cfg.preserve_square is True

    def test_threshold_validation(self):
        with pytest.raises(ValidationError):
            AdjustConfig(alpha_threshold=-1)
        with pytest.raises(ValidationError):
            AdjustConfig(alpha_threshold=256)

    def test_padding_validation(self):
        with pytest.raises(ValidationError):
            AdjustConfig(padding=-1)
        with pytest.raises(ValidationError):
            AdjustConfig(padding=101)


# ═══════════════════════════════════════════════════════════════════════════
# ── AdjustProcessor — Bounding box detection
# ═══════════════════════════════════════════════════════════════════════════


class TestProcessorFindBbox:
    def test_centre_object_detected(self, processor, full_rgba):
        """A 100x100 visible square at centre should be detected."""
        result = processor.process(full_rgba, AdjustConfig(padding=0))
        # The visible square is at (50,50)-(150,150) = 100x100
        assert result.size == (100, 100)
        # Check a pixel that should be visible
        pixel = result.getpixel((0, 0))
        assert pixel == (255, 0, 0, 255)

    def test_small_object_detected(self, processor, small_visible):
        """A tiny 10x10 visible square should be detected precisely."""
        result = processor.process(small_visible, AdjustConfig(padding=0))
        assert result.size == (10, 10)

    def test_fully_opaque_no_crop(self, processor, full_visible_rgba):
        """Fully opaque image should not be cropped (stays 200x200)."""
        result = processor.process(full_visible_rgba, AdjustConfig(padding=0))
        assert result.size == (200, 200)

    def test_no_alpha_returns_unchanged(self, processor, no_alpha_rgb):
        """RGB image (no alpha) should be returned as-is."""
        result = processor.process(no_alpha_rgb, AdjustConfig(padding=0))
        assert result.size == (100, 100)

    def test_fully_transparent_returns_1x1(self, processor, transparent_all):
        """Fully transparent image should return a 1x1 transparent pixel."""
        result = processor.process(transparent_all, AdjustConfig(padding=0))
        assert result.size == (1, 1)

    def test_output_is_copy(self, processor, full_rgba):
        """The input image should not be mutated."""
        original_id = id(full_rgba)
        result = processor.process(full_rgba, AdjustConfig(padding=0))
        assert id(result) != original_id


# ═══════════════════════════════════════════════════════════════════════════
# ── AdjustProcessor — Padding
# ═══════════════════════════════════════════════════════════════════════════


class TestProcessorPadding:
    def test_padding_added(self, processor, full_rgba):
        """With padding=10, the 100x100 crop becomes 120x120."""
        result = processor.process(full_rgba, AdjustConfig(padding=10))
        assert result.size == (120, 120)

    def test_padding_clamps_to_image_bounds(self, processor, small_visible):
        """Padding shouldn't extend beyond the original image bounds."""
        # Small object near edge + max padding should clamp
        result = processor.process(
            small_visible, AdjustConfig(padding=100)
        )
        # Original is 200x200, padding tries to go beyond but should clamp
        assert result.width <= 200
        assert result.height <= 200

    def test_zero_padding_tight_crop(self, processor, full_rgba):
        """Zero padding should crop exactly to the visible content."""
        result = processor.process(full_rgba, AdjustConfig(padding=0))
        assert result.size == (100, 100)


# ═══════════════════════════════════════════════════════════════════════════
# ── AdjustProcessor — Preserve Square
# ═══════════════════════════════════════════════════════════════════════════


class TestProcessorPreserveSquare:
    def test_non_square_becomes_square(self, processor):
        """A 100x50 visible region with preserve_square should give 100x100."""
        img = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
        # Visible region: 100x50 rectangle
        for y in range(75, 125):
            for x in range(50, 150):
                img.putpixel((x, y), (0, 0, 255, 255))
        result = processor.process(
            img, AdjustConfig(padding=0, preserve_square=True)
        )
        assert result.size == (100, 100)

    def test_square_stays_square(self, processor, full_rgba):
        """Already square should stay the same size."""
        result = processor.process(
            full_rgba, AdjustConfig(padding=0, preserve_square=True)
        )
        assert result.size == (100, 100)

    def test_square_centre_content_preserved(self, processor):
        """Square content should remain centred."""
        img = Image.new("RGBA", (200, 100), (0, 0, 0, 0))
        # 50x50 visible square at centre
        for y in range(25, 75):
            for x in range(75, 125):
                img.putpixel((x, y), (255, 255, 0, 255))
        result = processor.process(
            img, AdjustConfig(padding=0, preserve_square=True)
        )
        # Visible region is 50x50 → square becomes 50x50
        assert result.size == (50, 50)


# ═══════════════════════════════════════════════════════════════════════════
# ── AdjustProcessor — Alpha threshold
# ═══════════════════════════════════════════════════════════════════════════


class TestProcessorAlphaThreshold:
    def test_threshold_ignores_semi_transparent(self, processor):
        """Pixels with alpha <= threshold should be treated as empty."""
        img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        # Semi-transparent pixel at (50, 50) with alpha=10
        img.putpixel((50, 50), (255, 0, 0, 10))
        # With threshold=0, alpha=10 > 0 so it's visible → bbox is 1x1
        result = processor.process(img, AdjustConfig(padding=0, alpha_threshold=0))
        assert result.size == (1, 1)

    def test_threshold_filters_semi_transparent(self, processor):
        """Pixels with alpha <= threshold should be filtered out."""
        img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        # Semi-transparent pixel at (50, 50) with alpha=10
        img.putpixel((50, 50), (255, 0, 0, 10))
        # With threshold=10, alpha=10 is not visible → nothing visible
        result = processor.process(
            img, AdjustConfig(padding=0, alpha_threshold=10)
        )
        assert result.size == (1, 1)  # fully transparent → 1x1


# ═══════════════════════════════════════════════════════════════════════════
# ── Registration
# ═══════════════════════════════════════════════════════════════════════════


class TestRegistration:
    def test_step_registered_in_id_map(self):
        assert "adjust" in _step_id_map
        assert _step_id_map["adjust"] is AdjustStep

    def test_step_info_available(self):
        infos = get_registered_steps()
        adjust_infos = [i for i in infos if i.id == "adjust"]
        assert len(adjust_infos) == 1

        info = adjust_infos[0]
        assert info.name == "Adjust"
        assert info.variant == StepVariant.PROCESSOR
        assert info.version == "1.0.0"
        assert info.has_configurable_options is True

    def test_step_is_not_repeatable(self):
        """Adjust should not be repeatable by default."""
        infos = get_registered_steps()
        adjust_info = next(i for i in infos if i.id == "adjust")
        assert adjust_info.repeatable is False


# ═══════════════════════════════════════════════════════════════════════════
# ── Instantiation
# ═══════════════════════════════════════════════════════════════════════════


class TestInstantiation:
    def test_step_instantiation(self):
        step = AdjustStep()
        assert step.id == "adjust"
        assert step.name == "Adjust"
        assert step.variant == StepVariant.PROCESSOR
        assert step.config_schema is AdjustConfig

    def test_processor_component(self):
        step = AdjustStep()
        assert isinstance(step._component, AdjustProcessor)


# ═══════════════════════════════════════════════════════════════════════════
# ── Pipeline integration
# ═══════════════════════════════════════════════════════════════════════════


class TestPipelineIntegration:
    def test_pipeline_with_adjust_step(self, full_rgba):
        """Adjust → formatter pipeline should work."""
        from base import OutputFormatter
        from pydantic import BaseModel
        from step import Pipeline, Step, StepVariant

        class _FmtConfig(BaseModel):
            pass

        class _DummyFormatter(OutputFormatter):
            def format_output(self, image, output_format="png", quality=None):
                return b"pipeline-ok", "image/png"

        fmt_step = Step(
            component=_DummyFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="test_fmt",
            name="Test Formatter",
            description="Dummy",
            version="1.0.0",
            config_schema=_FmtConfig,
        )

        pipeline = Pipeline([AdjustStep(), fmt_step])
        data, ctype = pipeline.execute(
            full_rgba,
            configs={
                "adjust": AdjustConfig(padding=0),
            },
        )
        assert data == b"pipeline-ok"
        assert ctype == "image/png"

    def test_adjust_then_resize(self, full_rgba):
        """Adjust then resize should work in sequence."""
        from base import OutputFormatter
        from pydantic import BaseModel
        from resize_step import ResizeConfig, ResizeStep
        from step import Pipeline, Step, StepVariant

        class _FmtConfig(BaseModel):
            pass

        class _DummyFormatter(OutputFormatter):
            def format_output(self, image, output_format="png", quality=None):
                return b"adjust-resize", "image/png"

        fmt_step = Step(
            component=_DummyFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="test_fmt",
            name="Test Formatter",
            description="Dummy",
            version="1.0.0",
            config_schema=_FmtConfig,
        )

        pipeline = Pipeline([AdjustStep(), ResizeStep(), fmt_step])
        data, ctype = pipeline.execute(
            full_rgba,
            configs={
                "adjust": AdjustConfig(padding=0),
                "resize": ResizeConfig(
                    preset="custom", width=50, height=50, mode="stretch"
                ),
            },
        )
        assert data == b"adjust-resize"
        assert ctype == "image/png"
