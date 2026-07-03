"""Tests for PNG, JPEG, and ICO output formatters (image_formatters.py).

Covers:
* :class:`PNGOutputFormatter` / :class:`PNGOutputFormatterStep`
* :class:`JPEGOutputFormatter` / :class:`JPEGOutputFormatterStep`
* :class:`ICOOutputFormatter` / :class:`ICOOutputFormatterStep`
"""

from __future__ import annotations

import sys

sys.path.insert(0, "..")

import pytest
from PIL import Image
from pydantic import ValidationError

from image_formatters import (
    PNGConfig,
    PNGOutputFormatter,
    PNGOutputFormatterStep,
    JPEGConfig,
    JPEGOutputFormatter,
    JPEGOutputFormatterStep,
    ICOConfig,
    ICOOutputFormatter,
    ICOOutputFormatterStep,
)
from step import StepVariant, _step_id_map, get_registered_steps


# ═══════════════════════════════════════════════════════════════════════════
# ── Fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture
def rgb_image():
    return Image.new("RGB", (64, 48), color=(10, 20, 30))


@pytest.fixture
def rgba_image():
    return Image.new("RGBA", (64, 48), color=(10, 20, 30, 128))


@pytest.fixture
def grayscale_image():
    return Image.new("L", (32, 32), color=128)


# ═══════════════════════════════════════════════════════════════════════════
# ── PNG
# ═══════════════════════════════════════════════════════════════════════════


class TestPNGConfig:
    def test_default_values(self):
        cfg = PNGConfig()
        assert cfg.quality == 6

    def test_custom_quality(self):
        cfg = PNGConfig(quality=9)
        assert cfg.quality == 9

    def test_quality_below_min(self):
        with pytest.raises(ValidationError):
            PNGConfig(quality=0)

    def test_quality_above_max(self):
        with pytest.raises(ValidationError):
            PNGConfig(quality=10)

    def test_json_schema_has_slider_hint(self):
        schema = PNGConfig.model_json_schema()
        props = schema["properties"]["quality"]
        assert props.get("frontend_type") == "slider"
        assert props["minimum"] == 1
        assert props["maximum"] == 9


class TestPNGOutputFormatter:
    def test_returns_bytes_and_png_mime(self, rgb_image):
        fmt = PNGOutputFormatter()
        data, mime = fmt.format_output(rgb_image, "png")
        assert isinstance(data, bytes)
        assert len(data) > 0
        assert mime == "image/png"

    def test_rgba_preserves_alpha(self, rgba_image):
        """PNG supports alpha natively — RGBA should stay RGBA."""
        fmt = PNGOutputFormatter()
        data, mime = fmt.format_output(rgba_image, "png")
        assert mime == "image/png"
        # Re-open and verify mode is RGBA
        from io import BytesIO

        reloaded = Image.open(BytesIO(data))
        assert reloaded.mode == "RGBA"

    def test_grayscale_converted(self, grayscale_image):
        fmt = PNGOutputFormatter()
        data, mime = fmt.format_output(grayscale_image, "png")
        from io import BytesIO

        reloaded = Image.open(BytesIO(data))
        # PNG will save L as L, but we convert to RGB before save
        assert reloaded.mode in ("RGB", "RGBA")

    def test_unsupported_format_raises(self, rgb_image):
        fmt = PNGOutputFormatter()
        with pytest.raises(ValueError, match="only supports PNG"):
            fmt.format_output(rgb_image, "jpeg")

    def test_quality_affects_output_size(self, rgb_image):
        """Higher compression level should produce smaller files."""
        fmt = PNGOutputFormatter()
        data_low, _ = fmt.format_output(rgb_image, "png", quality=1)  # fast/large
        data_high, _ = fmt.format_output(rgb_image, "png", quality=9)  # slow/small
        assert len(data_high) <= len(data_low)

    def test_without_quality_uses_default(self, rgb_image):
        fmt = PNGOutputFormatter()
        data, mime = fmt.format_output(rgb_image, "png")
        assert len(data) > 0


