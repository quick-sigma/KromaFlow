"""Model lifecycle manager — loads models into RAM, tracks idle time, and
unloads them after a configurable timeout.

Singleton pattern so that all pipeline steps share the same model instances,
avoiding redundant memory use when multiple images are processed concurrently.
"""

from __future__ import annotations

import enum
import json
import logging
import time
import threading
from pathlib import Path
from typing import Any

import onnxruntime

logger = logging.getLogger(__name__)


# ── Model type registry ------------------------------------------------------


class ModelType(str, enum.Enum):
    """Well-known model identifiers.

    Add new members here when integrating additional models.  Each member's
    value is used as a lookup key and also as the subdirectory name under the
    HuggingFace cache.
    """

    REAL_ESRGAN = "real_esrgan"


# ── Model manager ------------------------------------------------------------


class ModelManager:
    """Thread-safe singleton that manages model lifecycle.

    Typical usage::

        mgr = ModelManager.get_instance()
        session = mgr.get_model(ModelType.REAL_ESRGAN)
        # … run inference …
        mgr.unload_idle_models()          # periodic cleanup

    Models are loaded into RAM on the first call to :meth:`get_model` and
    stay resident until either:

    * :meth:`unload_idle_models` is called and the model has been idle
      (no ``get_model`` calls) for longer than *idle_timeout* seconds, or
    * :meth:`unload` is called explicitly.

    Every call to :meth:`get_model` refreshes the idle timestamp for that
    model so that actively-used models are never unloaded.
    """

    _instance: ModelManager | None = None
    _lock: threading.Lock = threading.Lock()

    def __init__(self, idle_timeout: float = 600.0) -> None:
        """Initialize the manager.

        Parameters
        ----------
        idle_timeout : float
            Seconds of inactivity after which a model is eligible for
            unloading (default 600 = 10 minutes).
        """
        self._idle_timeout = idle_timeout
        # model_type -> (model_object, last_used_timestamp)
        self._models: dict[ModelType, tuple[Any, float]] = {}
        self._model_locks: dict[ModelType, threading.Lock] = {}
        self._manager_lock: threading.Lock = threading.Lock()

    # ── Singleton ────────────────────────────────────────────────────────────

    @classmethod
    def get_instance(cls, idle_timeout: float = 600.0) -> ModelManager:
        """Return the singleton ``ModelManager``, creating it if necessary.

        Parameters
        ----------
        idle_timeout : float
            Ignored if the singleton already exists (the timeout is set at
            first creation only).
        """
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls(idle_timeout=idle_timeout)
        return cls._instance

    # ── Public API ───────────────────────────────────────────────────────────

    def get_model(self, model_type: ModelType) -> Any:
        """Return the model identified by *model_type*, loading it if needed.

        The model's idle timestamp is refreshed so that periodic
        ``unload_idle_models`` calls will not unload it.

        Parameters
        ----------
        model_type : ModelType
            Which model to load / retrieve.

        Returns
        -------
        Any
            The model object (typically an ``onnxruntime.InferenceSession``).
        """
        with self._manager_lock:
            if model_type not in self._model_locks:
                self._model_locks[model_type] = threading.Lock()

        model_lock = self._model_locks[model_type]
        with model_lock:
            if model_type not in self._models:
                logger.info("Loading model %s ...", model_type.value)
                model = self._load_model(model_type)
                self._models[model_type] = (model, time.monotonic())
                logger.info("Model %s loaded successfully", model_type.value)
            else:
                model, _ = self._models[model_type]
                self._models[model_type] = (model, time.monotonic())
            return self._models[model_type][0]

    def unload_idle_models(self) -> int:
        """Unload all models that have been idle for longer than the timeout.

        Returns
        -------
        int
            Number of models unloaded.
        """
        now = time.monotonic()
        unloaded: int = 0

        for model_type in list(self._models.keys()):
            model_lock = self._model_locks.get(model_type)
            if model_lock is None:
                continue
            with model_lock:
                entry = self._models.get(model_type)
                if entry is None:
                    continue
                _, last_used = entry
                if now - last_used >= self._idle_timeout:
                    logger.info(
                        "Unloading idle model %s (idle %.1f s)",
                        model_type.value,
                        now - last_used,
                    )
                    del self._models[model_type]
                    unloaded += 1

        return unloaded

    def unload(self, model_type: ModelType) -> None:
        """Force-unload a specific model immediately.

        Parameters
        ----------
        model_type : ModelType
            Model to unload.
        """
        model_lock = self._model_locks.get(model_type)
        if model_lock is not None:
            with model_lock:
                self._models.pop(model_type, None)
        else:
            self._models.pop(model_type, None)
        logger.info("Model %s unloaded by request", model_type.value)

    def is_loaded(self, model_type: ModelType) -> bool:
        """Check if a model is currently loaded in RAM.

        Parameters
        ----------
        model_type : ModelType
            Model to query.

        Returns
        -------
        bool
            ``True`` if the model is currently resident.
        """
        return model_type in self._models

    @property
    def loaded_models(self) -> list[ModelType]:
        """List of model types currently resident in RAM."""
        return list(self._models.keys())

    # ── Internal helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _load_model(model_type: ModelType) -> Any:
        """Load a model into RAM and return it.

        Parameters
        ----------
        model_type : ModelType
            Identifies which model to load.

        Returns
        -------
        Any
            The loaded model object.
        """
        if model_type == ModelType.REAL_ESRGAN:
            return _load_real_esrgan()

        msg = f"Unknown model type: {model_type}"
        raise ValueError(msg)


