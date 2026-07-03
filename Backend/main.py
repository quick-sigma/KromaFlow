"""Image Prepare API – FastAPI application."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image

# Import steps_config to trigger @register decorators so the step registry
# is populated before any request reaches the /api/steps endpoint.
import steps_config  # noqa: F401  # register side-effect
from model_manager import ModelManager
from settings import Settings
from step import Pipeline, PipelineResult, get_registered_steps, _step_id_map

logger = logging.getLogger(__name__)

# ── Lifespan ────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Configure the queue manager and start the model idle-unloader on startup."""
    _configure_queue_manager()
    _start_model_idle_monitor()
    yield


app = FastAPI(title="Image Prepare API", lifespan=lifespan)

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

# ── Queue manager (lazy-imported to avoid circular deps at module level) ────

_qm: object | None = None


def _get_queue_manager():
    """Return the singleton QueueManager, initialised on first call."""
    global _qm
    if _qm is None:
        from queue_manager import QueueManager
        _qm = QueueManager.get_instance()
    return _qm


def _configure_queue_manager():
    """Wire up the queue manager's result callback.

    The callback stores processed images to disk using the same storage
    logic as the synchronous ``POST /api/images/process`` endpoint.
    """
    qm = _get_queue_manager()

    async def store_result(job, image_bytes, content_type):
        """Store processed result on disk and return (result_id, display_name)."""
        result_id = str(uuid.uuid4())
        ext = _ext_from_content_type(content_type)
        file_path = STORAGE_DIR / f"{result_id}{ext}"

        STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(image_bytes)

        original_name = job.original_name
        stem = Path(original_name).stem
        display_name = f"{stem}-processed{ext}"

        _processed_metadata[result_id] = {
            "originalName": original_name,
            "displayName": display_name,
            "type": content_type,
            "size": len(image_bytes),
            "ext": ext,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        _save_metadata(_processed_metadata)

        return result_id, display_name

    qm.set_result_callback(store_result)


# ── Model idle-unloader background task ─────────────────────────────────────


def _start_model_idle_monitor() -> None:
    """Start a background asyncio task that unloads idle models every 60 s."""
    async def _monitor() -> None:
        mgr = ModelManager.get_instance()
        while True:
            try:
                count = mgr.unload_idle_models()
                if count:
                    logger.info("Unloaded %d idle model(s) from RAM", count)
            except Exception:
                logger.exception("Error unloading idle models")
            await asyncio.sleep(60.0)

    asyncio.create_task(_monitor())
    logger.debug("Model idle-unloader background task started (interval=60s)")


# ── Settings endpoints ──────────────────────────────────────────────────────


@app.get("/api/settings")
def get_settings():
    """Return current runtime settings (without exposing sensitive values).

    The frontend uses this to check whether a Hugging Face token has been
    configured, e.g. after a page refresh.
    """
    s = Settings.get_instance()
    return {
        "hfTokenConfigured": s.has_hf_token,
    }


@app.post("/api/settings/hf-token")
def set_hf_token(body: dict):
    """Store a Hugging Face token for use during model downloads.

    The token is held in memory only.  The frontend should re-send it on
    app startup if it was persisted locally.

    Request body::

        {"token": "hf_..."}

    To clear the token send an empty string or omit the field.
    """
    token = body.get("token", "") if isinstance(body, dict) else ""
    s = Settings.get_instance()
    s.hf_token = token if token else None
    return {"status": "ok", "hfTokenConfigured": s.has_hf_token}


@app.delete("/api/settings/hf-token")
def clear_hf_token():
    """Clear the stored Hugging Face token."""
    s = Settings.get_instance()
    s.hf_token = None
    return {"status": "ok", "hfTokenConfigured": False}


# ── WebSocket endpoint ──────────────────────────────────────────────────────


@app.websocket("/ws")
async def queue_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time queue status updates.

    On connection the client receives a full ``state_sync`` message with
    all current jobs and queue statistics.  Thereafter it receives
    ``job_enqueued``, ``job_processing``, ``job_update``, ``job_completed``
    and ``job_failed`` messages as jobs progress through the queue.
    """
    qm = _get_queue_manager()
    await qm.connect(websocket)
    try:
        # Keep the connection open — this coroutine stays alive until the
        # client disconnects.
        while True:
            # We don't expect messages from the client, but we need to
            # keep reading to detect disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await qm.disconnect(websocket)


# ── Queue enqueue endpoint ──────────────────────────────────────────────────


@app.post("/api/queue/enqueue")
async def enqueue_for_processing(
    image: UploadFile = File(...),
    pipeline: str = Form(...),
):
    """Add an image to the processing queue.

    Unlike ``POST /api/images/process`` which processes synchronously,
    this endpoint adds the job to a queue and returns immediately with a
    ``jobId``.  The frontend should listen on the ``/ws`` WebSocket for
    status updates.

    Returns
    -------
    JSON with ``jobId``, ``status`` ("enqueued"), and ``queuePosition``.
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

    # ── Quick validation: check step IDs exist ────────────────────────
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

    # ── Read image data ───────────────────────────────────────────────
    contents = await image.read()

    content_type = image.content_type or "image/png"
    original_name = image.filename or "image.png"

    # ── Enqueue job ───────────────────────────────────────────────────
    qm = _get_queue_manager()
    job_id = await qm.enqueue(
        image_data=contents,
        original_name=original_name,
        pipeline=steps_data,
        content_type=content_type,
    )

    return {
        "jobId": job_id,
        "status": "enqueued",
    }


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
    "application/zip": ".zip",
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

# Distribution artifact metadata
_DISTRIBUTION_METADATA_FILE = STORAGE_DIR / "distribution_metadata.json"


def _load_distribution_metadata() -> dict[str, dict]:
    """Load distribution-artifact metadata from disk."""
    if not _DISTRIBUTION_METADATA_FILE.exists():
        return {}
    try:
        with open(_DISTRIBUTION_METADATA_FILE) as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load distribution metadata file: %s", exc)
    return {}


def _save_distribution_metadata(meta: dict[str, dict]) -> None:
    """Persist distribution-artifact metadata to disk."""
    try:
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        with open(_DISTRIBUTION_METADATA_FILE, "w") as f:
            json.dump(meta, f, indent=2)
    except OSError as exc:
        logger.error("Failed to save distribution metadata: %s", exc)


_distribution_metadata: dict[str, dict] = _load_distribution_metadata()


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

        # Support repeatable steps: when the same step_id appears multiple
        # times, store all configs in a list consumed in order by each
        # step instance in Pipeline.execute().
        if step_id in configs:
            existing = configs[step_id]
            if isinstance(existing, list):
                existing.append(validated_config)
            else:
                configs[step_id] = [existing, validated_config]
        else:
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
        pipeline_result = pl.execute(pil_image, configs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    data, content_type = pipeline_result

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

    # ── Handle distribution artifacts ─────────────────────────────────
    distributions: dict[str, Any] = {}
    for dist_step_id, dist_result in pipeline_result.distributions.items():
        zip_bytes = dist_result.get("zip_bytes")
        if zip_bytes:
            dist_id = str(uuid.uuid4())
            dist_file_path = STORAGE_DIR / f"{dist_id}.zip"
            dist_file_path.write_bytes(zip_bytes)

            dist_meta = {
                "distributionId": dist_id,
                "type": dist_result.get("type", "unknown"),
                "format": dist_result.get("format", "png"),
                "quality": dist_result.get("quality"),
                "totalImages": dist_result.get("total_images", 0),
                "zipSizeBytes": dist_result.get("zip_size_bytes", len(zip_bytes)),
                "zipDownloadUrl": f"/api/distributions/{dist_id}/download",
                "htmlSrcset": dist_result.get("html_srcset", ""),
                "htmlPicture": dist_result.get("html_picture", ""),
                "artifacts": dist_result.get("artifacts", []),
                "outputSuffix": dist_result.get("output_suffix", "dist"),
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }

            distributions[dist_step_id] = dist_meta

            # Persist distribution metadata
            _distribution_metadata[dist_id] = dist_meta
        _save_distribution_metadata(_distribution_metadata)

    # ── Build response ─────────────────────────────────────────────────
    # When distribution artifacts exist, the zip becomes the primary
    # download so the user gets the full set, not just the single image.
    if distributions:
        primary_dist = next(iter(distributions.values()))
        suffix = primary_dist.get("outputSuffix", "dist")
        response_data: dict[str, Any] = {
            "resultId": primary_dist["distributionId"],
            "name": f"{stem}-{suffix}.zip",
            "type": "application/zip",
            "size": primary_dist["zipSizeBytes"],
            "downloadUrl": primary_dist["zipDownloadUrl"],
            "distributions": distributions,
            # Keep the original encoded image accessible as secondary
            "primaryImage": {
                "resultId": result_id,
                "name": display_name,
                "type": content_type,
                "size": len(data),
                "downloadUrl": f"/api/images/{result_id}/download",
            },
        }
    else:
        response_data = {
            "resultId": result_id,
            "name": display_name,
            "type": content_type,
            "size": len(data),
            "downloadUrl": f"/api/images/{result_id}/download",
        }

    return response_data


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


@app.get("/api/distributions/{distribution_id}/download")
def download_distribution(distribution_id: str):
    """Serve a distribution zip file from disk storage.

    The distribution is identified by the ``distributionId`` returned in
    the ``distributions`` field of the process response.
    """
    metadata = _distribution_metadata.get(distribution_id)
    if metadata is None:
        raise HTTPException(status_code=404, detail="Distribution not found")

    file_path = STORAGE_DIR / f"{distribution_id}.zip"
    if not file_path.exists():
        _distribution_metadata.pop(distribution_id, None)
        _save_distribution_metadata(_distribution_metadata)
        raise HTTPException(status_code=404, detail="Distribution file not found on disk")

    data = file_path.read_bytes()
    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="srcset-{distribution_id}.zip"',
        },
    )


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
