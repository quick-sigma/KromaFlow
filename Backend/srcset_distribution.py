"""SRCSet distribution step — generates responsive image sets for HTML ``srcset``.

This module provides:

* :class:`SRCSetDistributionNode` — the core logic that resizes an image
  to standard breakpoint widths and packages them into a zip archive.

* :class:`SRCSetDistributionConfig` — config schema allowing the user to
  choose which widths to generate.

* :class:`SRCSetDistributionStep` — a :class:`~step.Step` subclass
  registered with the ``@register`` decorator for API discovery.
"""

from __future__ import annotations

import io
import logging
import zipfile
from typing import Literal

from PIL import Image as PILImage
from pydantic import BaseModel, Field

from base import DistributionNode
from frontend_types import slider_field, dropdown_field
from step import Step, StepVariant, register

# ── Naming convention type ────────────────────────────────────────────────────

NamingConvention = Literal["width", "label"]
"""Allowed naming conventions for generated image files."""

logger = logging.getLogger(__name__)

# ── Default SRCSet widths (standard responsive image breakpoints) ──────────

DEFAULT_SRCSET_WIDTHS: list[int] = [
    400,
    640,
    768,
    1024,
    1280,
    1600,
    1920,
    2560,
]

# Map width → human-readable label for display
SRCSET_WIDTH_LABELS: dict[int, str] = {
    320: "320px  (Small mobile)",
    400: "400px  (Mobile 1×)",
    480: "480px  (Mobile portrait)",
    640: "640px  (Mobile landscape / small tablet)",
    768: "768px  (Tablet portrait)",
    960: "960px  (Tablet landscape)",
    1024: "1024px (Small laptop / tablet landscape 2×)",
    1280: "1280px (Laptop)",
    1440: "1440px (Large laptop)",
    1600: "1600px (Desktop)",
    1920: "1920px (Desktop 2× / Full HD)",
    2560: "2560px (4K displays)",
}


# ── Configuration schema ────────────────────────────────────────────────────


class SRCSetDistributionConfig(BaseModel):
    """Configuration for the SRCSet distribution step.

    Attributes
    ----------
    sizes : list[int]
        Image widths (in pixels) to generate.  Each selected image is
        resized to this width while preserving aspect ratio.
    quality : int
        Compression quality for lossy formats (1–100).
    naming_convention : str
        How to name the generated files.  ``"width"`` uses ``image-400w.png``,
        ``"label"`` uses the breakpoint name.
    """

    sizes: list[int] = Field(
        default=DEFAULT_SRCSET_WIDTHS,
        title="Image Widths",
        description="Select the image widths to generate.  Each produces a separate file.",
    )

    quality: int = slider_field(
        default=85,
        ge=0,
        le=100,
        title="Quality",
        description="Compression quality for generated images (0 = lowest, 100 = highest)",
    )

    naming_convention: NamingConvention = dropdown_field(
        default="width",
        options=["width", "label"],
        title="Naming Convention",
        description=(
            '"width" → image-400w.png, image-800w.png …  '
            '"label" → image-mobile.png, image-desktop.png …'
        ),
    )


# ── Core distribution logic ─────────────────────────────────────────────────


