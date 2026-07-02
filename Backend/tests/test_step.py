"""Tests for the Step abstraction layer (step.py, steps_config.py)."""

from __future__ import annotations

import sys

sys.path.insert(0, "..")

from typing import Optional

import pytest
from PIL import Image
from pydantic import BaseModel, ValidationError

from base import OutputFormatter, Processor
from models import ProcessingInstructions
from step import (
    Step,
    StepInfo,
    StepVariant,
    _registry,
    get_registered_steps,
    register,
)
from steps_config import (
    AVIFOutputFormatterStep,
    ImageOutputFormatterStep,
    ImageProcessingConfig,
    ImageProcessorStep,
    OutputFormatConfig,
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
            name="resize",
            description="Resize an image",
            version="1.0.0",
            variant=StepVariant.PROCESSOR,
            config_schema={"type": "object", "properties": {}},
        )
        assert info.name == "resize"
        assert info.variant == StepVariant.PROCESSOR

    def test_json_serializable(self):
        info = StepInfo(
            name="test",
            description="A test step",
            version="2.0.0",
            variant=StepVariant.OUTPUT_FORMATTER,
            config_schema={"type": "object"},
        )
        d = info.model_dump()
        assert d["name"] == "test"
        assert d["variant"] == "output_formatter"
        assert d["config_schema"] == {"type": "object"}

    def test_invalid_variant_rejected(self):
        with pytest.raises(ValidationError):
            StepInfo(
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
            name="test-processor",
            description="A test processor",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        assert step.name == "test-processor"
        assert step.variant == StepVariant.PROCESSOR
        assert step.config_schema == _DummyConfig

    def test_formatter_step(self):
        step = Step(
            component=_DummyFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            name="test-formatter",
            description="A test formatter",
            version="2.0.0",
            config_schema=_DummyConfig,
        )
        assert step.name == "test-formatter"
        assert step.variant == StepVariant.OUTPUT_FORMATTER
        assert step.version == "2.0.0"

    def test_repr(self):
        step = Step(
            component=_DummyProcessor(),
            variant=StepVariant.PROCESSOR,
            name="my-step",
            description="desc",
            version="3.0.0",
            config_schema=_DummyConfig,
        )
        r = repr(step)
        assert "my-step" in r
        assert "processor" in r
        assert "3.0.0" in r


# ═══════════════════════════════════════════════════════════════════════════
# ── Step — execute
# ═══════════════════════════════════════════════════════════════════════════


class TestStepExecute:
    """Covers the base :meth:`Step.execute` dispatch logic."""

    def test_processor_execute_returns_image(self):
        step = Step(
            component=_DummyProcessor(),
            variant=StepVariant.PROCESSOR,
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
            name="info-test",
            description="Testing info",
            version="4.5.6",
            config_schema=_DummyConfig,
        )
        info = step.info()
        assert isinstance(info, StepInfo)
        assert info.name == "info-test"
        assert info.description == "Testing info"
        assert info.version == "4.5.6"
        assert info.variant == StepVariant.PROCESSOR

    def test_info_contains_json_schema(self):
        step = Step(
            component=_DummyProcessor(),
            variant=StepVariant.PROCESSOR,
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
    def test_register_adds_to_registry(self):
        """A decorated Step subclass should appear in the registry."""

        class _RegTestConfig(BaseModel):
            flag: bool = False

        # Use a unique name to avoid collisions
        unique_name = f"_test_reg_{id(self)}"

        @register(name=unique_name, description="reg test", version="0.0.1")
        class _RegTestStep(Step[_RegTestConfig]):
            def __init__(self):
                super().__init__(
                    component=_DummyProcessor(),
                    variant=StepVariant.PROCESSOR,
                    name=unique_name,
                    description="reg test",
                    version="0.0.1",
                    config_schema=_RegTestConfig,
                )

        assert unique_name in _registry
        cls = _registry[unique_name]
        assert issubclass(cls, Step)

    def test_register_on_non_step_raises_typeerror(self):
        """@register must only be applied to Step subclasses."""
        with pytest.raises(TypeError, match="can only be applied to Step"):

            @register(name="bad", description="not a step")  # type: ignore[arg-type]
            class NotAStep:
                pass

    def test_get_registered_steps_returns_info_objects(self):
        """get_registered_steps() returns StepInfo for registered steps."""
        # The registry already contains steps from steps_config; verify the
        # function returns StepInfo instances.
        infos = get_registered_steps()
        assert all(isinstance(i, StepInfo) for i in infos)
        assert len(infos) > 0

    def test_get_registered_steps_contains_expected_metadata(self):
        """Check that core steps appear with correct metadata."""
        infos = get_registered_steps()
        names = {i.name for i in infos}

        assert "image-processor" in names
        assert "image-output-formatter" in names

        proc = next(i for i in infos if i.name == "image-processor")
        assert proc.variant == StepVariant.PROCESSOR
        assert proc.version == "1.0.0"

        fmt = next(i for i in infos if i.name == "image-output-formatter")
        assert fmt.variant == StepVariant.OUTPUT_FORMATTER

    def test_get_registered_steps_sorted_by_name(self):
        infos = get_registered_steps()
        names = [i.name for i in infos]
        assert names == sorted(names)

    def test_skips_failing_instantiation(self):
        """A registered class that raises on __init__ is skipped."""
        # Inject a broken class into the registry
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
    def test_image_processing_config_is_processing_instructions(self):
        """ImageProcessingConfig should be a subclass of ProcessingInstructions."""
        assert issubclass(ImageProcessingConfig, ProcessingInstructions)

    def test_image_processing_config_validates(self):
        cfg = ImageProcessingConfig(rotate=90, grayscale=True)
        assert cfg.rotate == 90
        assert cfg.grayscale is True

    def test_watermark_removal_config_defaults(self):
        cfg = WatermarkRemovalConfig()
        assert cfg.enabled is True

    def test_watermark_removal_config_disabled(self):
        cfg = WatermarkRemovalConfig(enabled=False)
        assert cfg.enabled is False

    def test_output_format_config_defaults(self):
        cfg = OutputFormatConfig()
        assert cfg.format == "png"
        assert cfg.quality == 85

    def test_output_format_config_custom(self):
        cfg = OutputFormatConfig(format="webp", quality=90)
        assert cfg.format == "webp"
        assert cfg.quality == 90

    def test_output_format_config_quality_none(self):
        cfg = OutputFormatConfig(quality=None)
        assert cfg.quality is None


# ═══════════════════════════════════════════════════════════════════════════
# ── Concrete Step implementations
# ═══════════════════════════════════════════════════════════════════════════


class TestImageProcessorStep:
    def test_instantiation(self):
        step = ImageProcessorStep()
        assert step.name == "image-processor"
        assert step.variant == StepVariant.PROCESSOR
        assert step.config_schema == ImageProcessingConfig

    def test_execute_returns_processed_image(self):
        step = ImageProcessorStep()
        img = Image.new("RGB", (100, 100), color=(255, 0, 0))
        config = ImageProcessingConfig(grayscale=True)
        result = step.execute(img, config)
        assert isinstance(result, Image.Image)
        assert result.mode == "L"  # grayscale

    def test_execute_with_empty_config(self):
        step = ImageProcessorStep()
        img = Image.new("RGB", (50, 50))
        config = ImageProcessingConfig()
        result = step.execute(img, config)
        assert result.size == (50, 50)

    def test_info_contains_json_schema(self):
        step = ImageProcessorStep()
        info = step.info()
        assert "resize" in info.config_schema.get("properties", {})
        assert "rotate" in info.config_schema.get("properties", {})


class TestWatermarkRemovalStep:
    def test_instantiation(self):
        """WatermarkRemovalStep should be available but may fail if
        the 'remove-ai-watermarks' package is not installed."""
        # We just check the step is registered; instantiation depends
        # on the optional dependency.
        from step import _registry

        assert "watermark-remover" in _registry

    def test_execute_disabled_returns_copy(self):
        """When config.enabled=False, the image should be returned unchanged."""
        from unittest.mock import MagicMock, patch

        with patch("steps_config._watermark_available", True):
            with patch("steps_config.WatermarkRemoverProcessor") as mock_cls:
                mock_instance = MagicMock()
                mock_cls.return_value = mock_instance
                mock_instance.process.return_value = Image.new("RGB", (10, 10))

                step = WatermarkRemovalStep()
                img = Image.new("RGB", (5, 5), color=(255, 0, 0))
                config = WatermarkRemovalConfig(enabled=False)
                result = step.execute(img, config)

                # The original image should not have been passed to process()
                mock_instance.process.assert_not_called()
                assert result.size == (5, 5)


class TestImageOutputFormatterStep:
    def test_instantiation(self):
        step = ImageOutputFormatterStep()
        assert step.name == "image-output-formatter"
        assert step.variant == StepVariant.OUTPUT_FORMATTER
        assert step.config_schema == OutputFormatConfig

    def test_execute_returns_bytes(self):
        step = ImageOutputFormatterStep()
        img = Image.new("RGB", (10, 10))
        data, ctype = step.execute(img, output_format="png")
        assert isinstance(data, bytes)
        assert ctype == "image/png"
        assert len(data) > 0

    def test_info_contains_format_and_quality(self):
        step = ImageOutputFormatterStep()
        info = step.info()
        props = info.config_schema.get("properties", {})
        assert "format" in props
        assert "quality" in props


class TestAVIFOutputFormatterStep:
    def test_registered_when_available(self):
        """AVIF step should be registered if the formatter is importable."""
        from step import _registry

        # Either it's registered or not, depending on the environment.
        # We just verify it doesn't crash.
        registered = "avif-output-formatter" in _registry
        if registered:
            step = AVIFOutputFormatterStep()
            assert step.variant == StepVariant.OUTPUT_FORMATTER
            assert step.name == "avif-output-formatter"


# ═══════════════════════════════════════════════════════════════════════════
# ── Integration: everything works together
# ═══════════════════════════════════════════════════════════════════════════


class TestIntegration:
    """End-to-end: registry → instantiation → execute → API shape."""

    def test_all_registered_steps_can_be_instantiated(self):
        infos = get_registered_steps()
        # get_registered_steps already instantiates each class, so if we
        # got info objects back, instantiation succeeded.
        assert len(infos) >= 2  # at least image-processor + image-output-formatter

    def test_each_step_info_has_required_fields(self):
        infos = get_registered_steps()
        for info in infos:
            assert info.name
            assert info.description
            assert info.version
            assert info.variant in (StepVariant.PROCESSOR, StepVariant.OUTPUT_FORMATTER)
            assert isinstance(info.config_schema, dict)

    def test_processor_steps_have_output_schema(self):
        """Processor steps should expose a config schema with properties."""
        infos = get_registered_steps()
        processor_infos = [i for i in infos if i.variant == StepVariant.PROCESSOR]
        for info in processor_infos:
            assert "properties" in info.config_schema

    def test_formatter_steps_have_format_and_quality(self):
        infos = get_registered_steps()
        formatter_infos = [
            i for i in infos if i.variant == StepVariant.OUTPUT_FORMATTER
        ]
        for info in formatter_infos:
            props = info.config_schema.get("properties", {})
            assert "format" in props, f"{info.name} missing 'format' in schema"
            assert "quality" in props, f"{info.name} missing 'quality' in schema"
