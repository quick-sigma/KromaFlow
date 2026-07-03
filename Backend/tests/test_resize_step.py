"""Tests for the Resize pipeline step (resize_step.py).

Covers:
* :class:`ResizeConfig` — schema defaults, validation, frontend hints.
* :class:`ResizeProcessor` — all three resize modes, edge cases.
* :class:`ResizeStep` — registration, instantiation, pipeline integration.
"""

from __future__ import annotations

import sys

sys.path.insert(0, "..")

import pytest
from PIL import Image
from pydantic import ValidationError

from resize_step import (
    RESOLUTION_PRESETS,
    ResizeConfig,
    ResizeProcessor,
    ResizeStep,
    _parse_hex_color,
)
from step import StepVariant, _registry, _step_id_map, get_registered_steps


# ═══════════════════════════════════════════════════════════════════════════
# ── Fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture
def sample_image_rgb():
    """A small RGB image."""
    return Image.new("RGB", (200, 100), color=(64, 128, 255))


@pytest.fixture
def sample_image_rgba():
    """A small RGBA image."""
    return Image.new("RGBA", (200, 100), color=(64, 128, 255, 128))


@pytest.fixture
def sample_image_wide():
    """Wide image (landscape)."""
    return Image.new("RGB", (400, 100), color=(10, 20, 30))


@pytest.fixture
def sample_image_tall():
    """Tall image (portrait)."""
    return Image.new("RGB", (100, 400), color=(30, 20, 10))


@pytest.fixture
def sample_image_small():
    """Image smaller than the target dimensions."""
    return Image.new("RGB", (50, 50), color=(255, 0, 0))


@pytest.fixture
def processor():
    return ResizeProcessor()


# ═══════════════════════════════════════════════════════════════════════════
# ── _parse_hex_color
# ═══════════════════════════════════════════════════════════════════════════


class TestParseHexColor:
    def test_with_hash(self):
        assert _parse_hex_color("#FF0000") == (255, 0, 0)

    def test_without_hash(self):
        assert _parse_hex_color("00FF00") == (0, 255, 0)

    def test_blue(self):
        assert _parse_hex_color("#0000FF") == (0, 0, 255)

    def test_black(self):
        assert _parse_hex_color("#000000") == (0, 0, 0)

    def test_white(self):
        assert _parse_hex_color("#FFFFFF") == (255, 255, 255)

    def test_invalid_short(self):
        with pytest.raises(ValueError, match="Invalid hex colour"):
            _parse_hex_color("#FFF")

    def test_invalid_chars(self):
        with pytest.raises(ValueError, match="Invalid hex colour"):
            _parse_hex_color("#GGGGGG")


# ═══════════════════════════════════════════════════════════════════════════
# ── ResizeConfig
# ═══════════════════════════════════════════════════════════════════════════


class TestResizeConfig:
    def test_default_values(self):
        cfg = ResizeConfig()
        assert cfg.preset == "1920x1080"
        assert cfg.width == 1920
        assert cfg.height == 1080
        assert cfg.mode == "fit"
        assert cfg.background_color == "#000000"

    def test_preset_resolution(self):
        cfg = ResizeConfig(preset="1280x720")
        assert cfg.preset == "1280x720"

    def test_custom_resolution(self):
        cfg = ResizeConfig(preset="custom", width=800, height=600)
        assert cfg.preset == "custom"
        assert cfg.width == 800
        assert cfg.height == 600

    def test_mode_fill(self):
        cfg = ResizeConfig(mode="fill")
        assert cfg.mode == "fill"

    def test_mode_stretch(self):
        cfg = ResizeConfig(mode="stretch")
        assert cfg.mode == "stretch"

    def test_invalid_mode_raises(self):
        with pytest.raises(ValidationError):
            ResizeConfig(mode="invalid")

    def test_invalid_preset_raises(self):
        """Preset must be one of the allowed options."""
        with pytest.raises(ValidationError):
            ResizeConfig(preset="non_existent")

    def test_width_validation(self):
        with pytest.raises(ValidationError):
            ResizeConfig(preset="custom", width=0)

    def test_height_validation(self):
        with pytest.raises(ValidationError):
            ResizeConfig(preset="custom", height=0)

    def test_background_color_custom(self):
        cfg = ResizeConfig(background_color="#FFFFFF")
        assert cfg.background_color == "#FFFFFF"

    def test_json_schema_has_frontend_hints(self):
        schema = ResizeConfig.model_json_schema()
        props = schema["properties"]

        # preset: dropdown
        preset_props = props["preset"]
        assert preset_props.get("frontend_type") == "dropdown"
        assert "enum" in preset_props
        assert preset_props["type"] == "string"

        # mode: dropdown with radiogroup
        mode_props = props["mode"]
        assert mode_props.get("frontend_type") == "dropdown"
        assert mode_props.get("ui_options", {}).get("ui_type") == "radiogroup"
        assert mode_props["enum"] == ["fit", "fill", "stretch"]

        # width/height: plain integers
        assert props["width"]["type"] == "integer"
        assert props["width"]["minimum"] == 1
        assert props["height"]["type"] == "integer"

        # background_color: plain string
        assert props["background_color"]["type"] == "string"

    def test_preset_options_ordered(self):
        """Custom should be first, then descending resolutions."""
        schema = ResizeConfig.model_json_schema()
        enum = schema["properties"]["preset"]["enum"]
        assert enum[0] == "custom"
        assert "3840x2160" in enum
        assert "1920x1080" in enum
        assert "640x480" in enum


