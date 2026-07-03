"""Tests for the SRCSet distribution step.

Covers:
* :class:`SRCSetDistributionNode` — core distribution logic.
* :class:`SRCSetDistributionConfig` — schema validation.
* :class:`SRCSetDistributionStep` — step registration and execution.
"""

from __future__ import annotations

import sys

sys.path.insert(0, "..")

import io
import zipfile

import pytest
from PIL import Image
from pydantic import BaseModel, ValidationError

from base import DistributionNode
from srcset_distribution import (
    DEFAULT_SRCSET_WIDTHS,
    SRCSetDistributionConfig,
    SRCSetDistributionNode,
    SRCSetDistributionStep,
)
from step import StepVariant, _step_id_map


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def sample_image():
    return Image.new("RGB", (800, 600), color=(64, 128, 255))


@pytest.fixture
def sample_image_rgba():
    return Image.new("RGBA", (400, 300), color=(64, 128, 255, 128))


@pytest.fixture
def dist_node():
    return SRCSetDistributionNode()


@pytest.fixture
def default_config():
    return SRCSetDistributionConfig()


# ═══════════════════════════════════════════════════════════════════════════
# ── SRCSetDistributionConfig
# ═══════════════════════════════════════════════════════════════════════════


class TestSRCSetDistributionConfig:
    def test_default_config(self):
        config = SRCSetDistributionConfig()
        assert config.sizes == DEFAULT_SRCSET_WIDTHS
        assert config.quality == 85
        assert config.naming_convention == "width"

    def test_custom_sizes(self):
        config = SRCSetDistributionConfig(sizes=[400, 800, 1200])
        assert config.sizes == [400, 800, 1200]

    def test_custom_quality(self):
        config = SRCSetDistributionConfig(quality=75)
        assert config.quality == 75

    def test_naming_label(self):
        config = SRCSetDistributionConfig(naming_convention="label")
        assert config.naming_convention == "label"

    def test_invalid_naming_raises(self):
        with pytest.raises(ValidationError):
            SRCSetDistributionConfig(naming_convention="invalid")

    def test_quality_range(self):
        with pytest.raises(ValidationError):
            SRCSetDistributionConfig(quality=150)


# ═══════════════════════════════════════════════════════════════════════════
# ── SRCSetDistributionNode
# ═══════════════════════════════════════════════════════════════════════════