# ═══════════════════════════════════════════════════════════════════════════════
# ── Model-specific loaders
# ═══════════════════════════════════════════════════════════════════════════════

_REAL_ESRGAN_HF_REPO = "qualcomm/Real-ESRGAN-General-x4v3"
"""HuggingFace repository ID for the Real-ESRGAN-General-x4v3 model."""

_REAL_ESRGAN_CACHE_DIR = (
    Path.home() / ".cache" / "image-prepare" / "models" / "real_esrgan" / "x4v3-onnx-float"
)
"""Local cache directory for the extracted ONNX model files."""


def _get_real_esrgan_download_url() -> str:
    """Read the ``release_assets.json`` from HuggingFace and return the S3 URL
    for the ONNX float model ZIP.

    Uses the stored Hugging Face token (if any) to support gated models and
    potentially faster downloads.

    Returns
    -------
    str
        Download URL for the model ZIP archive.
    """
    from huggingface_hub import hf_hub_download
    from settings import Settings

    token = Settings.get_instance().hf_token

    local_path = hf_hub_download(
        repo_id=_REAL_ESRGAN_HF_REPO,
        filename="release_assets.json",
        token=token,
    )
    with open(local_path) as f:
        assets = json.load(f)

    url = assets["precisions"]["float"]["universal_assets"]["onnx"]["download_url"]
    return url


def _download_and_extract_zip(url: str, dest: Path) -> Path:
    """Download a ZIP archive from *url* and extract it to *dest*.

    If *dest* already contains an ``.onnx`` file the download is skipped.

    Parameters
    ----------
    url : str
        Remote URL of the ZIP file.
    dest : Path
        Local directory to extract into.

    Returns
    -------
    Path
        Path to the extracted ``.onnx`` file.
    """
    import zipfile

    # Check if already extracted
    onnx_files = list(dest.rglob("*.onnx"))
    if onnx_files:
        logger.debug("Model already extracted at %s, skipping download", dest)
        return onnx_files[0]

    dest.mkdir(parents=True, exist_ok=True)

    # Download
    zip_path = dest / "model.zip"
    logger.info("Downloading model from %s …", url)
    _download_file(url, zip_path)
    logger.info("Download complete (%.1f MB)", zip_path.stat().st_size / 1e6)

    # Extract
    logger.info("Extracting to %s …", dest)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest)

    # Clean up zip
    zip_path.unlink()

    onnx_files = list(dest.rglob("*.onnx"))
    if not onnx_files:
        raise FileNotFoundError(
            f"No .onnx file found after extracting {url} to {dest}"
        )

    return onnx_files[0]


def _download_file(url: str, dest: Path, chunk_size: int = 8 * 1024 * 1024) -> None:
    """Stream *url* to *dest* with a progress log.

    Parameters
    ----------
    url : str
        Remote URL.
    dest : Path
        Local destination path.
    chunk_size : int
        Bytes per chunk (default 8 MB).
    """
    import urllib.request
    import shutil

    with urllib.request.urlopen(url) as response:
        total = int(response.headers.get("Content-Length", 0))
        downloaded = 0
        with open(dest, "wb") as f:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded / total * 100
                    logger.debug(
                        "Download progress: %.1f / %.1f MB (%.0f%%)",
                        downloaded / 1e6,
                        total / 1e6,
                        pct,
                    )


def _create_onnx_session(model_path: Path) -> onnxruntime.InferenceSession:
    """Create an ``onnxruntime.InferenceSession`` with auto-detected providers.

    Tries CUDA first (``onnxruntime-gpu``) and falls back to CPU if CUDA is
    unavailable.

    Parameters
    ----------
    model_path : Path
        Path to the ``.onnx`` model file.

    Returns
    -------
    onnxruntime.InferenceSession
        Ready-to-use inference session.
    """
    available = onnxruntime.get_available_providers()
    logger.debug("Available ONNX providers: %s", available)

    preferred_order = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    providers = [p for p in preferred_order if p in available]

    if not providers:
        providers = ["CPUExecutionProvider"]

    logger.info("Using ONNX providers: %s", providers)

    session_options = onnxruntime.SessionOptions()
    session_options.graph_optimization_level = onnxruntime.GraphOptimizationLevel.ORT_ENABLE_ALL
    session_options.enable_mem_pattern = True

    return onnxruntime.InferenceSession(
        str(model_path),
        sess_options=session_options,
        providers=providers,
    )


def _load_real_esrgan() -> onnxruntime.InferenceSession:
    """Download (if needed) and load the Real-ESRGAN-General-x4v3 ONNX model.

    1. Reads ``release_assets.json`` from HuggingFace to find the S3 download URL.
    2. Downloads the ZIP archive to ``~/.cache/image-prepare/models/real_esrgan/x4v3-onnx-float/``
       (skipped if already extracted).
    3. Extracts the ZIP.
    4. Loads the ``.onnx`` file with ONNX Runtime.

    Returns
    -------
    onnxruntime.InferenceSession
        Inference session ready to run super-resolution.
    """
    logger.info("Resolving Real-ESRGAN model URL …")
    url = _get_real_esrgan_download_url()
    logger.debug("Download URL: %s", url)

    model_path = _download_and_extract_zip(url, _REAL_ESRGAN_CACHE_DIR)
    logger.info("Model onnx path: %s", model_path)

    return _create_onnx_session(model_path)