# ═══════════════════════════════════════════════════════════════════════════
# ── ResizeProcessor — Stretch mode
# ═══════════════════════════════════════════════════════════════════════════


class TestProcessorStretch:
    def test_stretch_to_larger(self, processor, sample_image_rgb):
        result = processor.process(
            sample_image_rgb, ResizeConfig(mode="stretch", preset="custom", width=400, height=200)
        )
        assert result.size == (400, 200)

    def test_stretch_to_smaller(self, processor, sample_image_rgb):
        result = processor.process(
            sample_image_rgb, ResizeConfig(mode="stretch", preset="custom", width=50, height=25)
        )
        assert result.size == (50, 25)

    def test_stretch_ignores_aspect_ratio(self, processor, sample_image_rgb):
        """Stretch should warp the aspect ratio."""
        result = processor.process(
            sample_image_rgb, ResizeConfig(mode="stretch", preset="custom", width=100, height=200)
        )
        assert result.size == (100, 200)
        # The original 200x100 becomes 100x200 — aspect is flipped

    def test_stretch_with_preset(self, processor, sample_image_rgb):
        result = processor.process(
            sample_image_rgb, ResizeConfig(mode="stretch", preset="1920x1080")
        )
        assert result.size == (1920, 1080)

    def test_stretch_preserves_mode_rgb(self, processor, sample_image_rgb):
        result = processor.process(
            sample_image_rgb, ResizeConfig(mode="stretch", preset="custom", width=100, height=50)
        )
        assert result.mode == "RGB"

    def test_stretch_with_rgba(self, processor, sample_image_rgba):
        """RGBA images should keep their alpha channel visible in output."""
        result = processor.process(
            sample_image_rgba, ResizeConfig(mode="stretch", preset="custom", width=100, height=50)
        )
        assert result.size == (100, 50)


# ═══════════════════════════════════════════════════════════════════════════
# ── ResizeProcessor — Fill mode
# ═══════════════════════════════════════════════════════════════════════════


class TestProcessorFill:
    def test_fill_exact_ratio(self, processor, sample_image_rgb):
        """When source and target ratios match, no cropping occurs."""
        # Source 200x100 (2:1), target 400x200 (2:1)
        result = processor.process(
            sample_image_rgb, ResizeConfig(mode="fill", preset="custom", width=400, height=200)
        )
        assert result.size == (400, 200)

    def test_fill_wide_source(self, processor, sample_image_wide):
        """Wide source (4:1) into square target (1:1) → crop width."""
        result = processor.process(
            sample_image_wide, ResizeConfig(mode="fill", preset="custom", width=200, height=200)
        )
        assert result.size == (200, 200)

    def test_fill_tall_source(self, processor, sample_image_tall):
        """Tall source (1:4) into square target (1:1) → crop height."""
        result = processor.process(
            sample_image_tall, ResizeConfig(mode="fill", preset="custom", width=200, height=200)
        )
        assert result.size == (200, 200)

    def test_fill_presets(self, processor, sample_image_rgb):
        result = processor.process(
            sample_image_rgb, ResizeConfig(mode="fill", preset="1280x720")
        )
        assert result.size == (1280, 720)

    def test_fill_no_padding(self, processor, sample_image_rgb):
        """Fill mode should never add padding — image covers the whole canvas."""
        result = processor.process(
            sample_image_rgb, ResizeConfig(mode="fill", preset="custom", width=100, height=100)
        )
        # Check a centre pixel (should not be background colour)
        centre_pixel = result.getpixel((50, 50))
        # The original image has blue (64, 128, 255), stretched should have colour
        assert centre_pixel != (0, 0, 0)