class TestSRCSetDistributionNode:
    def test_distribute_returns_dict(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, output_format="png")
        assert isinstance(result, dict)
        assert result["type"] == "srcset"
        assert result["output_suffix"] == "srcset"
        assert "artifacts" in result
        assert "zip_bytes" in result
        assert "html_srcset" in result
        assert "html_picture" in result

    def test_distribute_default_widths(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, output_format="png")
        assert len(result["artifacts"]) == len(DEFAULT_SRCSET_WIDTHS)
        widths = sorted(a["width"] for a in result["artifacts"])
        assert widths == sorted(DEFAULT_SRCSET_WIDTHS)

    def test_distribute_custom_widths(self, sample_image):
        node = SRCSetDistributionNode()
        config = SRCSetDistributionConfig(sizes=[400, 800, 1200])
        result = node.distribute(sample_image, output_format="jpeg", quality=80, config=config)
        assert len(result["artifacts"]) == 3
        widths = sorted(a["width"] for a in result["artifacts"])
        assert widths == [400, 800, 1200]

    def test_zip_contains_all_images(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, output_format="png")
        zip_bytes = result["zip_bytes"]
        assert isinstance(zip_bytes, bytes)
        assert len(zip_bytes) > 0

        # Extract and verify zip contents
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            # Check each expected image file
            for a in result["artifacts"]:
                assert a["filename"] in names, f"Missing {a['filename']} in zip"
            # Check for HTML and manifest
            assert "index.html" in names
            assert "manifest.json" in names

    def test_images_have_correct_sizes(self, dist_node, sample_image):
        """Verify that resized images have the expected widths."""
        config = SRCSetDistributionConfig(sizes=[200, 400])
        result = dist_node.distribute(sample_image, output_format="png", config=config)

        with zipfile.ZipFile(io.BytesIO(result["zip_bytes"])) as zf:
            for a in result["artifacts"]:
                data = zf.read(a["filename"])
                img = Image.open(io.BytesIO(data))
                assert img.width == a["width"], f"Width mismatch for {a['filename']}"
                # Aspect ratio preserved
                assert img.height == int(
                    600 * (a["width"] / 800)
                ), f"Height mismatch for {a['filename']}"

    def test_aspect_ratio_preserved(self, sample_image):
        node = SRCSetDistributionNode()
        config = SRCSetDistributionConfig(sizes=[400])
        result = node.distribute(sample_image, output_format="png", config=config)

        with zipfile.ZipFile(io.BytesIO(result["zip_bytes"])) as zf:
            data = zf.read(result["artifacts"][0]["filename"])
            img = Image.open(io.BytesIO(data))
            # Original: 800x600 = 4:3, resized to 400x300 = 4:3
            assert img.width == 400
            assert img.height == 300

    def test_html_srcset_generated(self, dist_node, sample_image):
        config = SRCSetDistributionConfig(sizes=[400, 800])
        result = dist_node.distribute(sample_image, output_format="jpeg", config=config)
        srcset = result["html_srcset"]
        assert "400w" in srcset
        assert "800w" in srcset
        assert ".jpg" in srcset or ".jpeg" in srcset

    def test_html_picture_generated(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, output_format="webp")
        html = result["html_picture"]
        assert "<picture>" in html
        assert "</picture>" in html
        assert "srcset" in html
        assert "source" in html

    def test_zip_contains_html_preview(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, output_format="png")
        with zipfile.ZipFile(io.BytesIO(result["zip_bytes"])) as zf:
            html = zf.read("index.html").decode("utf-8")
            assert "<!DOCTYPE html>" in html
            assert "SRCSet Preview" in html

    def test_zip_contains_manifest(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, output_format="png")
        with zipfile.ZipFile(io.BytesIO(result["zip_bytes"])) as zf:
            import json

            manifest = json.loads(zf.read("manifest.json"))
            assert manifest["type"] == "srcset"
            assert manifest["total_images"] == len(DEFAULT_SRCSET_WIDTHS)
            assert manifest["format"] == "png"

    def test_mime_type_in_result(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, output_format="png")
        assert result["mime_type"] == "application/zip"

    def test_format_resolution(self, dist_node, sample_image):
        """Test different output formats produce correct extensions."""
        for fmt, expected_ext in [
            ("png", ".png"),
            ("jpeg", ".jpg"),
            ("jpg", ".jpg"),
            ("webp", ".webp"),
            ("avif", ".avif"),
            ("ico", ".ico"),
        ]:
            result = dist_node.distribute(sample_image, output_format=fmt)
            assert result["format"] == fmt
            if result["artifacts"]:
                filename = result["artifacts"][0]["filename"]
                assert filename.endswith(expected_ext), f"Expected {expected_ext}, got {filename}"

    def test_rgba_image(self, dist_node, sample_image_rgba):
        """RGBA images should be handled without errors."""
        result = dist_node.distribute(sample_image_rgba, output_format="png")
        assert result["type"] == "srcset"
        assert len(result["artifacts"]) > 0

    def test_quality_passed_to_images(self, sample_image):
        """Ensure quality setting is used for lossy formats."""
        node = SRCSetDistributionNode()
        config = SRCSetDistributionConfig(sizes=[400], quality=50)
        result = node.distribute(sample_image, output_format="jpeg", quality=50, config=config)
        assert result["quality"] == 50

    def test_filename_convention_width(self, dist_node, sample_image):
        config = SRCSetDistributionConfig(sizes=[400, 800], naming_convention="width")
        result = dist_node.distribute(sample_image, output_format="png", config=config)
        filenames = [a["filename"] for a in result["artifacts"]]
        assert "image-400w.png" in filenames
        assert "image-800w.png" in filenames

    def test_filename_convention_label(self, dist_node, sample_image):
        config = SRCSetDistributionConfig(sizes=[400, 1280], naming_convention="label")
        result = dist_node.distribute(sample_image, output_format="png", config=config)
        filenames = [a["filename"] for a in result["artifacts"]]
        assert any("mobile" in f for f in filenames)
        assert any("laptop" in f for f in filenames)

    def test_deduplicates_widths(self, sample_image):
        """Duplicate widths should be removed."""
        node = SRCSetDistributionNode()
        config = SRCSetDistributionConfig(sizes=[400, 400, 800, 800])
        result = node.distribute(sample_image, output_format="png", config=config)
        assert len(result["artifacts"]) == 2


