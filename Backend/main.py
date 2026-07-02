"""Image Prepare API – FastAPI application."""

from __future__ import annotations

import json
import logging
from io import BytesIO

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image

# Import steps_config to trigger @register decorators so the step registry
# is populated before any request reaches the /api/steps endpoint.
import steps_config  # noqa: F401  # register side-effect
from step import Pipeline, get_registered_steps, _step_id_map

logger = logging.getLogger(__name__)

app = FastAPI(title="Image Prepare API")

# Allow CORS for the frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:55559",
        "http://127.0.0.1:55559",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    pipeline: str = Form(...),
):
    """Receive an image and a pipeline definition, execute the pipeline,
    and return the processed image.

    The ``pipeline`` field is a JSON string containing a list of step
    definitions::

        [
            {"step_id": "img_proc", "config": {"grayscale": true}},
            {"step_id": "img_fmt", "config": {"format": "png", "quality": 85}}
        ]

    Parameters
    ----------
    image : UploadFile
        The source image file.
    pipeline : str
        JSON-encoded list of step definitions with their configs.

    Returns
    -------
    Response
        The processed image with the appropriate ``Content-Type`` header.
    """
    # ── Parse pipeline JSON ───────────────────────────────────────────
    try:
        steps_data = json.loads(pipeline)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid JSON in pipeline field: {exc}",
        )

    if not isinstance(steps_data, list):
        raise HTTPException(
            status_code=422,
            detail="Pipeline must be a JSON array of step definitions",
        )

    if not steps_data:
        raise HTTPException(
            status_code=422,
            detail="Pipeline must contain at least one step",
        )

    # ── Build steps and validate configs ──────────────────────────────
    from step import Step as StepType

    steps: list[StepType] = []
    configs: dict[str, object] = {}

    for item in steps_data:
        if not isinstance(item, dict) or "step_id" not in item:
            raise HTTPException(
                status_code=422,
                detail="Each pipeline step must be an object with a 'step_id' field",
            )

        step_id = item["step_id"]
        step_cls = _step_id_map.get(step_id)
        if step_cls is None:
            available = sorted(_step_id_map)
            raise HTTPException(
                status_code=400,
                detail=f"Unknown step ID {step_id!r}. Available: {available}",
            )

        try:
            step_instance = step_cls()
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to instantiate step {step_id!r}: {exc}",
            )

        steps.append(step_instance)

        # Validate config against the step's schema
        raw_config = item.get("config", {})
        if not isinstance(raw_config, dict):
            raise HTTPException(
                status_code=422,
                detail=f"Config for step {step_id!r} must be a JSON object",
            )

        try:
            validated_config = step_instance.config_schema(**raw_config)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid config for step {step_id!r}: {exc}",
            )

        configs[step_id] = validated_config

    # ── Build and validate Pipeline ───────────────────────────────────
    try:
        pl = Pipeline(steps)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

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

    # ── Execute pipeline ──────────────────────────────────────────────
    try:
        data, content_type = pl.execute(pil_image, configs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return Response(content=data, media_type=content_type)
