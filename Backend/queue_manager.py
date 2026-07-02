"""Processing queue manager — processes one image at a time with WebSocket status updates.

Features
--------
* Async queue ensures images are processed sequentially (one at a time).
* Each job transitions through states: enqueued → processing → completed / failed.
* WebSocket broadcasting keeps all connected clients in sync.
* Progress reporting (0–100 %) for per-image and overall queue progress.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from io import BytesIO
from typing import Any

from fastapi import WebSocket
from PIL import Image

logger = logging.getLogger(__name__)


# ── Job status enum ──────────────────────────────────────────────────────────


class JobStatus(str, Enum):
    """States a processing job transitions through."""

    ENQUEUED = "enqueued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# ── Job model ────────────────────────────────────────────────────────────────


class ProcessingJob:
    """A single image-processing job."""

    def __init__(
        self,
        job_id: str,
        image_data: bytes,
        original_name: str,
        pipeline: list[dict],
        content_type: str,
    ) -> None:
        self.job_id = job_id
        self.image_data = image_data
        self.original_name = original_name
        self.pipeline = pipeline
        self.content_type = content_type
        self.status = JobStatus.ENQUEUED
        self.progress = 0  # 0–100
        self.error: str | None = None
        self.result_id: str | None = None
        self.result_name: str | None = None
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.completed_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialise job state for WebSocket messages."""
        return {
            "jobId": self.job_id,
            "originalName": self.original_name,
            "status": self.status.value,
            "progress": self.progress,
            "error": self.error,
            "resultId": self.result_id,
            "resultName": self.result_name,
            "createdAt": self.created_at,
            "completedAt": self.completed_at,
        }


# ── Queue stats ──────────────────────────────────────────────────────────────


class QueueStats:
    """Overall queue statistics broadcast to clients."""

    def __init__(self) -> None:
        self.total_enqueued = 0
        self.total_completed = 0
        self.total_failed = 0
        self.pending_count = 0
        self.current_job: ProcessingJob | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "totalEnqueued": self.total_enqueued,
            "totalCompleted": self.total_completed,
            "totalFailed": self.total_failed,
            "totalProcessed": self.total_completed + self.total_failed,
            "pendingCount": self.pending_count,
            "currentJobId": self.current_job.job_id if self.current_job else None,
        }


# ── Queue manager ────────────────────────────────────────────────────────────