# ═══════════════════════════════════════════════════════════════════════════
# ── SRCSetDistributionStep
# ═══════════════════════════════════════════════════════════════════════════


class TestSRCSetDistributionStep:
    def test_step_registered(self):
        assert "srcset_dist" in _step_id_map

    def test_step_variant(self):
        step = SRCSetDistributionStep()
        assert step.variant == StepVariant.DISTRIBUTION
        assert step.id == "srcset_dist"
        assert step.name == "SRCSet Distribution"

    def test_step_config_schema(self):
        step = SRCSetDistributionStep()
        schema = step.config_schema.model_json_schema()
        assert "sizes" in schema.get("properties", {})
        assert "quality" in schema.get("properties", {})
        assert "naming_convention" in schema.get("properties", {})

    def test_step_execute_returns_dict(self, sample_image):
        step = SRCSetDistributionStep()
        result = step.execute(
            sample_image,
            config=SRCSetDistributionConfig(),
            output_format="png",
            quality=85,
        )
        assert isinstance(result, dict)
        assert result["type"] == "srcset"

    def test_step_default_format(self):
        step = SRCSetDistributionStep()
        # Distribution steps inherit the default "png"
        assert step.default_format == "png"

    def test_step_info(self):
        step = SRCSetDistributionStep()
        info = step.info()
        assert info.id == "srcset_dist"
        assert info.variant == StepVariant.DISTRIBUTION
        assert info.has_configurable_options is True

    def test_step_in_pipeline(self, sample_image):
        """Integration: SRCSetDistStep in a full pipeline."""
        from step import Pipeline, Step, StepVariant
        from base import OutputFormatter, Processor

        class _DummyProc(Processor):
            def process(self, image, instructions=None):
                return image

        class _DummyFmt(OutputFormatter):
            def format_output(self, image, output_format="png", quality=None):
                buf = io.BytesIO()
                image.save(buf, format="PNG")
                return buf.getvalue(), "image/png"

        proc = Step(
            component=_DummyProc(),
            variant=StepVariant.PROCESSOR,
            id="test_proc",
            name="Test Proc",
            description="",
            version="1.0.0",
            config_schema=BaseModel,
        )
        fmt = Step(
            component=_DummyFmt(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="test_fmt",
            name="Test Fmt",
            description="",
            version="1.0.0",
            config_schema=BaseModel,
        )
        dist = SRCSetDistributionStep()

        pipeline = Pipeline([proc, fmt, dist])
        result = pipeline.execute(sample_image)

        # Primary output
        assert result.output_bytes is not None
        assert result.content_type == "image/png"

        # Distribution output
        assert "srcset_dist" in result.distributions
        dist_result = result.distributions["srcset_dist"]
        assert dist_result["type"] == "srcset"
        assert len(dist_result["artifacts"]) > 0
        assert len(dist_result["zip_bytes"]) > 0


# ═══════════════════════════════════════════════════════════════════════════
# ── DistributionNode ABC conformance
# ═══════════════════════════════════════════════════════════════════════════


def test_srcset_implements_distribution_node():
    """SRCSetDistributionNode must be a proper DistributionNode."""
    node = SRCSetDistributionNode()
    assert isinstance(node, DistributionNode)


def test_srcset_distribution_info():
    """Verify step metadata is correct."""
    step = SRCSetDistributionStep()
    info = step.info()
    assert info.variant == StepVariant.DISTRIBUTION
    assert info.is_base_node is False
    assert info.id == "srcset_dist"