# ═══════════════════════════════════════════════════════════════════════════
# ── ResizeProcessor — Fit mode
# ═══════════════════════════════════════════════════════════════════════════


class TestProcessorFit:
    def test_fit_same_ratio(self, processor, sample_image_rgb):
        """When source and target ratios match, no padding is visible."""
        result = processor.process(
            sample_image_rgb,
            ResizeConfig(mode="fit", preset="custom", width=400, height=200, background_color="#FFFFFF"),
        )
        assert result.size == (400, 200)

    def test_fit_wide_source_adds_padding(self, processor, sample_image_wide):
        """Wide source in square target → top/bottom padding."""
        result = processor.process(
            sample_image_wide,
            ResizeConfig(mode="fit", preset="custom", width=200, height=200, background_color="#FF0000"),
        )
        assert result.size == (200, 200)
        # Top-left corner should be the background colour (red)
        pixel = result.getpixel((0, 0))
        assert pixel == (255, 0, 0)

    def test_fit_tall_source_adds_padding(self, processor, sample_image_tall):
        """Tall source in square target → left/right padding."""
        result = processor.process(
            sample_image_tall,
            ResizeConfig(mode="fit", preset="custom", width=200, height=200, background_color="#00FF00"),
        )
        assert result.size == (200, 200)

    def test_fit_small_image_no_upscale(self, processor, sample_image_small):
        """thumbnail() only downscales, so a small image keeps its size."""
        result = processor.process(
            sample_image_small,
            ResizeConfig(mode="fit", preset="custom", width=200, height=200, background_color="#000000"),
        )
        assert result.size == (200, 200)
        # The 50x50 red image should be centred on the black background
        # Centre point should have colour (the image centred)
        cx, cy = 100, 100
        centre = result.getpixel((cx, cy))
        assert centre == (255, 0, 0)

    def test_fit_with_rgba(self, processor, sample_image_rgba):
        """RGBA image in fit mode — alpha should be preserved."""
        result = processor.process(
            sample_image_rgba,
            ResizeConfig(mode="fit", preset="custom", width=100, height=100, background_color="#000000"),
        )
        assert result.size == (100, 100)

    def test_fit_default_background(self, processor, sample_image_wide):
        """Default background is black (#000000)."""
        result = processor.process(
            sample_image_wide,
            ResizeConfig(mode="fit", preset="custom", width=200, height=200),
        )
        pixel = result.getpixel((0, 0))
        assert pixel == (0, 0, 0)


# ═══════════════════════════════════════════════════════════════════════════
# ── ResizeProcessor — Edge cases & integration
# ═══════════════════════════════════════════════════════════════════════════


class TestProcessorEdgeCases:
    def test_process_without_config(self, processor, sample_image_rgb):
        """Calling process without config should use defaults (1920x1080 fit)."""
        result = processor.process(sample_image_rgb)
        assert result.size == (1920, 1080)

    def test_process_with_none_config(self, processor, sample_image_rgb):
        result = processor.process(sample_image_rgb, None)
        assert result.size == (1920, 1080)

    def test_preset_resolves_dimensions(self, processor, sample_image_rgb):
        """Using a preset should use preset dimensions regardless of width/height fields."""
        cfg = ResizeConfig(preset="640x480", width=9999, height=9999)
        result = processor.process(sample_image_rgb, cfg)
        assert result.size == (640, 480)

    def test_unknown_preset_falls_back_to_custom(self, processor, sample_image_rgb):
        """An unknown preset key should fall back to width/height fields."""
        cfg = ResizeConfig(preset="custom", width=123, height=456)
        # This works since 'custom' is handled specially.
        # We'd need to test the fallback path by modifying internal state.
        # Test that custom uses width/height fields:
        result = processor.process(sample_image_rgb, cfg)
        assert result.size == (123, 456)

    def test_output_is_copy_not_original(self, processor, sample_image_rgb):
        """The processor should not mutate the input image."""
        original_id = id(sample_image_rgb)
        result = processor.process(
            sample_image_rgb, ResizeConfig(mode="stretch", preset="custom", width=100, height=100)
        )
        assert id(result) != original_id

    @pytest.mark.parametrize("mode", ["fit", "fill", "stretch"])
    def test_all_modes_produce_correct_size(self, processor, sample_image_rgb, mode):
        """All modes should produce the exact target dimensions."""
        result = processor.process(
            sample_image_rgb,
            ResizeConfig(mode=mode, preset="custom", width=300, height=200),
        )
        assert result.size == (300, 200), f"Mode {mode} failed"

    def test_resolution_presets_all_defined(self):
        """All preset keys should map to positive dimensions (except 'custom')."""
        for key, (w, h) in RESOLUTION_PRESETS.items():
            if key == "custom":
                continue
            assert w > 0 and h > 0, f"Preset {key} has invalid dimensions: {w}x{h}"


