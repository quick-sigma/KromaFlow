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

* :class:`Pipeline` — executes a validated sequence of steps following
  the rule: **at least one Processor, exactly one OutputFormatter (last)**.

* :func:`pipeline_from_steps` — creates a ``Pipeline`` from a list of
  step IDs using the global step-ID registry.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Any, Generic, TypeVar

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
    id : str
        Machine-readable identifier for the step (e.g. ``"img_proc"``).
        Used by the frontend to reference steps when building pipelines.
    name : str
        Human-readable display name (e.g. ``"Image Processor"``).
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

    id: str
    name: str
    description: str
    version: str
    variant: StepVariant
    config_schema: dict


# ── Global registries -------------------------------------------------------

_registry: dict[str, type[Step]] = {}
"""Maps step **name** → Step subclass for API discovery (by display name).

Populated by the :func:`register` decorator.
"""

_step_id_map: dict[str, type[Step]] = {}
"""Maps step **ID** → Step subclass for pipeline construction.

The ID is a short machine-readable string (e.g. ``"img_proc"``) used by
the frontend and by :func:`pipeline_from_steps` to identify steps when
assembling a :class:`Pipeline`.
"""


def register(
    id: str,
    name: str,
    description: str,
    version: str = "1.0.0",
) -> callable:
    """Decorator that registers a :class:`Step` subclass for API discovery.

    The decorated class **must** be a concrete subclass of ``Step``.  Its
    metadata (id, name, description, version) will be returned by the
    ``GET /api/steps`` endpoint and it becomes available for pipeline
    construction via :func:`pipeline_from_steps`.

    Parameters
    ----------
    id : str
        Machine-readable identifier (e.g. ``"img_proc"``).  Used as the
        lookup key in ``_step_id_map``.
    name : str
        Human-readable display name (e.g. ``"Image Processor"``).  Used
        as the lookup key in ``_registry``.
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
            id="resize",
            name="Resize",
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
        cls._registration_id = id
        _step_id_map[id] = cls
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
    * an **id** and **name** — the id is a machine-readable key for
      pipeline construction, while name is a human-readable label;
    * a **description** and **version** for display and API communication;
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
    id : str
        Machine-readable pipeline identifier.
    name : str
        Human-readable display name.
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
        id: str,
        name: str,
        description: str,
        version: str,
        config_schema: type[ConfigT],
    ) -> None:
        self._component = component
        self.variant = variant
        self.id = id
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
            id=self.id,
            name=self.name,
            description=self.description,
            version=self.version,
            variant=self.variant,
            config_schema=self.config_schema.model_json_schema(),
        )

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"id={self.id!r}, "
            f"name={self.name!r}, "
            f"variant={self.variant.value!r})"
        )


# ═══════════════════════════════════════════════════════════════════════════
# ── Pipeline
# ═══════════════════════════════════════════════════════════════════════════


class Pipeline:
    """A validated sequence of :class:`Step` instances.

    Validation rules (enforced at construction time):

    1. At least one :attr:`StepVariant.PROCESSOR` step.
    2. Exactly one :attr:`StepVariant.OUTPUT_FORMATTER` step.
    3. The output-formatter step **must** be the last step in the list.

    Parameters
    ----------
    steps : list[Step]
        Ordered list of steps to execute in sequence.

    Raises
    ------
    ValueError
        If any of the validation rules are violated.
    """

    def __init__(self, steps: list[Step]) -> None:
        if not steps:
            raise ValueError("Pipeline must contain at least one step")

        processor_count = 0
        formatter_count = 0

        for i, step in enumerate(steps):
            if step.variant == StepVariant.PROCESSOR:
                processor_count += 1
            elif step.variant == StepVariant.OUTPUT_FORMATTER:
                formatter_count += 1
                if i != len(steps) - 1:
                    raise ValueError(
                        f"Output formatter step {step.id!r} must be the last step "
                        f"in the pipeline, but it is at position {i} "
                        f"(0-based, total steps: {len(steps)})"
                    )

        if processor_count < 1:
            raise ValueError(
                f"Pipeline must have at least one Processor step, "
                f"got {processor_count}"
            )

        if formatter_count != 1:
            raise ValueError(
                f"Pipeline must have exactly one OutputFormatter step, "
                f"got {formatter_count}"
            )

        self._steps = list(steps)

    @property
    def steps(self) -> list[Step]:
        """Return a copy of the internal step list."""
        return list(self._steps)

    @property
    def step_count(self) -> int:
        """Total number of steps in the pipeline."""
        return len(self._steps)

    @property
    def processor_count(self) -> int:
        """Number of Processor steps."""
        return sum(1 for s in self._steps if s.variant == StepVariant.PROCESSOR)

    @property
    def formatter(self) -> Step:
        """Return the single OutputFormatter step."""
        for s in self._steps:
            if s.variant == StepVariant.OUTPUT_FORMATTER:
                return s
        raise RuntimeError("Pipeline has no output formatter (validation invariant broken)")

    def execute(
        self,
        image: Image.Image,
        configs: dict[str, Any] | None = None,
    ) -> tuple[bytes, str]:
        """Run every step in sequence.

        The output of each Processor step is fed as input to the next
        step.  The final OutputFormatter step produces the returned
        ``(bytes, content_type)``.

        Parameters
        ----------
        image : PIL.Image.Image
            Input image to process.
        configs : dict[str, Any] | None
            Mapping from **step ID** to configuration object.  Steps
            without an entry in this dict receive ``None`` as config.

        Returns
        -------
        tuple[bytes, str]
            ``(encoded_image_bytes, mime_type_string)``.
        """
        configs = configs or {}
        current = image

        for step in self._steps:
            cfg = configs.get(step.id)
            # If no config was supplied, try an empty default so that
            # steps with all-optional fields work out of the box.
            if cfg is None:
                try:
                    cfg = step.config_schema()
                except Exception:  # noqa: S110
                    pass

            if step.variant == StepVariant.PROCESSOR:
                current = step.execute(current, cfg)  # type: ignore[assignment]
            else:
                # Output formatter — extract format/quality from config or kwargs
                fmt = (
                    getattr(cfg, "format", None)
                    if cfg is not None
                    else None
                ) or "png"
                quality = (
                    getattr(cfg, "quality", None) if cfg is not None else None
                )
                return step.execute(
                    current,
                    cfg,
                    output_format=fmt,
                    quality=quality,
                )  # type: ignore[return-value]

        raise RuntimeError(
            "Pipeline ended without reaching the output formatter "
            "(validation invariant broken)"
        )

    def __repr__(self) -> str:
        ids = [s.id for s in self._steps]
        return (
            f"Pipeline(steps={ids}, "
            f"processors={self.processor_count}, "
            f"formatter={self.formatter.id})"
        )


# ── Pipeline factory --------------------------------------------------------


def pipeline_from_steps(step_ids: list[str]) -> Pipeline:
    """Create a :class:`Pipeline` from a list of step IDs.

    Each ID is looked up in the :data:`_step_id_map` populated by
    the :func:`register` decorator.

    Parameters
    ----------
    step_ids : list[str]
        Ordered list of step identifiers (as passed to ``@register(id=…)``).

    Returns
    -------
    Pipeline
        A new validated pipeline.

    Raises
    ------
    ValueError
        If any ID is not registered, or if the pipeline validation fails.
    """
    steps: list[Step] = []

    for sid in step_ids:
        cls = _step_id_map.get(sid)
        if cls is None:
            available = sorted(_step_id_map)
            raise ValueError(
                f"Unknown step ID {sid!r}. "
                f"Available IDs: {available}"
            )
        try:
            steps.append(cls())
        except Exception as exc:
            raise ValueError(
                f"Failed to instantiate step {sid!r}: {exc}"
            ) from exc

    return Pipeline(steps)
