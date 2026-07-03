"""Tests for the Favicon Distribution step (favicon_distribution.py).

Covers:
* :class:`FaviconDistributionConfig` — schema defaults, validation.
* :class:`FaviconDistributionNode` — core distribution logic.
* :class:`FaviconDistributionStep` — registration, pipeline integration.
"""

from __future__ import annotations

import io
import json
import sys
import zipfile

sys.path.insert(0, "..")

import pytest
from PIL import Image

from favicon_distribution import (
    DEFAULT_FAVICON_SIZES,
    FaviconDistributionConfig,
    FaviconDistributionNode,
    FaviconDistributionStep,
)
from step import StepVariant, _step_id_map


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def sample_image():
    return Image.new("RGBA", (512, 512), color=(64, 128, 255, 255))


@pytest.fixture
def sample_image_non_square():
    return Image.new("RGBA", (800, 600), color=(200, 100, 50, 255))


@pytest.fixture
def dist_node():
    return FaviconDistributionNode()


@pytest.fixture
def default_config():
    return FaviconDistributionConfig()


# ═══════════════════════════════════════════════════════════════════════════
# ── FaviconDistributionConfig
# ═══════════════════════════════════════════════════════════════════════════


class TestFaviconDistributionConfig:
    def test_default_config(self):
        config = FaviconDistributionConfig()
        assert config.sizes == DEFAULT_FAVICON_SIZES
        assert config.naming_convention == "size"

    def test_custom_sizes(self):
        config = FaviconDistributionConfig(sizes=[32, 64, 128])
        assert config.sizes == [32, 64, 128]

    def test_naming_label(self):
        config = FaviconDistributionConfig(naming_convention="label")
        assert config.naming_convention == "label"

    def test_json_schema_has_properties(self):
        schema = FaviconDistributionConfig.model_json_schema()
        props = schema["properties"]
        assert "sizes" in props
        assert "naming_convention" in props


# ═══════════════════════════════════════════════════════════════════════════
# ── FaviconDistributionNode
# ═══════════════════════════════════════════════════════════════════════════


class TestFaviconDistributionNode:
    def test_distribute_returns_dict(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, "png")
        assert isinstance(result, dict)
        assert result["type"] == "favicon"
        assert result["mime_type"] == "application/zip"

    def test_default_sizes_generated(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, "png")
        assert len(result["artifacts"]) == len(DEFAULT_FAVICON_SIZES)
        generated_sizes = {a["size"] for a in result["artifacts"]}
        assert generated_sizes == set(DEFAULT_FAVICON_SIZES)

    def test_custom_sizes(self, dist_node, sample_image):
        config = FaviconDistributionConfig(sizes=[32, 64])
        result = dist_node.distribute(sample_image, "png", config=config)
        assert len(result["artifacts"]) == 2
        assert result["artifacts"][0]["size"] == 32
        assert result["artifacts"][1]["size"] == 64

    def test_zip_contains_all_icons(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, "png")
        zip_bytes = result["zip_bytes"]
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            for a in result["artifacts"]:
                assert a["filename"] in names, f"Missing {a['filename']} in zip"

    def test_images_have_correct_sizes(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, "png")
        zip_bytes = result["zip_bytes"]
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for a in result["artifacts"]:
                with zf.open(a["filename"]) as f:
                    img = Image.open(io.BytesIO(f.read()))
                    assert img.size == (
                        a["size"],
                        a["size"],
                    ), f"Icon {a['size']}x{a['size']} has wrong size {img.size}"

    def test_aspect_ratio_preserved(self, dist_node, sample_image_non_square):
        """Non-square images should be centre-cropped to square."""
        config = FaviconDistributionConfig(sizes=[64])
        result = dist_node.distribute(
            sample_image_non_square, "png", config=config
        )
        zip_bytes = result["zip_bytes"]
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            with zf.open(result["artifacts"][0]["filename"]) as f:
                img = Image.open(io.BytesIO(f.read()))
                assert img.size == (64, 64)

    def test_rgba_preserved(self, dist_node, sample_image):
        """Favicons should always be RGBA."""
        config = FaviconDistributionConfig(sizes=[32])
        result = dist_node.distribute(sample_image, "png", config=config)
        zip_bytes = result["zip_bytes"]
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            with zf.open(result["artifacts"][0]["filename"]) as f:
                img = Image.open(io.BytesIO(f.read()))
                assert img.mode == "RGBA"

    def test_rgb_converted_to_rgba(self, dist_node):
        """RGB input images should be converted to RGBA."""
        rgb_img = Image.new("RGB", (100, 100), color=(255, 0, 0))
        config = FaviconDistributionConfig(sizes=[32])
        result = dist_node.distribute(rgb_img, "png", config=config)
        zip_bytes = result["zip_bytes"]
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            with zf.open(result["artifacts"][0]["filename"]) as f:
                img = Image.open(io.BytesIO(f.read()))
                assert img.mode == "RGBA"

    def test_zip_contains_html_preview(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, "png")
        with zipfile.ZipFile(io.BytesIO(result["zip_bytes"])) as zf:
            assert "index.html" in zf.namelist()
            content = zf.read("index.html").decode("utf-8")
            assert "<!DOCTYPE html>" in content
            assert "Favicon Preview" in content

    def test_zip_contains_webmanifest(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, "png")
        with zipfile.ZipFile(io.BytesIO(result["zip_bytes"])) as zf:
            assert "site.webmanifest" in zf.namelist()
            manifest = json.loads(zf.read("site.webmanifest"))
            assert manifest["display"] == "standalone"
            assert len(manifest["icons"]) > 0

    def test_html_links_generated(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, "png")
        html_links = result["html_links"]
        assert 'rel="icon"' in html_links
        assert 'rel="apple-touch-icon"' in html_links
        assert 'rel="manifest"' in html_links

    def test_deduplicates_sizes(self, dist_node, sample_image):
        """Duplicate sizes should be deduplicated."""
        config = FaviconDistributionConfig(sizes=[32, 32, 64, 64, 64])
        result = dist_node.distribute(sample_image, "png", config=config)
        assert len(result["artifacts"]) == 2

    def test_filename_convention_size(self, dist_node, sample_image):
        config = FaviconDistributionConfig(
            sizes=[32, 64], naming_convention="size"
        )
        result = dist_node.distribute(sample_image, "png", config=config)
        filenames = [a["filename"] for a in result["artifacts"]]
        assert "favicon-32x32.png" in filenames
        assert "favicon-64x64.png" in filenames

    def test_filename_convention_label(self, dist_node, sample_image):
        config = FaviconDistributionConfig(
            sizes=[16, 32, 180], naming_convention="label"
        )
        result = dist_node.distribute(sample_image, "png", config=config)
        filenames = [a["filename"] for a in result["artifacts"]]
        assert "favicon.ico" in filenames  # size 16 → .ico
        assert "favicon-32.png" in filenames
        assert "apple-touch-icon.png" in filenames  # size 180

    def test_mime_type_in_result(self, dist_node, sample_image):
        result = dist_node.distribute(sample_image, "png")
        assert result["mime_type"] == "application/zip"

    def test_webmanifest_only_png_icons(self, dist_node, sample_image):
        """site.webmanifest should only include PNG icons (not .ico)."""
        config = FaviconDistributionConfig(
            sizes=[16, 32], naming_convention="size"
        )
        result = dist_node.distribute(sample_image, "png", config=config)
        manifest = json.loads(result["webmanifest"])
        for icon in manifest["icons"]:
            assert icon["type"] == "image/png"


