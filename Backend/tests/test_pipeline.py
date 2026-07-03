"""Tests for the Pipeline class and pipeline_from_steps factory."""

from __future__ import annotations

import sys

sys.path.insert(0, "..")

import pytest
from PIL import Image
from pydantic import BaseModel

from base import OutputFormatter, Processor
from step import (
    Pipeline,
    PipelineResult,
    Step,
    StepInfo,
    StepVariant,
    _step_id_map,
    pipeline_from_steps,
    register,
)

# Import steps_config to trigger @register decorators so that the real
# steps (img_proc, img_fmt, etc.) are present in _step_id_map.
import steps_config  # noqa: F401


# ── Test helpers ------------------------------------------------------------

class _DummyConfig(BaseModel):
    value: int = 42


class _PassthroughProcessor(Processor):
    """Processor that returns the image unchanged."""

    def process(self, image, instructions=None):
        return image


class _TransformProcessor(Processor):
    """Processor that applies config.value as a mark."""

    def process(self, image, instructions=None):
        if instructions is not None:
            image.info["processed_by"] = str(instructions.value)
        return image


class _DummyFormatter(OutputFormatter):
    def format_output(self, image, output_format="png", quality=None):
        return b"pipeline-result", "image/png"


class _ConfigDrivenFormatter(OutputFormatter):
    def format_output(self, image, output_format="png", quality=None):
        return (
            f"format={output_format},quality={quality}".encode(),
            f"image/{output_format}",
        )


# ── Fixtures ----------------------------------------------------------------


@pytest.fixture
def sample_image():
    return Image.new("RGB", (20, 20), color=(0, 128, 255))


@pytest.fixture
def proc_step() -> Step:
    return Step(
        component=_PassthroughProcessor(),
        variant=StepVariant.PROCESSOR,
        id="proc1",
        name="processor-1",
        description="Test processor",
        version="1.0.0",
        config_schema=_DummyConfig,
    )


@pytest.fixture
def proc_step_b() -> Step:
    """A second processor, distinct from proc_step."""
    return Step(
        component=_TransformProcessor(),
        variant=StepVariant.PROCESSOR,
        id="proc2",
        name="processor-2",
        description="Second test processor",
        version="1.0.0",
        config_schema=_DummyConfig,
    )


@pytest.fixture
def fmt_step() -> Step:
    return Step(
        component=_DummyFormatter(),
        variant=StepVariant.OUTPUT_FORMATTER,
        id="fmt1",
        name="formatter-1",
        description="Test formatter",
        version="1.0.0",
        config_schema=_DummyConfig,
    )


@pytest.fixture
def fmt_step_b() -> Step:
    return Step(
        component=_ConfigDrivenFormatter(),
        variant=StepVariant.OUTPUT_FORMATTER,
        id="fmt2",
        name="formatter-2",
        description="Config-driven formatter",
        version="1.0.0",
        config_schema=_DummyConfig,
    )


# ═══════════════════════════════════════════════════════════════════════════
# ── Pipeline — construction validation
# ═══════════════════════════════════════════════════════════════════════════


