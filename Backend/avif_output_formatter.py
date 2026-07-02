"""AVIF output formatter — concrete :class:`base.OutputFormatter`.

Encodes a Pillow ``Image`` into the AVIF format (AV1 Image File
Format), which offers superior compression compared to JPEG and WebP
while supporting both lossy and lossless encoding, HDR, and alpha
transparency natively.
"""

from __future__ import annotations

from io import BytesIO

from PIL import Image

from base import OutputFormatter

# ── Constants ──────────────────────────────────────────────────────────────

SUPPORTED_FORMATS: set[str] = {"avif"}
CONTENT_TYPE: str = "image/avif"


# ── Concrete implementation ───────────────────────────────────────────────


class AVIFOutputFormatter(OutputFormatter):
    """Encodes images to AVIF using Pillow's AVIF plugin.

    This formatter **only** handles the ``"avif"`` format.  Unlike
    :class:`~output_formatter.ImageOutputFormatter` it does **not**
    need to composite RGBA over a background — AVIF supports alpha
    natively.
    """

    def format_output(
        self,
        image: Image.Image,
        output_format: str,
        quality: int | None = None,
    ) -> tuple[bytes, str]:
        """Encode *image* as AVIF.

        Parameters
        ----------
        image : Image.Image
            The processed image to encode.
        output_format : str
            Must be ``"avif"`` (case-insensitive).
        quality : int | None
            Compression quality (1–100). ``None`` uses Pillow's
            default (usually ~80).

        Returns
        -------
        tuple[bytes, str]
            ``(avif_bytes, "image/avif")``.

        Raises
        ------
        ValueError
            If *output_format* is not ``"avif"``.
        """
        fmt = output_format.lower()

        if fmt not in SUPPORTED_FORMATS:
            raise ValueError(
                f"Unsupported output format: {output_format}. "
                f"{self.__class__.__name__} only supports AVIF."
            )

        # AVIF handles RGBA natively — no compositing needed.
        # For grayscale (mode L), convert to RGB for broader compatibility.
        if image.mode == "L":
            image = image.convert("RGB")

        # ── Encode ────────────────────────────────────────────────────
        buf = BytesIO()
        save_kwargs: dict = {}
        if quality is not None:
            save_kwargs["quality"] = quality

        image.save(buf, format="AVIF", **save_kwargs)
        buf.seek(0)

        return buf.getvalue(), CONTENT_TYPE