class SRCSetDistributionNode(DistributionNode):
    """Generates an HTML ``srcset`` image set from a processed image.

    Resizes the source image to each configured width while preserving
    aspect ratio, encodes them in the requested format, and packages
    everything into a zip archive along with HTML markup.
    """

    # Map of image format → MIME type
    _FORMAT_MIME: dict[str, str] = {
        "png": "image/png",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "webp": "image/webp",
        "avif": "image/avif",
        "ico": "image/x-icon",
        "gif": "image/gif",
    }

    def distribute(
        self,
        image: PILImage.Image,
        output_format: str,
        quality: int | None = None,
        config: object | None = None,
    ) -> dict:
        """Generate SRCSet image variants and package them in a zip.

        Parameters
        ----------
        image : PIL.Image.Image
            The processed image to resize.
        output_format : str
            Target format for each variant (e.g. ``"png"``, ``"jpeg"``,
            ``"webp"``, ``"avif"``).
        quality : int | None
            Compression quality for lossy formats (1-100).
        config : SRCSetDistributionConfig | None
            Validated step configuration.  If ``None`` uses defaults.

        Returns
        -------
        dict
            A dictionary with:
            - ``"type"``: ``"srcset"``
            - ``"artifacts"``: list of per-image descriptors
            - ``"zip_bytes"``: the complete zip archive as raw bytes
            - ``"html_srcset"``: the ``srcset`` attribute value
            - ``"html_picture"``: a complete ``<picture>`` element
            - ``"mime_type"``: ``"application/zip"``
        """
        # Resolve config
        cfg = config if isinstance(config, SRCSetDistributionConfig) else SRCSetDistributionConfig()
        widths = sorted(set(cfg.sizes))
        fmt = output_format or "png"
        quality_val = quality if quality is not None else cfg.quality

        # Normalise format for PIL and filename extension
        pil_format, ext = self._resolve_format(fmt)

        # Build zip in memory
        buf = io.BytesIO()
        artifacts: list[dict] = []
        original_stem = "image"

        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for width in widths:
                resized = self._resize_to_width(image, width)
                prepared = self._prepare_for_format(resized, pil_format)
                img_bytes = io.BytesIO()
                save_kwargs: dict = {}
                if pil_format in ("JPEG", "WEBP", "AVIF"):
                    save_kwargs["quality"] = quality_val

                prepared.save(img_bytes, format=pil_format, **save_kwargs)
                img_bytes.seek(0)
                data = img_bytes.read()

                filename = self._make_filename(
                    original_stem, width, ext, cfg.naming_convention
                )
                zf.writestr(filename, data)

                artifacts.append({
                    "width": width,
                    "filename": filename,
                    "size_bytes": len(data),
                    "mime_type": self._FORMAT_MIME.get(fmt, "application/octet-stream"),
                })

            # Write an HTML snippet with the complete <picture> element
            html = self._generate_html(artifacts, original_stem, ext, fmt)
            zf.writestr("index.html", html.encode("utf-8"))

            # Write a JSON manifest
            import json

            manifest = {
                "type": "srcset",
                "total_images": len(artifacts),
                "format": fmt,
                "quality": quality_val,
                "images": artifacts,
                "html_srcset": self._generate_srcset_attr(artifacts),
            }
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))

        buf.seek(0)
        zip_bytes = buf.read()

        html_srcset = self._generate_srcset_attr(artifacts)
        html_picture = self._generate_picture_html(
            artifacts, original_stem, ext, fmt
        )

        return {
            "type": "srcset",
            "artifacts": artifacts,
            "zip_bytes": zip_bytes,
            "zip_size_bytes": len(zip_bytes),
            "html_srcset": html_srcset,
            "html_picture": html_picture,
            "mime_type": "application/zip",
            "format": fmt,
            "quality": quality_val,
            "total_images": len(artifacts),
            "output_suffix": "srcset",
        }

    # ── Internal helpers ────────────────────────────────────────────────────

    @staticmethod
    def _prepare_for_format(
        image: PILImage.Image, pil_format: str
    ) -> PILImage.Image:
        """Convert image mode to be compatible with the target PIL format.

        JPEG does not support alpha transparency, so RGBA images are
        composited over a white background.  All other formats (PNG,
        WEBP, AVIF, ICO, GIF) handle RGBA natively.
        """
        if pil_format == "JPEG" and image.mode == "RGBA":
            background = PILImage.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            return background
        if pil_format == "JPEG" and image.mode not in ("RGB", "L"):
            return image.convert("RGB")
        return image

    @staticmethod
    def _resolve_format(fmt: str) -> tuple[str, str]:
        """Return ``(pil_format, file_extension)`` for the given format string."""
        fmt = fmt.lower().strip()
        ext_map = {
            "png": ("PNG", ".png"),
            "jpeg": ("JPEG", ".jpg"),
            "jpg": ("JPEG", ".jpg"),
            "webp": ("WEBP", ".webp"),
            "avif": ("AVIF", ".avif"),
            "ico": ("ICO", ".ico"),
            "gif": ("GIF", ".gif"),
        }
        if fmt in ext_map:
            return ext_map[fmt]
        logger.warning("Unknown format %r, falling back to PNG", fmt)
        return "PNG", ".png"

    @staticmethod
    def _resize_to_width(image: PILImage.Image, width: int) -> PILImage.Image:
        """Resize *image* to *width* preserving aspect ratio.

        Uses :attr:`PILImage.Resampling.LANCZOS` for high-quality downscaling.
        """
        w_percent = width / float(image.size[0])
        height = int(float(image.size[1]) * w_percent)
        return image.copy().resize((width, height), PILImage.Resampling.LANCZOS)

    @staticmethod
    def _make_filename(
        stem: str, width: int, ext: str, convention: str
    ) -> str:
        """Build a filename for a width variant."""
        if convention == "label":
            label_map = {
                320: "small-mobile",
                400: "mobile",
                480: "mobile-portrait",
                640: "mobile-landscape",
                768: "tablet-portrait",
                960: "tablet-landscape",
                1024: "laptop-small",
                1280: "laptop",
                1440: "laptop-large",
                1600: "desktop",
                1920: "desktop-hd",
                2560: "ultrahd",
            }
            label = label_map.get(width, f"{width}w")
            return f"{stem}-{label}{ext}"
        # "width" convention (default)
        return f"{stem}-{width}w{ext}"

    @staticmethod
    def _generate_srcset_attr(artifacts: list[dict]) -> str:
        """Generate the ``srcset`` attribute value from artifacts."""
        candidates = []
        for a in artifacts:
            candidates.append(f"{a['filename']} {a['width']}w")
        return ", ".join(candidates)

    @staticmethod
    def _generate_html(
        artifacts: list[dict],
        stem: str,
        ext: str,
        fmt: str,
    ) -> str:
        """Generate a complete HTML page previewing the SRCSet."""
        srcset_attr = SRCSetDistributionNode._generate_srcset_attr(artifacts)
        mime = SRCSetDistributionNode._FORMAT_MIME.get(fmt, "image/png")

        lines = [
            "<!DOCTYPE html>",
            '<html lang="en">',
            "<head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
            "<title>SRCSet Preview</title>",
            "<style>"
            "body{font-family:sans-serif;margin:2rem;background:#1a1a2e;color:#e0e0e0}"
            "h1{color:#a855f7}"
            "img{max-width:100%;height:auto;border-radius:8px;margin:1rem 0}"
            ".info{background:#16213e;padding:1rem;border-radius:8px;overflow-x:auto}"
            "code{font-size:0.9rem}"
            "</style>",
            "</head><body>",
            f"<h1>SRCSet Preview</h1>",
            f"<p>Format: <strong>{fmt.upper()}</strong> | "
            f"Images: <strong>{len(artifacts)}</strong></p>",
            "<div class='info'>",
            "<h2>Picture Element</h2>",
            "<pre><code>",
            SRCSetDistributionNode._escape_html(
                SRCSetDistributionNode._generate_picture_html(
                    artifacts, stem, ext, fmt
                )
            ),
            "</code></pre>",
            "</div>",
            "<div class='info'>",
            "<h2>srcset Attribute</h2>",
            f"<pre><code>{srcset_attr}</code></pre>",
            "</div>",
            "<h2>Preview</h2>",
            f"<picture>",
        ]

        # Add source elements in order (largest first for modern formats)
        lines.append(
            f'  <source type="{mime}" srcset="{srcset_attr}" sizes="100vw">'
        )

        # Fallback img
        fallback = artifacts[0]["filename"] if artifacts else f"{stem}{ext}"
        lines.append(
            f'  <img src="{fallback}" srcset="{srcset_attr}" '
            f'sizes="100vw" alt="Responsive image" '
            f'width="1920" height="1080">'
        )
        lines.append("</picture>")
        lines.append("</body></html>")

        return "\n".join(lines)

    @staticmethod
    def _generate_picture_html(
        artifacts: list[dict], stem: str, ext: str, fmt: str
    ) -> str:
        """Generate a ``<picture>`` element string for the SRCSet."""
        srcset_attr = SRCSetDistributionNode._generate_srcset_attr(artifacts)
        mime = SRCSetDistributionNode._FORMAT_MIME.get(fmt, "image/png")
        fallback = artifacts[0]["filename"] if artifacts else f"{stem}{ext}"

        lines = [
            "<picture>",
            f'  <source type="{mime}" srcset="{srcset_attr}" sizes="100vw">',
            f'  <img src="{fallback}" srcset="{srcset_attr}" ',
            f'       sizes="100vw" alt="Responsive image" loading="lazy">',
            "</picture>",
        ]
        return "\n".join(lines)

    @staticmethod
    def _escape_html(text: str) -> str:
        """Escape HTML special characters for display in <pre><code>."""
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )


# ── Step wrapper ────────────────────────────────────────────────────────────


@register(
    id="srcset_dist",
    name="SRCSet Distribution",
    description=(
        "Generate a responsive image set (SRCSet) at standard breakpoint "
        "widths and package them in a zip archive with HTML preview"
    ),
    version="1.0.0",
)
class SRCSetDistributionStep(Step[SRCSetDistributionConfig]):
    """Wraps :class:`SRCSetDistributionNode` as a pipeline distribution step."""

    def __init__(self) -> None:
        super().__init__(
            component=SRCSetDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="srcset_dist",
            name="SRCSet Distribution",
            description=(
                "Generate a responsive image set (SRCSet) at standard breakpoint "
                "widths and package them in a zip archive with HTML preview"
            ),
            version="1.0.0",
            config_schema=SRCSetDistributionConfig,
        )