class TestPNGStep:
    def test_step_registered(self):
        assert "png_fmt" in _step_id_map
        assert _step_id_map["png_fmt"] is PNGOutputFormatterStep

    def test_step_info(self):
        infos = get_registered_steps()
        png = [i for i in infos if i.id == "png_fmt"]
        assert len(png) == 1
        info = png[0]
        assert info.name == "PNG Image Output"
        assert info.variant == StepVariant.OUTPUT_FORMATTER
        assert info.has_configurable_options is True

    def test_default_format(self):
        step = PNGOutputFormatterStep()
        assert step.default_format == "png"

    def test_pipeline_integration(self, rgb_image):
        from base import Processor
        from pydantic import BaseModel
        from step import Pipeline, Step, StepVariant

        # Identity processor (required by Pipeline rules)
        class _ProcConfig(BaseModel):
            pass

        class _IdentityProcessor(Processor):
            def process(self, image, instructions=None):
                return image.copy()

        proc_step = Step(
            component=_IdentityProcessor(),
            variant=StepVariant.PROCESSOR,
            id="identity",
            name="Identity",
            description="Pass-through processor",
            version="1.0.0",
            config_schema=_ProcConfig,
        )

        pipeline = Pipeline([proc_step, PNGOutputFormatterStep()])
        result = pipeline.execute(rgb_image)
        data, mime = result
        assert mime == "image/png"
        assert len(data) > 0
        from io import BytesIO

        reloaded = Image.open(BytesIO(data))
        assert reloaded.size == (64, 48)


# ═══════════════════════════════════════════════════════════════════════════
# ── JPEG
# ═══════════════════════════════════════════════════════════════════════════


class TestJPEGConfig:
    def test_default_values(self):
        cfg = JPEGConfig()
        assert cfg.quality == 85

    def test_custom_quality(self):
        cfg = JPEGConfig(quality=50)
        assert cfg.quality == 50

    def test_quality_below_min(self):
        with pytest.raises(ValidationError):
            JPEGConfig(quality=0)

    def test_quality_above_max(self):
        with pytest.raises(ValidationError):
            JPEGConfig(quality=101)


class TestJPEGOutputFormatter:
    def test_returns_bytes_and_jpeg_mime(self, rgb_image):
        fmt = JPEGOutputFormatter()
        data, mime = fmt.format_output(rgb_image, "jpeg")
        assert isinstance(data, bytes)
        assert len(data) > 0
        assert mime == "image/jpeg"

    def test_rgba_composited_to_rgb(self, rgba_image):
        """JPEG doesn't support alpha — RGBA should be composited onto white."""
        fmt = JPEGOutputFormatter()
        data, mime = fmt.format_output(rgba_image, "jpeg")
        from io import BytesIO

        reloaded = Image.open(BytesIO(data))
        assert reloaded.mode == "RGB"

    def test_grayscale_converted(self, grayscale_image):
        fmt = JPEGOutputFormatter()
        data, mime = fmt.format_output(grayscale_image, "jpeg")
        from io import BytesIO

        reloaded = Image.open(BytesIO(data))
        assert reloaded.mode == "RGB"

    def test_unsupported_format_raises(self, rgb_image):
        fmt = JPEGOutputFormatter()
        with pytest.raises(ValueError, match="only supports JPEG"):
            fmt.format_output(rgb_image, "png")

    def test_quality_affects_output_size(self, rgb_image):
        """Higher quality should produce larger files."""
        fmt = JPEGOutputFormatter()
        data_low, _ = fmt.format_output(rgb_image, "jpeg", quality=10)
        data_high, _ = fmt.format_output(rgb_image, "jpeg", quality=95)
        assert len(data_high) >= len(data_low)

    def test_jpg_alias(self, rgb_image):
        """'jpg' should work as an alias for 'jpeg'."""
        fmt = JPEGOutputFormatter()
        data, mime = fmt.format_output(rgb_image, "jpg")
        assert mime == "image/jpeg"
        assert len(data) > 0

    def test_without_quality(self, rgb_image):
        fmt = JPEGOutputFormatter()
        data, mime = fmt.format_output(rgb_image, "jpeg")
        assert len(data) > 0