# ═══════════════════════════════════════════════════════════════════════════
# ── FaviconDistributionStep
# ═══════════════════════════════════════════════════════════════════════════


class TestFaviconDistributionStep:
    def test_step_registered(self):
        assert "favicon_dist" in _step_id_map
        assert _step_id_map["favicon_dist"] is FaviconDistributionStep

    def test_step_variant(self):
        step = FaviconDistributionStep()
        assert step.variant == StepVariant.DISTRIBUTION

    def test_step_config_schema(self):
        step = FaviconDistributionStep()
        assert step.config_schema is FaviconDistributionConfig

    def test_step_execute_returns_dict(self, sample_image):
        step = FaviconDistributionStep()
        result = step.execute(sample_image)
        assert isinstance(result, dict)
        assert result["type"] == "favicon"

    def test_step_default_format(self):
        step = FaviconDistributionStep()
        assert step.default_format == "png"

    def test_step_info(self):
        from step import get_registered_steps

        infos = get_registered_steps()
        fav = [i for i in infos if i.id == "favicon_dist"]
        assert len(fav) == 1
        info = fav[0]
        assert info.name == "Favicon Distribution"
        assert info.variant == StepVariant.DISTRIBUTION
        assert info.version == "1.0.0"

    def test_step_in_pipeline(self, sample_image):
        """Favicon distribution in a full pipeline should work."""
        from base import OutputFormatter, Processor
        from pydantic import BaseModel
        from step import Pipeline, Step, StepVariant

        class _EmptyConfig(BaseModel):
            pass

        class _IdentityProcessor(Processor):
            def process(self, image, instructions=None):
                return image.copy()

        class _DummyFormatter(OutputFormatter):
            def format_output(self, image, output_format="png", quality=None):
                return b"dummy", "image/png"

        proc_step = Step(
            component=_IdentityProcessor(),
            variant=StepVariant.PROCESSOR,
            id="identity",
            name="Identity",
            description="Pass-through",
            version="1.0.0",
            config_schema=_EmptyConfig,
        )
        fmt_step = Step(
            component=_DummyFormatter(),
            variant=StepVariant.OUTPUT_FORMATTER,
            id="dummy_fmt",
            name="Dummy",
            description="Dummy",
            version="1.0.0",
            config_schema=_EmptyConfig,
        )
        dist_step = FaviconDistributionStep()

        pipeline = Pipeline([proc_step, fmt_step, dist_step])
        result = pipeline.execute(sample_image)

        assert result.distributions["favicon_dist"]["type"] == "favicon"
        assert result.distributions["favicon_dist"]["total_icons"] == len(
            DEFAULT_FAVICON_SIZES
        )
