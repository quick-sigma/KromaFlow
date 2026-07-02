"""Image Prepare API – FastAPI application."""

from __future__ import annotations

import json
import asyncio
from io import BytesIO

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

from models import Order, ProcessingInstructions
from processor import process_order, SUPPORTED_FORMATS

app = FastAPI(title="Image Prepare API")

# Application-level lock: only one order is processed at a time.
# This ensures sequential processing of the internal queue.
_processing_lock = asyncio.Lock()


# ── Routes ─────────────────────────────────────────────────────────────────


@app.get("/")
def read_root():
    return {"message": "Hello World"}


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
    if fmt not in SUPPORTED_FORMATS and fmt not in ("jpg", "tif"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported output format: {output_format}. "
            f"Supported: {', '.join(sorted(SUPPORTED_FORMATS))}",
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

    # ── Process (serialised via lock) ─────────────────────────────────
    async with _processing_lock:
        try:
            data, content_type = process_order(order)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    return Response(content=data, media_type=content_type)
