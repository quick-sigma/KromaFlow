"""Favicon distribution step — generates a complete favicon set for the web.

This module provides:

* :class:`FaviconDistributionConfig` — config schema for selecting which
  icon sizes to generate.
* :class:`FaviconDistributionNode` — the core logic that resizes an image
  to standard favicon sizes and packages them into a zip archive together
  with HTML markup and a ``site.webmanifest``.
* :class:`FaviconDistributionStep` — a :class:`~step.Step` subclass
  registered with the ``@register`` decorator for API discovery.
"""

from __future__ import annotations

import io
import json
import logging
import zipfile

from PIL import Image as PILImage
from pydantic import BaseModel, Field

from base import DistributionNode
from frontend_types import dropdown_field
from step import Step, StepVariant, register

logger = logging.getLogger(__name__)

# ── Default favicon sizes (most commonly required) ──────────────────────────

DEFAULT_FAVICON_SIZES: list[int] = [
    16,
    32,
    48,
    64,
    96,
    128,
    144,
    152,
    180,
    192,
    256,
]

# Labels for the "label" naming convention
FAVICON_SIZE_LABELS: dict[int, str] = {
    16: "favicon",
    32: "favicon-32",
    48: "icon-48",
    64: "icon-64",
    96: "icon-96",
    128: "icon-128",
    144: "icon-144",
    152: "icon-152",
    180: "apple-touch-icon",
    192: "icon-192",
    256: "icon-256",
}


# ── Configuration schema ────────────────────────────────────────────────────


class FaviconDistributionConfig(BaseModel):
    """Configuration for the Favicon distribution step.

    Attributes
    ----------
    sizes : list[int]
        Favicon sizes (side length in pixels) to generate.
        Each produces a square PNG.
    naming_convention : str
        How to name the generated files. ``"size"`` uses
        ``favicon-32x32.png``; ``"label"`` uses semantic names like
        ``apple-touch-icon.png``.
    """

    sizes: list[int] = Field(
        default=DEFAULT_FAVICON_SIZES,
        title="Icon Sizes",
        description="Select the icon sizes (in pixels) to generate.  "
        "Each produces a square PNG.",
    )

    naming_convention: str = dropdown_field(
        default="size",
        options=["size", "label"],
        title="Naming Convention",
        description=(
            '"size" → favicon-32x32.png, favicon-256x256.png …  '
            '"label" → apple-touch-icon.png, icon-192.png …'
        ),
    )


# ── Core distribution logic ─────────────────────────────────────────────────


