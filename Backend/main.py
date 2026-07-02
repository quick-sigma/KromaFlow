"""Image Prepare API – FastAPI application."""

from __future__ import annotations

import asyncio
import json
import logging
from io import BytesIO

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

from base import Processor, OutputFormatter
from models import Order, ProcessingInstructions
from output_formatter import ImageOutputFormatter
from avif_output_formatter import AVIFOutputFormatter
from processor import ImageProcessor, process_order

# Import steps_config to trigger @register decorators so the step registry
# is populated before any request reaches the /api/steps endpoint.
import steps_config  # noqa: F401  # register side-effect
from step import get_registered_steps

# Watermark remover is imported lazily (optional dependency).
# If the import fails, watermark removal is silently unavailable.
try:
    from watermark_remover import WatermarkRemoverProcessor

    _watermark_remover: Processor | None = WatermarkRemoverProcessor()
except ImportError:
    _watermark_remover: Processor | None = None

logger = logging.getLogger(__name__)

app = FastAPI(title="Image Prepare API")

# Application-level lock: only one order is processed at a time.
# This ensures sequential processing of the internal queue.
_processing_lock = asyncio.Lock()

# Module-level instances of the processing abstractions.
# These can be overridden via dependency injection if needed.
_processor: Processor = ImageProcessor()

# Formatter registry — each output format maps to the appropriate
# OutputFormatter implementation.  All formats handled by the default
# ImageOutputFormatter share a single instance; AVIF has its own.
_image_formatter: OutputFormatter = ImageOutputFormatter()
_avif_formatter: OutputFormatter = AVIFOutputFormatter()

_formatters: dict[str, OutputFormatter] = {
    "png": _image_formatter,
    "jpeg": _image_formatter,
    "webp": _image_formatter,
    "gif": _image_formatter,
    "bmp": _image_formatter,
    "tiff": _image_formatter,
    "avif": _avif_formatter,
}

# Convenience: all recognised format strings (including aliases).
_RECOGNISED_FORMATS: set[str] = set(_formatters.keys()) | {"jpg", "tif"}


# ── Routes ─────────────────────────────────────────────────────────────────


@app.get("/")
def read_root():
    return {"message": "Hello World"}


@app.get("/api/steps")
def list_steps():
    """Return metadata for every registered pipeline step.

    The frontend uses this endpoint to discover available steps and
    their configuration schemas.  Each step includes its name,
    description, version, variant (processor / output_formatter),
    and a JSON Schema representation of its config.
    """
    return [info.model_dump() for info in get_registered_steps()]


@app.post("/api/images/process")
async def process_image_endpoint(
    image: UploadFile = File(...),
    recipient: str = Form(...),
    instructions: str = Form(...),
    output_format: str = Form(default="png"),
):
    """Receive an image processing order and return the processed image.

    The endpoint acts as the single entry-point for the in-process
    processing queue: orders are handled one at a time (behind an
    ``asyncio.Lock``) so that image-processing resources are never
    contended.

    Parameters
    ----------
    image : UploadFile
        The source image file.
    recipient : str
        Identifier of the user who submitted the order.
    instructions : str
        JSON-encoded :class:`ProcessingInstructions` describing the
        transformations to apply.
    output_format : str
        Desired output format (png, jpeg, webp, gif, bmp, tiff).

    Returns
    -------
    Response
        The processed image with the appropriate ``Content-Type`` header.
    """
    # ── Parse instructions ────────────────────────────────────────────
    try:
        instructions_dict = json.loads(instructions)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid JSON in instructions field: {exc}",
        )

    if not isinstance(instructions_dict, dict):
        raise HTTPException(
            status_code=422,
            detail="Instructions must be a JSON object (dict)",
        )

    try:
        parsed_instructions = ProcessingInstructions(**instructions_dict)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # ── Resolve output format ─────────────────────────────────────────
    fmt = output_format.lower()
    if fmt not in _RECOGNISED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported output format: {output_format}. "
            f"Supported: {', '.join(sorted(_RECOGNISED_FORMATS))}",
        )

    # ── Open image with Pillow ────────────────────────────────────────
    try:
        contents = await image.read()
        pil_image = Image.open(BytesIO(contents))
        pil_image.load()  # fully decode while we have the file handle
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"The uploaded file is not a valid image: {exc}",
        )

    # ── Build the Order ───────────────────────────────────────────────
    order = Order(
        image=pil_image,
        recipient=recipient,
        instructions=parsed_instructions,
        output_format=fmt,
    )

    # ── Process (serialised via lock) using the abstractions ──────────
    async with _processing_lock:
        try:
            # 1. Watermark removal (optional, pre-processing step)
            image_to_process = order.image
            if order.instructions.remove_watermark:
                if _watermark_remover is not None:
                    image_to_process = _watermark_remover.process(
                        image_to_process, order.instructions
                    )
                else:
                    logger.warning(
                        "Watermark removal requested but GeminiEngine is not available"
                    )

            # 2. Image transformations (resize, rotate, etc.)
            processed_image = _processor.process(
                image_to_process, order.instructions
            )

            # 3. Output formatting — route to the right formatter
            formatter = _formatters.get(order.output_format)
            if formatter is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"No formatter registered for: {order.output_format}",
                )
            data, content_type = formatter.format_output(
                processed_image,
                order.output_format,
                order.instructions.quality,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    return Response(content=data, media_type=content_type)
