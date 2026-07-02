"""Background removal processor using BRIA RMBG-1.4 from HuggingFace.

:class:`BackgroundRemovalProcessor` wraps the BRIA RMBG-1.4 saliency
segmentation model to separate foreground from background in an image.
The model is loaded lazily (on first use) via HuggingFace ``transformers``
and kept in RAM for reuse across multiple calls.

The processor returns an RGBA image with the background made transparent
(pixels with alpha = 0).  This output can be fed directly into downstream
pipeline steps or an output formatter.

Usage
-----
::

    from bg_removal import BackgroundRemovalProcessor

    processor = BackgroundRemovalProcessor(model_input_size=1024)
    rgba_image = processor.process(pil_image, instructions=None)

Dependencies
------------
* ``transformers`` (HuggingFace)
* ``torch`` (PyTorch)
* ``torchvision``
* :mod:`PIL` (Pillow)
* ``numpy``
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
from PIL import Image

from base import Processor
from models import ProcessingInstructions

logger = logging.getLogger(__name__)


# ── Image format conversion helpers ──────────────────────────────────────────


def _pil_to_ndarray(image: Image.Image) -> np.ndarray:
    """Convert a Pillow ``Image`` to an ``np.ndarray`` in RGB order.

    * RGBA images → RGB (alpha is dropped).
    * Grayscale (``L``) → RGB (channel is stacked).
    * Palette (``P``) → RGB (palette is resolved).
    """
    if image.mode == "RGBA":
        image = image.convert("RGB")
    elif image.mode == "P":
        image = image.convert("RGBA").convert("RGB")
    elif image.mode != "RGB":
        image = image.convert("RGB")

    return np.array(image, dtype=np.uint8)


# ── Concrete implementation ──────────────────────────────────────────────────


class BackgroundRemovalProcessor(Processor):
    """Removes the background from an image using BRIA RMBG-1.4.

    The model is loaded on the **first** call to :meth:`process` (lazy
    initialisation) and stays resident for subsequent calls.  Device
    auto-detection: CUDA if available, otherwise CPU.

    Parameters
    ----------
    model_input_size : int
        The input resolution (width = height) the model expects.
        Must be a multiple of 32; 1024 is the default recommended by
        the model card.  Larger values may improve accuracy on high-res
        images at the cost of VRAM/RAM.
    """

    _HF_REPO_ID = "briaai/RMBG-1.4"
    """HuggingFace repository ID for the BRIA RMBG-1.4 model."""

    def __init__(self, model_input_size: int = 1024) -> None:
        self._model_input_size = model_input_size
        self._model: Any = None  # lazy — set in _lazy_load_model()
        self._device: Any = None  # lazy — set in _lazy_load_model()
        self._transform: Any = None  # lazy — set in _lazy_load_model()

    # ── Lazy model loading ──────────────────────────────────────────────────

    def _lazy_load_model(self) -> None:
        """Load the BRIA RMBG-1.4 model into RAM (called once on first use).

        This method is idempotent: subsequent calls are no-ops.
        """
        if self._model is not None:
            return

        import torch  # type: ignore[import-untyped]
        from torchvision.transforms.functional import normalize  # type: ignore[import-untyped]  # noqa: N812

        logger.info("Loading BRIA RMBG-1.4 from HuggingFace (%s) …", self._HF_REPO_ID)

        from transformers import AutoModelForImageSegmentation  # type: ignore[import-untyped]

        # Use the stored Hugging Face token if available (supports gated models)
        from settings import Settings

        hf_token = Settings.get_instance().hf_token

        self._model = AutoModelForImageSegmentation.from_pretrained(
            self._HF_REPO_ID,
            trust_remote_code=True,
            token=hf_token,
        )

        # Device auto-detection
        self._device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        if self._device.type == "cuda":
            logger.info("BRIA RMBG-1.4 loaded on CUDA")
        else:
            logger.info("BRIA RMBG-1.4 loaded on CPU")

        self._model.to(self._device)
        self._model.eval()  # inference mode

        # Pre-allocate the normalisation closure for reuse
        mean = [0.5, 0.5, 0.5]
        std = [1.0, 1.0, 1.0]
        self._mean = mean
        self._std = std

        logger.info("BRIA RMBG-1.4 model loaded successfully")

    # ── Processor interface ─────────────────────────────────────────────────

    def process(
        self,
        image: Image.Image,
        instructions: ProcessingInstructions | None = None,
    ) -> Image.Image:
        """Remove the background from *image* using BRIA RMBG-1.4.

        The result is an RGBA image where background pixels have
        alpha = 0 and foreground pixels have alpha = 255.

        Parameters
        ----------
        image : PIL.Image.Image
            Source image (not mutated).  Any mode is accepted.
        instructions : ProcessingInstructions | None
            Not used — provided for interface compatibility.

        Returns
        -------
        PIL.Image.Image
            A new RGBA image with the background made transparent.
        """
        from torchvision.transforms.functional import normalize  # type: ignore[import-untyped]  # noqa: N812
        import torch
        import torch.nn.functional as F  # noqa: N812

        # Lazy-load the model on first call
        self._lazy_load_model()

        # ── Pre-process ──────────────────────────────────────────────────
        orig_im = _pil_to_ndarray(image)
        orig_h, orig_w = orig_im.shape[0:2]

        model_input_size = [self._model_input_size, self._model_input_size]

        # Convert numpy → torch tensor (HWC → CHW), resize, normalise
        im_tensor = torch.tensor(orig_im, dtype=torch.float32).permute(2, 0, 1)  # type: ignore[attr-defined]
        im_tensor = F.interpolate(
            torch.unsqueeze(im_tensor, 0),  # add batch dim
            size=model_input_size,
            mode="bilinear",
        )
        im_tensor = torch.divide(im_tensor, 255.0)
        im_tensor = normalize(im_tensor, self._mean, self._std)
        im_tensor = im_tensor.to(self._device)

        # ── Inference ────────────────────────────────────────────────────
        with torch.no_grad():
            result = self._model(im_tensor)

        # ── Post-process ─────────────────────────────────────────────────
        # model output is a tuple; result[0] has shape (1, 1, H', W') —
        # the mask logits.  Interpolate to original resolution.
        mask_logits = F.interpolate(
            result[0],  # (1, 1, H', W')
            size=(orig_h, orig_w),
            mode="bilinear",
        )  # → (1, 1, orig_h, orig_w)

        # Squeeze → (orig_h, orig_w)
        mask_tensor = torch.squeeze(mask_logits)  # type: ignore[attr-defined]

        # Normalise to [0, 1]
        ma = torch.max(mask_tensor)
        mi = torch.min(mask_tensor)
        mask_tensor = (mask_tensor - mi) / (ma - mi)

        # Convert to uint8 numpy mask (H, W)
        mask_array = (
            (mask_tensor * 255)
            .cpu()
            .data.numpy()
            .astype(np.uint8)
        )

        # Ensure mask is binary-ish — clamp values
        mask_array = np.clip(mask_array, 0, 255).astype(np.uint8)

        # ── Compose RGBA output ──────────────────────────────────────────
        pil_mask = Image.fromarray(mask_array, mode="L")
        orig_rgba = image.convert("RGBA")
        no_bg = orig_rgba.copy()
        no_bg.putalpha(pil_mask)

        return no_bg

    @property
    def model_input_size(self) -> int:
        """The input resolution used by the model (width = height)."""
        return self._model_input_size

    def __repr__(self) -> str:
        device_str = self._device.type if self._device is not None else "unloaded"
        return (
            f"BackgroundRemovalProcessor("
            f"model_input_size={self._model_input_size}, "
            f"device={device_str})"
        )