class TestJPEGStep:
    def test_step_registered(self):
        assert "jpeg_fmt" in _step_id_map
        assert _step_id_map["jpeg_fmt"] is JPEGOutputFormatterStep

    def test_step_info(self):
        infos = get_registered_steps()
        jpeg = [i for i in infos if i.id == "jpeg_fmt"]
        assert len(jpeg) == 1
        info = jpeg[0]
        assert info.name == "JPEG Image Output"
        assert info.variant == StepVariant.OUTPUT_FORMATTER
        assert info.has_configurable_options is True

    def test_default_format(self):
        step = JPEGOutputFormatterStep()
        assert step.default_format == "jpeg"

    def test_pipeline_integration(self, rgb_image):
        from base import Processor
        from pydantic import BaseModel
        from step import Pipeline, Step, StepVariant

        class _ProcConfig(BaseModel):
            pass

        class _IdentityProcessor(Processor):
            def process(self, image, instructions=None):
                return image.copy()

        proc_step = Step(
            component=_IdentityProcessor(),
            variant=StepVariant.PROCESSOR,
            id="identity",
            name="Identity",
            description="Pass-through processor",
            version="1.0.0",
            config_schema=_ProcConfig,
        )

        pipeline = Pipeline([proc_step, JPEGOutputFormatterStep()])
        result = pipeline.execute(rgb_image)
        data, mime = result
        assert mime == "image/jpeg"
        assert len(data) > 0


# ═══════════════════════════════════════════════════════════════════════════
# ── ICO
# ═══════════════════════════════════════════════════════════════════════════


class TestICOConfig:
    def test_default_values(self):
        cfg = ICOConfig()
        # No fields — should instantiate cleanly
        assert isinstance(cfg, ICOConfig)

    def test_json_schema_has_no_properties(self):
        schema = ICOConfig.model_json_schema()
        props = schema.get("properties", {})
        assert len(props) == 0


class TestICOOutputFormatter:
    def test_returns_bytes_and_ico_mime(self, rgba_image):
        fmt = ICOOutputFormatter()
        data, mime = fmt.format_output(rgba_image, "ico")
        assert isinstance(data, bytes)
        assert len(data) > 0
        assert mime == "image/x-icon"

    def test_rgb_converted_to_rgba(self, rgb_image):
        """ICO expects RGBA — RGB input should be converted."""
        fmt = ICOOutputFormatter()
        data, mime = fmt.format_output(rgb_image, "ico")
        from io import BytesIO

        reloaded = Image.open(BytesIO(data))
        assert reloaded.mode == "RGBA"

    def test_large_image_is_resized(self):
        """ICO max dimension is 256px — larger images should be scaled down."""
        large = Image.new("RGBA", (512, 512))
        fmt = ICOOutputFormatter()
        data, mime = fmt.format_output(large, "ico")
        from io import BytesIO

        reloaded = Image.open(BytesIO(data))
        # ICO saves at whatever size, but we resize before saving
        assert reloaded.width <= 256
        assert reloaded.height <= 256

    def test_small_image_preserved(self):
        """Images under 256px should keep their size."""
        small = Image.new("RGBA", (32, 32))
        fmt = ICOOutputFormatter()
        data, mime = fmt.format_output(small, "ico")
        from io import BytesIO

        reloaded = Image.open(BytesIO(data))
        assert reloaded.size == (32, 32)  # ICO may have different internal sizes

    def test_unsupported_format_raises(self, rgba_image):
        fmt = ICOOutputFormatter()
        with pytest.raises(ValueError, match="only supports ICO"):
            fmt.format_output(rgba_image, "png")


class TestICOStep:
    def test_step_registered(self):
        assert "ico_fmt" in _step_id_map
        assert _step_id_map["ico_fmt"] is ICOOutputFormatterStep

    def test_step_info(self):
        infos = get_registered_steps()
        ico = [i for i in infos if i.id == "ico_fmt"]
        assert len(ico) == 1
        info = ico[0]
        assert info.name == "ICO Image Output"
        assert info.variant == StepVariant.OUTPUT_FORMATTER
        assert info.has_configurable_options is False

    def test_default_format(self):
        step = ICOOutputFormatterStep()
        assert step.default_format == "ico"

    def test_pipeline_integration(self, rgba_image):
        from base import Processor
        from pydantic import BaseModel
        from step import Pipeline, Step, StepVariant

        class _ProcConfig(BaseModel):
            pass

        class _IdentityProcessor(Processor):
            def process(self, image, instructions=None):
                return image.copy()

        proc_step = Step(
            component=_IdentityProcessor(),
            variant=StepVariant.PROCESSOR,
            id="identity",
            name="Identity",
            description="Pass-through processor",
            version="1.0.0",
            config_schema=_ProcConfig,
        )

        pipeline = Pipeline([proc_step, ICOOutputFormatterStep()])
        result = pipeline.execute(rgba_image)
        data, mime = result
        assert mime == "image/x-icon"
        assert len(data) > 0
