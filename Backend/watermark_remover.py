"""Watermark remover — concrete :class:`base.Processor` implementation.

Uses the ``remove-ai-watermarks`` library (``GeminiEngine``) to detect
and remove visible Gemini / Nano Banana watermarks from images via
reverse-alpha blending.

The processor handles the Pillow → OpenCV → Pillow conversion
transparently.
"""

from __future__ import annotations

import logging

import numpy as np
from PIL import Image

from base import Processor
from models import ProcessingInstructions

logger = logging.getLogger(__name__)


# ── Image format conversion helpers ───────────────────────────────────────


def _pil_to_cv(image: Image.Image) -> np.ndarray:
    """Convert a Pillow ``Image`` to an OpenCV BGR numpy array.

    * RGB images → RGB array (OpenCV expects BGR, but
      ``GeminiEngine`` works with RGB data).
    * RGBA images → RGB (alpha channel is dropped).
    * Grayscale (mode ``L``) → stacked to 3-channel.
    """
    if image.mode == "RGBA":
        image = image.convert("RGB")
    elif image.mode == "L":
        image = image.convert("RGB")

    return np.array(image, dtype=np.uint8)


def _cv_to_pil(array: np.ndarray) -> Image.Image:
    """Convert an OpenCV numpy array back to a Pillow ``Image`` (RGB)."""
    return Image.fromarray(array, mode="RGB")


# ── Concrete implementation ───────────────────────────────────────────────


class WatermarkRemoverProcessor(Processor):
    """Removes visible Gemini / Nano Banana watermarks using reverse-alpha blending.

    Wraps ``GeminiEngine`` from the ``remove-ai-watermarks`` package,
    which implements the mathematically exact Reverse Alpha Blending
    algorithm::

        original = (watermarked - α · logo) / (1 - α)

    Detection is automatic (NCC-based watermark locator). If no watermark
    is found the image is returned unchanged.
    """

    def __init__(self, engine=None):
        """Create a new ``WatermarkRemoverProcessor``.

        Parameters
        ----------
        engine : GeminiEngine | None
            An optional pre-configured ``GeminiEngine`` instance.
            If ``None``, a default engine is created.
        """
        if engine is not None:
            self._engine = engine
        else:
            from remove_ai_watermarks.gemini_engine import GeminiEngine

            self._engine = GeminiEngine()

    # ── Processor interface ──────────────────────────────────────────

    def process(
        self,
        image: Image.Image,
        instructions: ProcessingInstructions,
    ) -> Image.Image:
        """Detect and remove watermarks from *image*.

        The *instructions* parameter is accepted for interface
        compatibility but **not used** — watermark removal is always
        applied when this processor is invoked.

        Parameters
        ----------
        image : Image.Image
            Source image (not mutated).
        instructions : ProcessingInstructions
            Ignored by this processor.

        Returns
        -------
        Image.Image
            A new image with visible watermarks removed (or a copy of
            the original if none were detected).
        """
        # ── Convert Pillow → OpenCV (numpy) ──────────────────────────
        cv_image = _pil_to_cv(image)

        # ── Detect watermark ─────────────────────────────────────────
        try:
            result = self._engine.detect_watermark(cv_image)
        except Exception:
            logger.exception("Watermark detection failed; returning original image")
            return image.copy()

        if not result.detected:
            logger.info(
                "No watermark detected (confidence: %.1f%%); returning original",
                result.confidence * 100,
            )
            return image.copy()

        logger.info(
            "Watermark detected (confidence: %.1f%%); removing…",
            result.confidence * 100,
        )

        # ── Remove watermark ─────────────────────────────────────────
        try:
            cleaned = self._engine.remove_watermark(cv_image)
        except Exception:
            logger.exception("Watermark removal failed; returning original image")
            return image.copy()

        # ── Convert back: OpenCV → Pillow ────────────────────────────
        return _cv_to_pil(cleaned)