class TestPipelineConstruction:
    def test_valid_single_processor_and_formatter(self, proc_step, fmt_step):
        pipeline = Pipeline([proc_step, fmt_step])
        assert pipeline.step_count == 2
        assert pipeline.processor_count == 1

    def test_valid_multiple_processors(self, proc_step, proc_step_b, fmt_step):
        pipeline = Pipeline([proc_step, proc_step_b, fmt_step])
        assert pipeline.step_count == 3
        assert pipeline.processor_count == 2

    def test_valid_three_processors(self, proc_step, proc_step_b, fmt_step):
        """Three processors + one formatter."""
        third_proc = Step(
            component=_PassthroughProcessor(),
            variant=StepVariant.PROCESSOR,
            id="proc3",
            name="processor-3",
            description="Third",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        pipeline = Pipeline([proc_step, proc_step_b, third_proc, fmt_step])
        assert pipeline.step_count == 4
        assert pipeline.processor_count == 3

    def test_empty_steps_raises(self):
        with pytest.raises(ValueError, match="at least one step"):
            Pipeline([])

    def test_no_processor_raises(self, fmt_step):
        with pytest.raises(ValueError, match="at least one Processor"):
            Pipeline([fmt_step])

    def test_no_formatter_raises(self, proc_step):
        with pytest.raises(ValueError, match="exactly one OutputFormatter"):
            Pipeline([proc_step])

    def test_multiple_formatters_raises(self, proc_step, fmt_step, fmt_step_b):
        """Two formatters — detects the second one as duplicate."""
        with pytest.raises(ValueError, match="cannot have more than one OutputFormatter"):
            Pipeline([proc_step, fmt_step, fmt_step_b])

    def test_formatter_not_last_raises(self, proc_step, fmt_step, proc_step_b):
        """Formatter in the middle should be rejected."""
        with pytest.raises(ValueError, match="cannot appear after the output formatter"):
            Pipeline([proc_step, fmt_step, proc_step_b])

    def test_formatter_first_raises(self, fmt_step, proc_step):
        with pytest.raises(ValueError, match="cannot appear after the output formatter"):
            Pipeline([fmt_step, proc_step])

    def test_steps_property_returns_copy(self, proc_step, fmt_step):
        pipeline = Pipeline([proc_step, fmt_step])
        steps_copy = pipeline.steps
        steps_copy.append(
            Step(
                component=_PassthroughProcessor(),
                variant=StepVariant.PROCESSOR,
                id="extra",
                name="extra",
                description="extra",
                version="0.0.1",
                config_schema=_DummyConfig,
            )
        )
        # Original should not grow
        assert pipeline.step_count == 2


# ═══════════════════════════════════════════════════════════════════════════
# ── Pipeline — execute
# ═══════════════════════════════════════════════════════════════════════════


class TestPipelineExecute:
    def test_basic_execute_returns_pipeline_result(self, proc_step, fmt_step, sample_image):
        pipeline = Pipeline([proc_step, fmt_step])
        result = pipeline.execute(sample_image)
        assert isinstance(result, PipelineResult)
        # Supports tuple unpacking
        data, ctype = result
        assert isinstance(data, bytes)
        assert ctype == "image/png"
        # Named attributes
        assert result.output_bytes == data
        assert result.content_type == ctype
        # No distributions for a plain pipeline
        assert result.distributions == {}

    def test_execute_with_multiple_processors(
        self, proc_step, proc_step_b, fmt_step, sample_image
    ):
        pipeline = Pipeline([proc_step, proc_step_b, fmt_step])
        data, ctype = pipeline.execute(sample_image)
        assert data == b"pipeline-result"

    def test_execute_with_configs(self, proc_step, fmt_step_b, sample_image):
        """Configs are looked up by step ID."""
        pipeline = Pipeline([proc_step, fmt_step_b])
        data, ctype = pipeline.execute(
            sample_image,
            configs={
                "fmt2": _DummyConfig(value=99),
            },
        )
        assert ctype == "image/png"

    def test_execute_config_passed_to_formatter(self, fmt_step_b, sample_image):
        """Formatter should receive format/quality from config object."""
        proc = Step(
            component=_PassthroughProcessor(),
            variant=StepVariant.PROCESSOR,
            id="p",
            name="p",
            description="p",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        pipeline = Pipeline([proc, fmt_step_b])

        class _FmtConfig(BaseModel):
            format: str = "webp"
            quality: int | None = 80

        data, ctype = pipeline.execute(
            sample_image,
            configs={"fmt2": _FmtConfig(format="webp", quality=80)},
        )
        # _ConfigDrivenFormatter encodes format and quality in the data
        assert b"format=webp" in data
        assert b"quality=80" in data

    def test_execute_without_config(self, fmt_step, sample_image):
        """No configs dict means steps get None config."""
        proc = Step(
            component=_PassthroughProcessor(),
            variant=StepVariant.PROCESSOR,
            id="p",
            name="p",
            description="p",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        pipeline = Pipeline([proc, fmt_step])
        data, ctype = pipeline.execute(sample_image)
        assert data == b"pipeline-result"

    def test_execute_preserves_step_order(self, sample_image):
        """Verify processors run in the given order."""
        call_order: list[str] = []

        class _TrackingProcessor(Processor):
            def __init__(self, mark: str):
                self.mark = mark

            def process(self, image, instructions=None):
                call_order.append(self.mark)
                return image

        p1 = Step(
            component=_TrackingProcessor("A"),
            variant=StepVariant.PROCESSOR,
            id="pa",
            name="A",
            description="A",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        p2 = Step(
            component=_TrackingProcessor("B"),
            variant=StepVariant.PROCESSOR,
            id="pb",
            name="B",
            description="B",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        f = Step(
            component=_DummyFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="f",
            name="F",
            description="F",
            version="1.0.0",
            config_schema=_DummyConfig,
        )

        Pipeline([p1, p2, f]).execute(sample_image)
        assert call_order == ["A", "B"]


# ═══════════════════════════════════════════════════════════════════════════
# ── Distribution pipeline — construction validation
# ═══════════════════════════════════════════════════════════════════════════


class TestDistributionPipelineConstruction:
    def test_valid_processor_formatter_distribution(self, proc_step, fmt_step, sample_image):
        dist = Step(
            component=_DummyDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="dist1",
            name="dist-1",
            description="Test distribution",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        pipeline = Pipeline([proc_step, fmt_step, dist])
        assert pipeline.step_count == 3
        assert pipeline.has_distribution is True
        assert len(pipeline.distribution_steps) == 1

    def test_valid_multiple_distributions(self, proc_step, fmt_step, sample_image):
        dist_a = Step(
            component=_DummyDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="dist_a",
            name="dist-a",
            description="Dist A",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        dist_b = Step(
            component=_DummyDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="dist_b",
            name="dist-b",
            description="Dist B",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        pipeline = Pipeline([proc_step, fmt_step, dist_a, dist_b])
        assert pipeline.step_count == 4
        assert pipeline.has_distribution is True
        assert len(pipeline.distribution_steps) == 2

    def test_distribution_without_formatter_raises(self, proc_step, sample_image):
        dist = Step(
            component=_DummyDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="dist1",
            name="dist-1",
            description="Test distribution",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        with pytest.raises(ValueError, match="must appear after the output formatter"):
            Pipeline([proc_step, dist])

    def test_distribution_before_formatter_raises(self, proc_step, fmt_step, sample_image):
        dist = Step(
            component=_DummyDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="dist1",
            name="dist-1",
            description="Test distribution",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        with pytest.raises(ValueError, match="must appear after the output formatter"):
            Pipeline([proc_step, dist, fmt_step])

    def test_processor_after_formatter_raises(self, proc_step, fmt_step, sample_image):
        with pytest.raises(ValueError, match="cannot appear after the output formatter"):
            Pipeline([proc_step, fmt_step, proc_step])

    def test_distribution_without_processor_raises(self, fmt_step, sample_image):
        dist = Step(
            component=_DummyDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="dist1",
            name="dist-1",
            description="Test distribution",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        with pytest.raises(ValueError, match="at least one Processor"):
            Pipeline([fmt_step, dist])


# ═══════════════════════════════════════════════════════════════════════════
# ── Distribution pipeline — execute
# ═══════════════════════════════════════════════════════════════════════════


class TestDistributionPipelineExecute:
    def test_execute_with_distribution(self, proc_step, fmt_step, sample_image):
        dist_node = _DummyDistributionNode()
        dist = Step(
            component=dist_node,
            variant=StepVariant.DISTRIBUTION,
            id="dist1",
            name="dist-1",
            description="Test distribution",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        pipeline = Pipeline([proc_step, fmt_step, dist])
        result = pipeline.execute(sample_image)

        # Primary output still works
        data, ctype = result
        assert isinstance(data, bytes)
        assert ctype == "image/png"

        # Distribution artifacts present
        assert "dist1" in result.distributions
        dist_artifacts = result.distributions["dist1"]
        assert dist_artifacts["type"] == "test_dist"

        # Distribution node was called with correct args
        assert dist_node.call_count == 1
        assert dist_node.last_format == "png"

    def test_execute_with_multiple_distributions(self, proc_step, fmt_step, sample_image):
        dist_a = Step(
            component=_DummyDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="dist_a",
            name="dist-a",
            description="Dist A",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        dist_b = Step(
            component=_RecordingDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="dist_b",
            name="dist-b",
            description="Dist B",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        pipeline = Pipeline([proc_step, fmt_step, dist_a, dist_b])
        result = pipeline.execute(sample_image)

        assert "dist_a" in result.distributions
        assert "dist_b" in result.distributions
        assert result.distributions["dist_a"]["type"] == "test_dist"
        assert result.distributions["dist_b"]["type"] == "empty"

    def test_distribution_passes_format_and_quality(self, proc_step, fmt_step, sample_image):
        dist_node = _DummyDistributionNode()
        dist = Step(
            component=dist_node,
            variant=StepVariant.DISTRIBUTION,
            id="dist1",
            name="dist-1",
            description="Test distribution",
            version="1.0.0",
            config_schema=_DummyConfig,
        )

        class _FmtConfig(BaseModel):
            format: str = "webp"
            quality: int | None = 90

        pipeline = Pipeline([proc_step, fmt_step, dist])
        result = pipeline.execute(
            sample_image,
            configs={"fmt1": _FmtConfig(format="webp", quality=90)},
        )

        # Distribution should receive the format/quality from the formatter
        assert dist_node.last_format == "webp"
        assert dist_node.last_quality == 90

    def test_pipeline_result_tuple_unpacking(self, proc_step, fmt_step, sample_image):
        dist = Step(
            component=_DummyDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="dist1",
            name="dist-1",
            description="Test distribution",
            version="1.0.0",
            config_schema=_DummyConfig,
        )
        pipeline = Pipeline([proc_step, fmt_step, dist])
        result = pipeline.execute(sample_image)

        # Named attributes
        assert result.output_bytes is not None
        assert result.content_type == "image/png"
        assert "dist1" in result.distributions

        # Index access
        assert result[0] == result.output_bytes
        assert result[1] == result.content_type

        # __repr__
        assert "PipelineResult" in repr(result)
        assert "dist1" in repr(result)


# ═══════════════════════════════════════════════════════════════════════════
# ── Pipeline — properties
# ═══════════════════════════════════════════════════════════════════════════


class TestPipelineProperties:
    def test_formatter_property(self, proc_step, fmt_step):
        pipeline = Pipeline([proc_step, fmt_step])
        assert pipeline.formatter is fmt_step

    def test_formatter_property_returns_formatter(self, proc_step, fmt_step):
        pipeline = Pipeline([proc_step, fmt_step])
        assert pipeline.formatter is fmt_step

    def test_repr(self, proc_step, fmt_step):
        pipeline = Pipeline([proc_step, fmt_step])
        r = repr(pipeline)
        assert "proc1" in r
        assert "fmt1" in r
        assert "Pipeline(" in r


# ═══════════════════════════════════════════════════════════════════════════
# ── pipeline_from_steps
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture(autouse=True)
def _register_test_steps():
    """Register minimal steps in _step_id_map for factory tests."""

    class _RegConfig(BaseModel):
        val: int = 0

    if "test_proc_a" not in _step_id_map:

        @register(id="test_proc_a", name="proc-a", description="A", version="1.0.0")
        class _ProcA(Step[_RegConfig]):
            def __init__(self):
                super().__init__(
                    component=_PassthroughProcessor(),
                    variant=StepVariant.PROCESSOR,
                    id="test_proc_a",
                    name="proc-a",
                    description="A",
                    version="1.0.0",
                    config_schema=_RegConfig,
                )

    if "test_proc_b" not in _step_id_map:

        @register(id="test_proc_b", name="proc-b", description="B", version="1.0.0")
        class _ProcB(Step[_RegConfig]):
            def __init__(self):
                super().__init__(
                    component=_PassthroughProcessor(),
                    variant=StepVariant.PROCESSOR,
                    id="test_proc_b",
                    name="proc-b",
                    description="B",
                    version="1.0.0",
                    config_schema=_RegConfig,
                )

    if "test_fmt" not in _step_id_map:

        @register(id="test_fmt", name="fmt", description="F", version="1.0.0")
        class _Fmt(Step[_RegConfig]):
            def __init__(self):
                super().__init__(
                    component=_DummyFormatter(),
                    variant=StepVariant.OUTPUT_FORMATTER,
                    id="test_fmt",
                    name="fmt",
                    description="F",
                    version="1.0.0",
                    config_schema=_RegConfig,
                )

    yield
    # Cleanup test registrations
    for key in list(_step_id_map):
        if key.startswith("test_"):
            del _step_id_map[key]
    for key in list(step._registry.keys()):
        if key.startswith("proc-") or key == "fmt":
            del step._registry[key]


# ── Test helpers for distribution tests ──────────────────────────────────────


class _DummyDistributionNode:
    """A minimal distribution node that records calls and returns fixed data."""

    def __init__(self) -> None:
        self.call_count = 0
        self.last_image = None
        self.last_format = None
        self.last_quality = None
        self.last_config = None

    def distribute(self, image, output_format="png", quality=None, config=None):
        self.call_count += 1
        self.last_image = image
        self.last_format = output_format
        self.last_quality = quality
        self.last_config = config
        return {
            "type": "test_dist",
            "artifacts": [{"name": "test.txt", "data": b"hello"}],
            "zip_bytes": b"fake-zip-content",
            "html_srcset": "test-400w.jpg 400w",
            "html_picture": "<picture>...</picture>",
        }


class _RecordingDistributionNode:
    """Records calls but returns empty distribution."""

    def distribute(self, image, output_format="png", quality=None, config=None):
        return {
            "type": "empty",
            "artifacts": [],
            "zip_bytes": b"",
        }


import step as step  # noqa: E402 — needed for registry cleanup in fixture


class TestPipelineFromSteps:
    def test_basic_pipeline_from_ids(self):
        pipeline = pipeline_from_steps(["test_proc_a", "test_fmt"])
        assert isinstance(pipeline, Pipeline)
        assert pipeline.step_count == 2
        assert pipeline.processor_count == 1

    def test_multiple_processors(self):
        pipeline = pipeline_from_steps(["test_proc_a", "test_proc_b", "test_fmt"])
        assert pipeline.step_count == 3
        assert pipeline.processor_count == 2

    def test_unknown_id_raises(self):
        with pytest.raises(ValueError, match="Unknown step ID"):
            pipeline_from_steps(["test_proc_a", "nonexistent_id", "test_fmt"])

    def test_unknown_id_shows_available(self):
        with pytest.raises(ValueError, match="Available IDs"):
            pipeline_from_steps(["unknown"])

    def test_pipeline_validation_also_runs(self):
        """Factory should also enforce Pipeline validation."""
        with pytest.raises(ValueError, match="exactly one OutputFormatter"):
            pipeline_from_steps(["test_proc_a", "test_proc_b"])

    def test_execute_via_factory(self, sample_image):
        pipeline = pipeline_from_steps(["test_proc_a", "test_fmt"])
        data, ctype = pipeline.execute(sample_image)
        assert data == b"pipeline-result"

    def test_factory_with_configs(self, sample_image):
        pipeline = pipeline_from_steps(["test_proc_a", "test_fmt"])
        data, ctype = pipeline.execute(sample_image, configs={"test_fmt": _DummyConfig()})
        assert ctype == "image/png"


# ═══════════════════════════════════════════════════════════════════════════
# ── Integration — concrete steps
# ═══════════════════════════════════════════════════════════════════════════


class TestRealStepPipeline:
    """Use the real registered steps."""

    def test_real_pipeline_avif_when_available(self, sample_image):
        """If AVIF is available, test the AVIF pipeline."""
        from step import _step_id_map

        if "avif_fmt" in _step_id_map:
            # Use a test processor that was registered by the fixture
            pipeline = pipeline_from_steps(["test_proc_a", "avif_fmt"])
            data, ctype = pipeline.execute(sample_image)
            assert ctype == "image/avif"
        else:
            pytest.skip("AVIF formatter not available")
