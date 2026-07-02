"""In-memory settings store for runtime configuration.

Thread-safe singleton that holds settings like the Hugging Face token.
This lives only in memory and is not persisted to disk — the frontend
is responsible for persisting and re-sending the token on reconnect.

Usage
-----
::

    from settings import Settings

    settings = Settings.get_instance()
    settings.hf_token = "hf_..."
    if settings.has_hf_token:
        token = settings.hf_token
"""

from __future__ import annotations

import logging
import threading

logger = logging.getLogger(__name__)


class Settings:
    """Thread-safe singleton for runtime settings."""

    _instance: Settings | None = None
    _lock: threading.Lock = threading.Lock()

    def __init__(self) -> None:
        self._hf_token: str | None = None
        self._settings_lock: threading.Lock = threading.Lock()

    # ── Singleton ────────────────────────────────────────────────────────────

    @classmethod
    def get_instance(cls) -> Settings:
        """Return the singleton ``Settings``, creating it if necessary."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ── Hugging Face token ───────────────────────────────────────────────────

    @property
    def hf_token(self) -> str | None:
        """The currently stored Hugging Face token, or ``None``."""
        with self._settings_lock:
            return self._hf_token

    @hf_token.setter
    def hf_token(self, token: str | None) -> None:
        """Set (or clear) the Hugging Face token.

        Parameters
        ----------
        token : str | None
            The token to store, or ``None`` / empty string to clear.
        """
        with self._settings_lock:
            self._hf_token = token if token else None
        if self._hf_token:
            logger.info(
                "Hugging Face token configured (length=%d)", len(self._hf_token)
            )
        else:
            logger.info("Hugging Face token cleared")

    @property
    def has_hf_token(self) -> bool:
        """``True`` if a non-empty token is currently stored."""
        with self._settings_lock:
            return bool(self._hf_token)
