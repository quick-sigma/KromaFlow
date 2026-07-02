"""Image Prepare API – FastAPI application."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

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


# ── Blob storage ─────────────────────────────────────────────────────────────

STORAGE_DIR = Path(__file__).parent / "storage" / "processed"
_METADATA_FILE = STORAGE_DIR / "metadata.json"

# Content-type to file extension mapping
_CONTENT_TYPE_EXT: dict[str, str] = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
}


def _ext_from_content_type(content_type: str) -> str:
    return _CONTENT_TYPE_EXT.get(content_type, ".bin")


def _load_metadata() -> dict[str, dict]:
    """Load processed-image metadata from disk."""
    if not _METADATA_FILE.exists():
        return {}
    try:
        with open(_METADATA_FILE) as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load metadata file: %s", exc)
    return {}


def _save_metadata(meta: dict[str, dict]) -> None:
    """Persist processed-image metadata to disk."""
    try:
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        with open(_METADATA_FILE, "w") as f:
            json.dump(meta, f, indent=2)
    except OSError as exc:
        logger.error("Failed to save metadata: %s", exc)


# In-memory metadata store backed by the JSON file on disk
_processed_metadata: dict[str, dict] = _load_metadata()


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
    store the result on disk, and return its metadata (including a
    ``resultId`` that can be used to download or delete the result).

    The ``pipeline`` field is a JSON string containing a list of step
    definitions::

        [
            {"step_id": "wm_remover", "config": {}},
            {"step_id": "avif_fmt", "config": {"quality": 85}}
        ]

    Returns
    -------
    JSON with ``resultId``, ``name``, ``type``, ``size`` and ``downloadUrl``.
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

    # ── Store processed result on disk ─────────────────────────────────
    result_id = str(uuid.uuid4())
    ext = _ext_from_content_type(content_type)
    file_path = STORAGE_DIR / f"{result_id}{ext}"

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(data)

    original_name = image.filename or "image.png"
    stem = Path(original_name).stem
    display_name = f"{stem}-processed{ext}"

    _processed_metadata[result_id] = {
        "originalName": original_name,
        "displayName": display_name,
        "type": content_type,
        "size": len(data),
        "ext": ext,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    _save_metadata(_processed_metadata)

    return {
        "resultId": result_id,
        "name": display_name,
        "type": content_type,
        "size": len(data),
        "downloadUrl": f"/api/images/{result_id}/download",
    }


@app.get("/api/images/{image_id}/download")
def download_processed_image(image_id: str):
    """Serve a previously processed image from disk storage.

    The image is identified by the ``resultId`` returned by the
    ``POST /api/images/process`` endpoint.
    """
    metadata = _processed_metadata.get(image_id)
    if metadata is None:
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = STORAGE_DIR / f"{image_id}{metadata['ext']}"
    if not file_path.exists():
        # Metadata exists but file is missing – clean up stale entry
        _processed_metadata.pop(image_id, None)
        _save_metadata(_processed_metadata)
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    data = file_path.read_bytes()
    return Response(content=data, media_type=metadata["type"])


@app.delete("/api/images/{image_id}", status_code=204)
def delete_processed_image(image_id: str):
    """Delete a processed image from disk storage.

    Removes both the file and its metadata entry.
    Returns 204 regardless of whether the image existed.
    """
    metadata = _processed_metadata.pop(image_id, None)
    if metadata is not None:
        file_path = STORAGE_DIR / f"{image_id}{metadata['ext']}"
        try:
            file_path.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Failed to delete file %s: %s", file_path, exc)
        _save_metadata(_processed_metadata)

    return Response(status_code=204)
