"""Tests for the abstract base classes (Processor, OutputFormatter)."""

from __future__ import annotations

import sys
sys.path.insert(0, "..")

import pytest
from PIL import Image

from base import Processor, OutputFormatter


# ── Processor ──────────────────────────────────────────────────────────────


def test_processor_cannot_be_instantiated():
    with pytest.raises(TypeError, match="Can't instantiate abstract class"):
        Processor()  # type: ignore[abstract]


def test_processor_has_process_method():
    """Ensure the abstract method signature exists."""
    assert hasattr(Processor, "process")
    assert callable(Processor.process)


def test_processor_concrete_subclass_can_be_instantiated():
    """A minimal concrete subclass should work."""

    class MinimalProcessor(Processor):
        def process(self, image, instructions):
            return image

    instance = MinimalProcessor()
    img = Image.new("RGB", (10, 10))
    result = instance.process(img, None)
    assert result is img


# ── OutputFormatter ────────────────────────────────────────────────────────


def test_output_formatter_cannot_be_instantiated():
    with pytest.raises(TypeError, match="Can't instantiate abstract class"):
        OutputFormatter()  # type: ignore[abstract]


def test_output_formatter_has_format_output_method():
    assert hasattr(OutputFormatter, "format_output")
    assert callable(OutputFormatter.format_output)


def test_output_formatter_concrete_subclass():
    """A minimal concrete subclass should work."""

    class MinimalFormatter(OutputFormatter):
        def format_output(self, image, output_format, quality=None):
            return b"fake-data", "image/png"

    instance = MinimalFormatter()
    img = Image.new("RGB", (10, 10))
    data, ctype = instance.format_output(img, "png")
    assert data == b"fake-data"
    assert ctype == "image/png"