class QueueManager:
    """Manages image processing jobs, background processing, and WebSocket broadcasts.

    This is a singleton per application — use ``QueueManager.get_instance()``.
    """

    _instance: QueueManager | None = None

    @classmethod
    def get_instance(cls) -> QueueManager:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self) -> None:
        self._queue: asyncio.Queue[ProcessingJob] = asyncio.Queue()
        self._jobs: dict[str, ProcessingJob] = {}
        self._stats = QueueStats()
        self._websockets: list[WebSocket] = []
        self._processing_task: asyncio.Task[None] | None = None
        self._running = False

        # Callbacks for external result persistence
        self._result_callback = self._default_result_callback

    def set_result_callback(self, callback: Any) -> None:
        """Set a callback invoked when a job completes successfully.

        The callback receives ``(job, image_bytes, content_type)`` and should
        return ``(result_id, result_name)`` or raise on failure.
        """
        self._result_callback = callback

    async def _default_result_callback(
        self, job: ProcessingJob, image_bytes: bytes, content_type: str
    ) -> tuple[str, str]:
        """Placeholder — replaced by :meth:`set_result_callback` at app startup."""
        msg = (
            "QueueManager result callback not configured. "
            "Call set_result_callback() before processing jobs."
        )
        raise RuntimeError(msg)

    # ── WebSocket management ──────────────────────────────────────────────

    async def connect(self, websocket: WebSocket) -> None:
        """Accept a new WebSocket connection and send current state."""
        await websocket.accept()
        self._websockets.append(websocket)

        # Send full state sync
        await websocket.send_json({
            "type": "state_sync",
            "jobs": [job.to_dict() for job in self._jobs.values()],
            "stats": self._stats.to_dict(),
        })

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a disconnected WebSocket."""
        if websocket in self._websockets:
            self._websockets.remove(websocket)

    async def _broadcast(self, message: dict[str, Any]) -> None:
        """Send a JSON message to all connected WebSocket clients."""
        dead: list[WebSocket] = []
        for ws in self._websockets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)

    # ── Job management ────────────────────────────────────────────────────

    async def enqueue(
        self,
        image_data: bytes,
        original_name: str,
        pipeline: list[dict],
        content_type: str,
    ) -> str:
        """Add a processing job to the queue and return its job ID.

        Starts the background processing loop if it is not already running.
        """
        job_id = str(uuid.uuid4())
        job = ProcessingJob(
            job_id=job_id,
            image_data=image_data,
            original_name=original_name,
            pipeline=pipeline,
            content_type=content_type,
        )

        self._jobs[job_id] = job
        self._stats.total_enqueued += 1
        self._stats.pending_count = self._queue.qsize() + 1

        await self._queue.put(job)

        # Notify clients
        await self._broadcast({
            "type": "job_enqueued",
            "job": job.to_dict(),
            "stats": self._stats.to_dict(),
        })

        # Start background processing if not running
        if not self._running:
            self._running = True
            self._processing_task = asyncio.create_task(self._process_loop())

        return job_id

    def get_job(self, job_id: str) -> ProcessingJob | None:
        """Look up a job by its ID."""
        return self._jobs.get(job_id)

    # ── Background processing ─────────────────────────────────────────────

    async def _process_loop(self) -> None:
        """Background task: process jobs from the queue one at a time."""
        try:
            while self._running:
                try:
                    job = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    if self._queue.empty():
                        self._running = False
                        break
                    continue

                await self._process_job(job)

                if self._queue.empty():
                    self._running = False
                    break
        except Exception as exc:
            logger.exception("Processing loop crashed: %s", exc)
            self._running = False

    async def _process_job(self, job: ProcessingJob) -> None:
        """Process a single job — update state, execute pipeline, broadcast."""
        # ── Mark as processing ────────────────────────────────────────────
        job.status = JobStatus.PROCESSING
        job.progress = 0
        self._stats.current_job = job
        self._stats.pending_count = self._queue.qsize()

        await self._broadcast({
            "type": "job_processing",
            "job": job.to_dict(),
            "stats": self._stats.to_dict(),
        })

        try:
            # ── Simulate progress while setting up ────────────────────────
            job.progress = 5
            await self._broadcast_job_update(job)

            # Import here to avoid circular imports at module level
            import json as json_mod
            from step import Pipeline, _step_id_map

            # ── Parse pipeline ────────────────────────────────────────────
            steps_data = [s for s in job.pipeline if isinstance(s, dict) and "step_id" in s]
            if not steps_data:
                raise ValueError("Pipeline must contain at least one step")

            # ── Build steps ───────────────────────────────────────────────
            from step import Step as StepType

            steps: list[StepType] = []
            configs: dict[str, object] = {}

            for item in steps_data:
                step_id = item["step_id"]
                step_cls = _step_id_map.get(step_id)
                if step_cls is None:
                    raise ValueError(f"Unknown step ID {step_id!r}")

                step_instance = step_cls()
                steps.append(step_instance)

                raw_config = item.get("config", {})
                validated_config = step_instance.config_schema(**raw_config)
                configs[step_id] = validated_config

            job.progress = 15
            await self._broadcast_job_update(job)

            # ── Validate pipeline ─────────────────────────────────────────
            pl = Pipeline(steps)

            job.progress = 20
            await self._broadcast_job_update(job)

            # ── Open image ────────────────────────────────────────────────
            pil_image = Image.open(BytesIO(job.image_data))
            pil_image.load()

            job.progress = 25
            await self._broadcast_job_update(job)

            # ── Execute pipeline in thread pool to avoid blocking ─────────
            loop = asyncio.get_event_loop()

            def execute() -> tuple[bytes, str]:
                return pl.execute(pil_image, configs)

            data, content_type = await loop.run_in_executor(None, execute)

            job.progress = 80
            await self._broadcast_job_update(job)

            # ── Store result ──────────────────────────────────────────────
            result_id, display_name = await self._result_callback(
                job, data, content_type
            )

            job.result_id = result_id
            job.result_name = display_name
            job.status = JobStatus.COMPLETED
            job.progress = 100
            job.completed_at = datetime.now(timezone.utc).isoformat()
            self._stats.total_completed += 1
            self._stats.current_job = None

            await self._broadcast({
                "type": "job_completed",
                "job": job.to_dict(),
                "stats": self._stats.to_dict(),
            })

        except Exception as exc:
            logger.exception("Job %s failed: %s", job.job_id, exc)
            job.status = JobStatus.FAILED
            job.error = str(exc)
            job.completed_at = datetime.now(timezone.utc).isoformat()
            self._stats.total_failed += 1
            self._stats.current_job = None

            await self._broadcast({
                "type": "job_failed",
                "job": job.to_dict(),
                "stats": self._stats.to_dict(),
            })

    async def _broadcast_job_update(self, job: ProcessingJob) -> None:
        """Broadcast a generic job update with current stats."""
        await self._broadcast({
            "type": "job_update",
            "job": job.to_dict(),
            "stats": self._stats.to_dict(),
        })

    # ── Query ─────────────────────────────────────────────────────────────

    def get_all_jobs(self) -> list[dict[str, Any]]:
        return [job.to_dict() for job in self._jobs.values()]

    def get_stats(self) -> dict[str, Any]:
        return self._stats.to_dict()
