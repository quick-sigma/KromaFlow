"""Step abstraction layer — wraps Processors and OutputFormatters as pipeline nodes.

This module provides the metadata and configuration infrastructure to
expose pipeline steps to the frontend:

* :class:`Step` — a generic wrapper that carries metadata and a Pydantic
  configuration schema, and delegates execution to the underlying
  :class:`~base.Processor` or :class:`~base.OutputFormatter`.

* :class:`StepVariant` — an ``enum`` that distinguishes processor steps
  from output-formatter steps.

* :class:`StepInfo` — a Pydantic model used to serialize step metadata
  for the ``GET /api/steps`` endpoint.

* :func:`register` — a decorator that registers a ``Step`` subclass for
  automatic API discovery.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Generic, TypeVar

from pydantic import BaseModel

if TYPE_CHECKING:
    from PIL import Image

    from base import OutputFormatter, Processor

# ── Type variable -----------------------------------------------------------

ConfigT = TypeVar("ConfigT", bound=BaseModel)
"""Type variable bound to ``BaseModel`` for step configuration schemas."""


# ── Variant enum ------------------------------------------------------------


class StepVariant(str, enum.Enum):
    """Indicates whether a :class:`Step` wraps a ``Processor`` or an ``OutputFormatter``.

    Used by the frontend to render the appropriate configuration UI.
    """

    PROCESSOR = "processor"
    OUTPUT_FORMATTER = "output_formatter"


# ── Frontend-facing metadata model ------------------------------------------


class StepInfo(BaseModel):
    """Serialisable metadata about a step, sent to the frontend via ``GET /api/steps``.

    Attributes
    ----------
    name : str
        Unique identifier for the step (e.g. ``"resize"``).
    description : str
        Human-readable description of what the step does.
    version : str
        Semantic version string (e.g. ``"1.0.0"``).
    variant : StepVariant
        ``"processor"`` or ``"output_formatter"``.
    config_schema : dict
        `JSON Schema <https://json-schema.org/>`_ representation of the
        step's configuration model.  The frontend uses this to render a
        dynamic configuration form.
    """

    name: str
    description: str
    version: str
    variant: StepVariant
    config_schema: dict


# ── Global registry ---------------------------------------------------------

_registry: dict[str, type[Step]] = {}
"""Maps step name → Step subclass for API discovery.

Populated by the :func:`register` decorator.
"""


def register(
    name: str,
    description: str,
    version: str = "1.0.0",
) -> callable:
    """Decorator that registers a :class:`Step` subclass for API discovery.

    The decorated class **must** be a concrete subclass of ``Step``.  Its
    metadata (name, description, version) will be returned by the
    ``GET /api/steps`` endpoint.

    Parameters
    ----------
    name : str
        Unique step name (used as the key in the registry).
    description : str
        Human-readable description shown in the frontend.
    version : str
        Semantic version string (default ``"1.0.0"``).

    Returns
    -------
    callable
        The original class (the decorator does **not** replace it).

    Example
    -------
    ::

        @register(
            name="resize",
            description="Resize an image to the specified dimensions",
            version="2.0.0",
        )
        class ResizeStep(Step[ResizeConfig]):
            ...
    """

    def decorator(cls: type[Step]) -> type[Step]:
        if not issubclass(cls, Step):
            raise TypeError(
                f"@{__name__}.register can only be applied to Step subclasses, "
                f"got {cls.__name__}"
            )
        cls._registration_name = name
        _registry[name] = cls
        return cls

    return decorator


def get_registered_steps() -> list[StepInfo]:
    """Return metadata for every registered step.

    Each registered class is instantiated (with no arguments) and its
    :meth:`Step.info` is collected.  If instantiation fails, the step is
    silently skipped and a warning is logged.

    Returns
    -------
    list[StepInfo]
        Ordered list of step metadata (sorted by name).
    """
    import logging

    logger = logging.getLogger(__name__)
    result: list[StepInfo] = []

    for name, cls in sorted(_registry.items()):
        try:
            instance = cls()
            result.append(instance.info())
        except Exception:
            logger.warning("Failed to instantiate registered step %r", name, exc_info=True)

    return result


# ── Step — the core abstraction ---------------------------------------------


class Step(Generic[ConfigT]):
    """Wraps a :class:`~base.Processor` or :class:`~base.OutputFormatter`
    into a pipeline node with discoverable metadata.

    Each ``Step`` carries:

    * a **variant** (:attr:`StepVariant.PROCESSOR` or
      :attr:`StepVariant.OUTPUT_FORMATTER`) that tells the frontend what
      kind of step this is;
    * a **name**, **description**, and **version** for display and
      API communication;
    * a **config_schema** — a :class:`pydantic.BaseModel` subclass whose
      JSON Schema is served to the frontend so it can render a
      configuration form;
    * an **execute** method that delegates to the wrapped component.

    Parameters
    ----------
    component : Processor | OutputFormatter
        The wrapped processor or output-formatter instance.
    variant : StepVariant
        ``PROCESSOR`` or ``OUTPUT_FORMATTER``.
    name : str
        Unique step name.
    description : str
        Human-readable description.
    version : str
        Semantic version string.
    config_schema : type[ConfigT]
        A ``BaseModel`` subclass that validates this step's configuration.
    """

    def __init__(
        self,
        component: Processor | OutputFormatter,
        *,
        variant: StepVariant,
        name: str,
        description: str,
        version: str,
        config_schema: type[ConfigT],
    ) -> None:
        self._component = component
        self.variant = variant
        self.name = name
        self.description = description
        self.version = version
        self.config_schema = config_schema

    def execute(
        self,
        image: Image.Image,
        config: ConfigT | None = None,
        /,
        **kwargs,
    ) -> Image.Image | tuple[bytes, str]:
        """Run this step on *image* with the provided *config*.

        The default implementation dispatches based on :attr:`variant`:

        * **PROCESSOR** steps call ``component.process(image, config)``.
        * **OUTPUT_FORMATTER** steps call
          ``component.format_output(image, output_format, quality)``
          where ``output_format`` and ``quality`` are read from
          ``**kwargs`` (defaulting to ``"png"`` and ``None``).

        Subclasses may override this method to implement custom
        dispatch logic.

        Parameters
        ----------
        image : PIL.Image.Image
            The image to process or format.
        config : ConfigT | None
            Validated configuration for this step.  May be ``None`` for
            steps that need no configuration.
        **kwargs
            Additional runtime parameters.  For output-formatter steps
            the recognised keys are ``output_format`` (str) and
            ``quality`` (int | None).

        Returns
        -------
        PIL.Image.Image | tuple[bytes, str]
            A processed image for processor steps, or
            ``(encoded_bytes, content_type)`` for output-formatter steps.

        Raises
        ------
        ValueError
            If the step variant is unknown.
        """
        if self.variant == StepVariant.PROCESSOR:
            return self._component.process(image, config)

        if self.variant == StepVariant.OUTPUT_FORMATTER:
            fmt = kwargs.get("output_format", "png")
            quality = kwargs.get("quality")
            return self._component.format_output(image, fmt, quality)

        msg = f"Unknown step variant: {self.variant!r}"
        raise ValueError(msg)

    def info(self) -> StepInfo:
        """Return serialisable metadata for this step.

        The returned :class:`StepInfo` object is JSON-compatible and
        includes the JSON Schema of the step's configuration model.
        """
        return StepInfo(
            name=self.name,
            description=self.description,
            version=self.version,
            variant=self.variant,
            config_schema=self.config_schema.model_json_schema(),
        )

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"name={self.name!r}, "
            f"variant={self.variant.value!r}, "
            f"version={self.version!r})"
        )
