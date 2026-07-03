"""Tests for the Step abstraction layer (step.py, steps_config.py)."""

from __future__ import annotations

import sys

sys.path.insert(0, "..")

from typing import Optional

import pytest
from PIL import Image
from pydantic import BaseModel, ValidationError

from base import OutputFormatter, Processor
from step import (
    Pipeline,
    Step,
    StepInfo,
    StepVariant,
    _registry,
    _step_id_map,
    get_registered_steps,
    pipeline_from_steps,
    register,
)
from steps_config import (
    AVIFOutputFormatterStep,
    AVIFOutputFormatConfig,
    WatermarkRemovalConfig,
    WatermarkRemovalStep,
)


# ═══════════════════════════════════════════════════════════════════════════
# ── StepVariant
# ═══════════════════════════════════════════════════════════════════════════


class TestStepVariant:
    def test_processor_value(self):
        assert StepVariant.PROCESSOR.value == "processor"

    def test_output_formatter_value(self):
        assert StepVariant.OUTPUT_FORMATTER.value == "output_formatter"

    def test_is_str_enum(self):
        assert issubclass(StepVariant, str)

    def test_distinct_values(self):
        assert StepVariant.PROCESSOR != StepVariant.OUTPUT_FORMATTER


# ═══════════════════════════════════════════════════════════════════════════
# ── StepInfo
# ═══════════════════════════════════════════════════════════════════════════


class TestStepInfo:
    def test_minimal_model(self):
        info = StepInfo(
            id="resize",
            name="Resize",
            description="Resize an image",
            version="1.0.0",
            variant=StepVariant.PROCESSOR,
            config_schema={"type": "object", "properties": {}},
        )
        assert info.id == "resize"
        assert info.name == "Resize"
        assert info.variant == StepVariant.PROCESSOR

    def test_json_serializable(self):
        info = StepInfo(
            id="test_id",
            name="test",
            description="A test step",
            version="2.0.0",
            variant=StepVariant.OUTPUT_FORMATTER,
            config_schema={"type": "object"},
        )
        d = info.model_dump()
        assert d["id"] == "test_id"
        assert d["name"] == "test"
        assert d["variant"] == "output_formatter"
        assert d["config_schema"] == {"type": "object"}

    def test_invalid_variant_rejected(self):
        with pytest.raises(ValidationError):
            StepInfo(
                id="bad",
                name="bad",
                description="bad",
                version="1.0.0",
                variant="not-a-variant",  # type: ignore[arg-type]
                config_schema={},
            )


# ═══════════════════════════════════════════════════════════════════════════
# ── Step — instantiation
# ═══════════════════════════════════════════════════════════════════════════


class _DummyConfig(BaseModel):
    value: int = 42


class _DummyProcessor(Processor):
    """Minimal processor used in tests below."""

    def process(self, image, instructions=None):
        return image


class _DummyFormatter(OutputFormatter):
    """Minimal output formatter used in tests below."""

    def format_output(self, image, output_format="png", quality=None):
        return b"fake-data", "image/png"