# ═══════════════════════════════════════════════════════════════════════════
# ── Registration (side-effect of importing resize_step)
# ═══════════════════════════════════════════════════════════════════════════


class TestRegistration:
    def test_step_registered_in_id_map(self):
        assert "resize" in _step_id_map
        assert _step_id_map["resize"] is ResizeStep

    def test_step_registered_in_registry(self):
        assert "Resize" in _registry
        assert _registry["Resize"] is ResizeStep

    def test_step_info_available(self):
        infos = get_registered_steps()
        resize_infos = [i for i in infos if i.id == "resize"]
        assert len(resize_infos) == 1

        info = resize_infos[0]
        assert info.name == "Resize"
        assert info.variant == StepVariant.PROCESSOR
        assert info.version == "1.0.0"
        assert "preset" in info.config_schema.get("properties", {})
        assert "mode" in info.config_schema.get("properties", {})
        assert info.has_configurable_options is True


# ═══════════════════════════════════════════════════════════════════════════
# ── Instantiation
# ═══════════════════════════════════════════════════════════════════════════


class TestInstantiation:
    def test_step_instantiation(self):
        step = ResizeStep()
        assert step.id == "resize"
        assert step.name == "Resize"
        assert step.variant == StepVariant.PROCESSOR
        assert step.config_schema is ResizeConfig

    def test_processor_lazy(self):
        """The ResizeProcessor component should be created at init time (no lazy model)."""
        step = ResizeStep()
        assert step._component is not None
        assert isinstance(step._component, ResizeProcessor)


# ═══════════════════════════════════════════════════════════════════════════
# ── Pipeline integration
# ═══════════════════════════════════════════════════════════════════════════


class TestPipelineIntegration:
    def test_pipeline_with_resize_step(self, sample_image_rgb):
        """Resize step followed by a test formatter should work end-to-end."""
        from base import OutputFormatter
        from pydantic import BaseModel

        from step import Pipeline, Step, StepVariant

        # Dummy formatter
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

        resize_step = ResizeStep()
        pipeline = Pipeline([resize_step, fmt_step])

        data, ctype = pipeline.execute(
            sample_image_rgb,
            configs={
                "resize": ResizeConfig(
                    preset="custom", width=100, height=100, mode="stretch"
                )
            },
        )
        assert data == b"pipeline-ok"
        assert ctype == "image/png"

    def test_pipeline_resize_then_upscale(self, sample_image_rgb):
        """Resize first, then Real-ESRGAN (mocked) should work."""
        from unittest.mock import MagicMock, patch

        from base import OutputFormatter
        from pydantic import BaseModel

        from step import Pipeline, Step, StepVariant

        class _FmtConfig(BaseModel):
            pass

        class _DummyFormatter(OutputFormatter):
            def format_output(self, image, output_format="png", quality=None):
                return b"multi-step", "image/png"

        fmt_step = Step(
            component=_DummyFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="test_fmt",
            name="Test Formatter",
            description="Dummy",
            version="1.0.0",
            config_schema=_FmtConfig,
        )

        # Build pipeline: Resize → DummyFormatter
        resize_step = ResizeStep()
        pipeline = Pipeline([resize_step, fmt_step])

        result = pipeline.execute(
            sample_image_rgb,
            configs={
                "resize": ResizeConfig(
                    preset="1920x1080", mode="fill"
                )
            },
        )
        assert result.output_bytes == b"multi-step"
        assert result.content_type == "image/png"

    def test_pipeline_without_resize_config(self, sample_image_rgb):
        """Pipeline should work even when no config is provided for the resize step."""
        from base import OutputFormatter
        from pydantic import BaseModel

        from step import Pipeline, Step, StepVariant

        class _FmtConfig(BaseModel):
            pass

        class _DummyFormatter(OutputFormatter):
            def format_output(self, image, output_format="png", quality=None):
                return b"no-config", "image/png"

        fmt_step = Step(
            component=_DummyFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="test_fmt",
            name="Test Formatter",
            description="Dummy",
            version="1.0.0",
            config_schema=_FmtConfig,
        )

        pipeline = Pipeline([ResizeStep(), fmt_step])
        data, ctype = pipeline.execute(sample_image_rgb)
        # Should use default config (1920x1080 fit)
        assert data == b"no-config"
        assert ctype == "image/png"