class FaviconDistributionNode(DistributionNode):
    """Generates a set of favicon images from a processed image.

    The source image is resized to each configured size (as a square),
    encoded in the requested output format, and packaged into a zip
    archive together with an HTML snippet (``<link>`` tags) and a
    ``site.webmanifest``.
    """

    # Map of image format → MIME type
    _FORMAT_MIME: dict[str, str] = {
        "png": "image/png",
        "ico": "image/x-icon",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "webp": "image/webp",
        "avif": "image/avif",
        "gif": "image/gif",
    }

    def distribute(
        self,
        image: PILImage.Image,
        output_format: str,
        quality: int | None = None,
        config: object | None = None,
    ) -> dict:
        """Generate favicon variants and package them in a zip.

        Parameters
        ----------
        image : PIL.Image.Image
            The processed image to resize.
        output_format : str
            Target format for each variant (e.g. ``"png"``, ``"ico"``,
            ``"jpeg"``, ``"avif"``).
        quality : int | None
            Compression quality for lossy formats (1-100).
        config : FaviconDistributionConfig | None
            Validated step configuration.  If ``None`` uses defaults.

        Returns
        -------
        dict
            A dictionary with:
            - ``"type"``: ``"favicon"``
            - ``"artifacts"``: list of per-icon descriptors
            - ``"zip_bytes"``: the complete zip archive as raw bytes
            - ``"html_links"``: HTML ``<link>`` tags for all icons
            - ``"webmanifest"``: a ``site.webmanifest`` JSON string
            - ``"mime_type"``: ``"application/zip"``
        """
        # Resolve config
        cfg = (
            config
            if isinstance(config, FaviconDistributionConfig)
            else FaviconDistributionConfig()
        )
        sizes = sorted(set(cfg.sizes))
        fmt = output_format or "png"
        quality_val = quality if quality is not None else 85

        # Resolve format for PIL and extension
        pil_format, ext = self._resolve_format(fmt)

        # Build zip in memory
        buf = io.BytesIO()
        artifacts: list[dict] = []

        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for size in sizes:
                resized = self._resize_to_square(image, size)
                prepared = self._prepare_for_format(resized, pil_format)
                img_bytes = io.BytesIO()
                save_kwargs: dict = {}
                if pil_format in ("JPEG", "WEBP", "AVIF"):
                    save_kwargs["quality"] = quality_val
                prepared.save(img_bytes, format=pil_format, **save_kwargs)
                img_bytes.seek(0)
                data = img_bytes.read()

                filename = self._make_filename(size, cfg.naming_convention, ext)
                zf.writestr(filename, data)

                artifacts.append({
                    "size": size,
                    "filename": filename,
                    "size_bytes": len(data),
                    "mime_type": self._FORMAT_MIME.get(fmt, "application/octet-stream"),
                })

            # Write HTML snippet with favicon <link> tags
            html = self._generate_html(artifacts)
            zf.writestr("index.html", html.encode("utf-8"))

            # Write JSON manifest (site.webmanifest)
            manifest = self._generate_webmanifest(artifacts)
            zf.writestr("site.webmanifest", json.dumps(manifest, indent=2))

        buf.seek(0)
        zip_bytes = buf.read()

        html_links = self._generate_link_tags(artifacts)
        webmanifest_str = json.dumps(
            self._generate_webmanifest(artifacts), indent=2
        )

        return {
            "type": "favicon",
            "artifacts": artifacts,
            "zip_bytes": zip_bytes,
            "zip_size_bytes": len(zip_bytes),
            "html_links": html_links,
            "webmanifest": webmanifest_str,
            "mime_type": "application/zip",
            "format": fmt,
            "quality": quality_val,
            "total_icons": len(artifacts),
            "output_suffix": "favicon",
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
    def _resize_to_square(image: PILImage.Image, size: int) -> PILImage.Image:
        """Resize *image* to a *size*×*size* square, centre-cropping if needed.

        First scales the image so that the shorter side matches *size*,
        then centre-crops to a square.
        """
        img = image.copy()

        # Ensure RGBA for favicon compatibility
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        # Scale so that the shorter side is at least `size`
        scale = max(size / img.width, size / img.height)
        new_w = round(img.width * scale)
        new_h = round(img.height * scale)
        img = img.resize((new_w, new_h), PILImage.Resampling.LANCZOS)

        # Centre crop to a square
        left = (new_w - size) // 2
        top = (new_h - size) // 2
        return img.crop((left, top, left + size, top + size))

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
    def _make_filename(size: int, convention: str, ext: str) -> str:
        """Build a filename for a favicon variant."""
        if convention == "label":
            label = FAVICON_SIZE_LABELS.get(size, f"icon-{size}")
            return f"{label}{ext}"
        # "size" convention (default)
        return f"favicon-{size}x{size}{ext}"

    @staticmethod
    def _generate_link_tags(artifacts: list[dict]) -> str:
        """Generate HTML ``<link>`` tags for all favicon artifacts."""
        lines = [
            "<!-- Favicon set generated by Image Prepare -->",
        ]

        for a in artifacts:
            size = a["size"]
            filename = a["filename"]
            mime = a["mime_type"]

            if mime == "image/x-icon":
                # Traditional favicon.ico
                lines.append(
                    f'  <link rel="icon" type="{mime}" '
                    f'href="{filename}" sizes="{size}x{size}">'
                )
            elif size == 180:
                # Apple touch icon
                lines.append(
                    f'  <link rel="apple-touch-icon" '
                    f'href="{filename}" sizes="{size}x{size}">'
                )
            else:
                # Generic favicon
                lines.append(
                    f'  <link rel="icon" type="{mime}" '
                    f'href="{filename}" sizes="{size}x{size}">'
                )

        # Add webmanifest link
        lines.append(
            '  <link rel="manifest" href="site.webmanifest">'
        )

        return "\n".join(lines)

    @staticmethod
    def _generate_html(artifacts: list[dict]) -> str:
        """Generate a complete HTML preview page."""
        link_tags = FaviconDistributionNode._generate_link_tags(artifacts)

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Favicon Preview</title>
{link_tags}
  <style>
    body {{ font-family: sans-serif; margin: 2rem; background: #1a1a2e; color: #e0e0e0; }}
    h1 {{ color: #a855f7; }}
    .grid {{ display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: flex-end; }}
    .icon {{ text-align: center; background: #16213e; padding: 1rem; border-radius: 8px; min-width: 80px; }}
    .icon img {{ image-rendering: pixelated; }}
    .icon span {{ display: block; margin-top: 0.5rem; font-size: 0.8rem; color: #a0a0a0; }}
    .info {{ background: #16213e; padding: 1rem; border-radius: 8px; overflow-x: auto; margin-top: 1rem; }}
    code {{ font-size: 0.85rem; }}
    pre {{ white-space: pre-wrap; word-break: break-all; }}
  </style>
</head>
<body>
  <h1>Favicon Preview</h1>
  <p>Total icons: <strong>{len(artifacts)}</strong></p>
  <div class="grid">
{FaviconDistributionNode._generate_icon_displays(artifacts)}
  </div>
  <div class="info">
    <h2>HTML Link Tags</h2>
    <pre><code>{FaviconDistributionNode._escape_html(link_tags)}</code></pre>
  </div>
</body>
</html>"""

    @staticmethod
    def _generate_icon_displays(artifacts: list[dict]) -> str:
        """Generate HTML for each icon preview in the grid."""
        lines = []
        for a in artifacts:
            size = a["size"]
            filename = a["filename"]
            display_size = min(size, 128)  # cap preview size
            lines.append(
                f'    <div class="icon">'
                f'<img src="{filename}" width="{display_size}" height="{display_size}" '
                f'alt="{size}x{size}">'
                f'<span>{size}x{size}</span>'
                f'<span>{a["size_bytes"]} bytes</span>'
                f'</div>'
            )
        return "\n".join(lines)

    @staticmethod
    def _generate_webmanifest(artifacts: list[dict]) -> dict:
        """Generate a ``site.webmanifest`` for PWA compliance."""
        icons = []
        for a in artifacts:
            if a["mime_type"] != "image/x-icon":
                icons.append({
                    "src": a["filename"],
                    "sizes": f"{a['size']}x{a['size']}",
                    "type": a["mime_type"],
                })
        return {
            "name": "Favicon Set",
            "icons": icons,
            "display": "standalone",
        }

    @staticmethod
    def _escape_html(text: str) -> str:
        """Escape HTML special characters."""
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )


# ── Step wrapper ────────────────────────────────────────────────────────────


@register(
    id="favicon_dist",
    name="Favicon Distribution",
    description=(
        "Generate a complete favicon set at standard icon sizes "
        "(16×16 to 256×256) and package them in a zip archive "
        "with HTML link tags and a web manifest"
    ),
    version="1.0.0",
)
class FaviconDistributionStep(Step[FaviconDistributionConfig]):
    """Wraps :class:`FaviconDistributionNode` as a pipeline distribution step."""

    def __init__(self) -> None:
        super().__init__(
            component=FaviconDistributionNode(),
            variant=StepVariant.DISTRIBUTION,
            id="favicon_dist",
            name="Favicon Distribution",
            description=(
                "Generate a complete favicon set at standard icon sizes "
                "(16×16 to 256×256) and package them in a zip archive "
                "with HTML link tags and a web manifest"
            ),
            version="1.0.0",
            config_schema=FaviconDistributionConfig,
        )