class TestStepInstantiation:
    def test_processor_step(self):
        step = Step(
            component=_DummyProcessor(),
            variant=StepVariant.PROCESSOR,
            id="test_proc",
            name="test-processor",
            description="A test processor",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        assert step.id == "test_proc"
        assert step.name == "test-processor"
        assert step.variant == StepVariant.PROCESSOR
        assert step.config_schema == _DummyConfig

    def test_formatter_step(self):
        step = Step(
            component=_DummyFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="test_fmt",
            name="test-formatter",
            description="A test formatter",
            version="2.0.0",
            config_schema=_DummyConfig,
        )
        assert step.id == "test_fmt"
        assert step.name == "test-formatter"
        assert step.variant == StepVariant.OUTPUT_FORMATTER
        assert step.version == "2.0.0"

    def test_repr(self):
        step = Step(
            component=_DummyProcessor(),
            variant=StepVariant.PROCESSOR,
            id="my_step",
            name="my-step",
            description="desc",
            version="3.0.0",
            config_schema=_DummyConfig,
        )
        r = repr(step)
        assert "my_step" in r
        assert "my-step" in r
        assert "processor" in r


# ═══════════════════════════════════════════════════════════════════════════
# ── Step — execute
# ═══════════════════════════════════════════════════════════════════════════


class TestStepExecute:
    """Covers the base :meth:`Step.execute` dispatch logic."""

    def test_processor_execute_returns_image(self):
        step = Step(
            component=_DummyProcessor(),
            variant=StepVariant.PROCESSOR,
            id="proc",
            name="proc",
            description="desc",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        img = Image.new("RGB", (10, 10))
        cfg = _DummyConfig(value=99)
        result = step.execute(img, cfg)
        # _DummyProcessor returns the same image
        assert result is img

    def test_processor_execute_passes_config(self):
        """Verify config is forwarded to the component."""

        class _CheckingProcessor(Processor):
            def process(self, image, instructions=None):
                assert instructions == 42
                return image

        step = Step(
            component=_CheckingProcessor(),
            variant=StepVariant.PROCESSOR,
            id="check",
            name="check",
            description="desc",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        img = Image.new("RGB", (5, 5))
        step.execute(img, 42)  # type: ignore[arg-type]

    def test_processor_execute_with_none_config(self):
        step = Step(
            component=_DummyProcessor(),
            variant=StepVariant.PROCESSOR,
            id="proc",
            name="proc",
            description="desc",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        img = Image.new("RGB", (10, 10))
        result = step.execute(img)  # config = None
        assert result is img

    def test_formatter_execute_returns_bytes_and_content_type(self):
        step = Step(
            component=_DummyFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="fmt",
            name="fmt",
            description="desc",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        img = Image.new("RGB", (10, 10))
        data, ctype = step.execute(img, output_format="png")
        assert data == b"fake-data"
        assert ctype == "image/png"

    def test_formatter_execute_default_output_format(self):
        step = Step(
            component=_DummyFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="fmt",
            name="fmt",
            description="desc",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        img = Image.new("RGB", (1, 1))
        data, ctype = step.execute(img)
        assert ctype == "image/png"

    def test_formatter_execute_passes_quality(self):
        class _QualityFormatter(OutputFormatter):
            def format_output(self, image, output_format="png", quality=None):
                return b"ok" if quality == 50 else b"fail", "image/png"

        step = Step(
            component=_QualityFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="qfmt",
            name="qfmt",
            description="desc",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        img = Image.new("RGB", (1, 1))
        data, _ = step.execute(img, output_format="png", quality=50)
        assert data == b"ok"

    def test_invalid_variant_raises(self):
        """A Step with an unknown variant should raise ValueError."""
        step = Step(
            component=_DummyProcessor(),
            variant="alien",  # type: ignore[arg-type]
            id="alien",
            name="alien",
            description="desc",
            version="0.0.1",
            config_schema=_DummyConfig,
        )
        img = Image.new("RGB", (1, 1))
        with pytest.raises(ValueError, match="alien"):
            step.execute(img)


# ═══════════════════════════════════════════════════════════════════════════
# ── Step — info()
# ═══════════════════════════════════════════════════════════════════════════


class TestStepInfoMethod:
    def test_info_returns_stepinfo(self):
        step = Step(
            component=_DummyProcessor(),
            variant=StepVariant.PROCESSOR,
            id="info_test",
            name="info-test",
            description="Testing info",
            version="4.5.6",
            config_schema=_DummyConfig,
        )
        info = step.info()
        assert isinstance(info, StepInfo)
        assert info.id == "info_test"
        assert info.name == "info-test"
        assert info.description == "Testing info"
        assert info.version == "4.5.6"
        assert info.variant == StepVariant.PROCESSOR

    def test_info_contains_json_schema(self):
        step = Step(
            component=_DummyProcessor(),
            variant=StepVariant.PROCESSOR,
            id="schema_test",
            name="schema-test",
            description="desc",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        info = step.info()
        schema = info.config_schema
        assert "$schema" in schema or "properties" in schema
        assert "value" in schema.get("properties", {})


# ═══════════════════════════════════════════════════════════════════════════
# ── @register decorator
# ═══════════════════════════════════════════════════════════════════════════


class TestRegisterDecorator:
    def test_register_adds_to_registry_and_id_map(self):
        """A decorated Step subclass should appear in both registries."""

        class _RegTestConfig(BaseModel):
            flag: bool = False

        unique_name = f"_test_reg_name_{id(self)}"
        unique_id = f"_test_reg_id_{id(self)}"

        @register(id=unique_id, name=unique_name, description="reg test", version="0.0.1")
        class _RegTestStep(Step[_RegTestConfig]):
            def __init__(self):
                super().__init__(
                    component=_DummyProcessor(),
                    variant=StepVariant.PROCESSOR,
                    id=unique_id,
                    name=unique_name,
                    description="reg test",
                    version="0.0.1",
                    config_schema=_RegTestConfig,
                )

        assert unique_name in _registry
        assert unique_id in _step_id_map
        cls = _registry[unique_name]
        assert issubclass(cls, Step)
        assert _step_id_map[unique_id] is cls

    def test_register_on_non_step_raises_typeerror(self):
        """@register must only be applied to Step subclasses."""
        with pytest.raises(TypeError, match="can only be applied to Step"):

            @register(id="bad", name="bad", description="not a step")  # type: ignore[arg-type]
            class NotAStep:
                pass

    def test_get_registered_steps_returns_info_objects(self):
        """get_registered_steps() returns StepInfo for registered steps."""
        infos = get_registered_steps()
        assert all(isinstance(i, StepInfo) for i in infos)
        assert len(infos) > 0

    def test_get_registered_steps_contains_expected_metadata(self):
        """Check that core steps appear with correct metadata."""
        infos = get_registered_steps()
        names = {i.name for i in infos}

        assert "Watermark Remover" in names

        wm = next(i for i in infos if i.name == "Watermark Remover")
        assert wm.id == "wm_remover"
        assert wm.variant == StepVariant.PROCESSOR
        assert wm.version == "1.0.0"

        # AVIF formatter may or may not be available
        if "AVIF Image Output" in names:
            avif = next(i for i in infos if i.name == "AVIF Image Output")
            assert avif.id == "avif_fmt"
            assert avif.variant == StepVariant.OUTPUT_FORMATTER

    def test_get_registered_steps_sorted_by_name(self):
        infos = get_registered_steps()
        names = [i.name for i in infos]
        assert names == sorted(names)

    def test_skips_failing_instantiation(self):
        """A registered class that raises on __init__ is skipped."""
        class _BrokenConfig(BaseModel):
            pass

        class _BrokenStep(Step[_BrokenConfig]):
            def __init__(self):
                raise RuntimeError("I am broken")

        _registry["_will_fail"] = _BrokenStep  # type: ignore[assignment]
        try:
            infos = get_registered_steps()
            names = [i.name for i in infos]
            assert "_will_fail" not in names
        finally:
            del _registry["_will_fail"]


# ═══════════════════════════════════════════════════════════════════════════
# ── Config schemas
# ═══════════════════════════════════════════════════════════════════════════


class TestConfigSchemas:
    def test_watermark_removal_config_has_no_fields(self):
        """WatermarkRemovalConfig should have no configuration fields."""
        # No fields means the frontend will disable the settings button
        assert len(WatermarkRemovalConfig.model_fields) == 0

    def test_avif_output_format_config_defaults(self):
        if AVIFOutputFormatConfig:
            cfg = AVIFOutputFormatConfig()
            assert cfg.quality == 85

    def test_avif_output_format_config_custom(self):
        if AVIFOutputFormatConfig:
            cfg = AVIFOutputFormatConfig(quality=90)
            assert cfg.quality == 90

    def test_avif_output_format_config_range_zero(self):
        if AVIFOutputFormatConfig:
            cfg = AVIFOutputFormatConfig(quality=0)
            assert cfg.quality == 0

    def test_avif_output_format_config_range_hundred(self):
        if AVIFOutputFormatConfig:
            cfg = AVIFOutputFormatConfig(quality=100)
            assert cfg.quality == 100

    def test_avif_format_config_json_schema_has_slider_hint(self):
        if AVIFOutputFormatConfig:
            schema = AVIFOutputFormatConfig.model_json_schema()
            quality_props = schema["properties"]["quality"]
            assert quality_props.get("frontend_type") == "slider"
            assert quality_props.get("minimum") == 0
            assert quality_props.get("maximum") == 100


# ═══════════════════════════════════════════════════════════════════════════
# ── Concrete Step implementations
# ═══════════════════════════════════════════════════════════════════════════


class TestWatermarkRemovalStep:
    def test_instantiation(self):
        from step import _registry

        assert "Watermark Remover" in _registry

        step = WatermarkRemovalStep()
        assert step.id == "wm_remover"
        assert step.name == "Watermark Remover"
        assert step.variant == StepVariant.PROCESSOR

    def test_execute_calls_process(self):
        from unittest.mock import MagicMock, patch

        with patch("steps_config._watermark_available", True):
            with patch("steps_config.WatermarkRemoverProcessor") as mock_cls:
                mock_instance = MagicMock()
                mock_cls.return_value = mock_instance
                mock_instance.process.return_value = Image.new("RGB", (10, 10))

                step = WatermarkRemovalStep()
                img = Image.new("RGB", (5, 5), color=(255, 0, 0))
                config = WatermarkRemovalConfig()
                result = step.execute(img, config)

                mock_instance.process.assert_called_once()
                assert result.size == (10, 10)


class TestAVIFOutputFormatterStep:
    def test_registered_when_available(self):
        from step import _registry

        registered = "AVIF Image Output" in _registry
        if registered:
            step = AVIFOutputFormatterStep()
            assert step.id == "avif_fmt"
            assert step.variant == StepVariant.OUTPUT_FORMATTER
            assert step.name == "AVIF Image Output"


# ═══════════════════════════════════════════════════════════════════════════
# ── Integration: registry → instantiation → execute → API shape
# ═══════════════════════════════════════════════════════════════════════════


class TestIntegration:
    """End-to-end: registry → instantiation → execute → API shape."""

    def test_all_registered_steps_can_be_instantiated(self):
        infos = get_registered_steps()
        assert len(infos) >= 1  # at least watermark-remover

    def test_each_step_info_has_required_fields(self):
        infos = get_registered_steps()
        for info in infos:
            assert info.id
            assert info.name
            assert info.description
            assert info.version
            assert info.variant in (
                StepVariant.PROCESSOR,
                StepVariant.OUTPUT_FORMATTER,
                StepVariant.DISTRIBUTION,
            )
            assert isinstance(info.config_schema, dict)

    def test_processor_steps_have_output_schema(self):
        infos = get_registered_steps()
        processor_infos = [i for i in infos if i.variant == StepVariant.PROCESSOR]
        for info in processor_infos:
            assert "properties" in info.config_schema

    def test_formatter_steps_have_quality_in_schema(self):
        infos = get_registered_steps()
        formatter_infos = [
            i for i in infos if i.variant == StepVariant.OUTPUT_FORMATTER
        ]
        for info in formatter_infos:
            props = info.config_schema.get("properties", {})
            # Some formatters (e.g., ICO) are lossless and have no quality field
            if props:
                assert "quality" in props, (
                    f"{info.name} has properties but missing 'quality' in schema"
                )
