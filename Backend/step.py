"""Step abstraction layer — wraps Processors, OutputFormatters, and DistributionNodes as pipeline nodes.

This module provides the metadata and configuration infrastructure to
expose pipeline steps to the frontend:

* :class:`Step` — a generic wrapper that carries metadata and a Pydantic
  configuration schema, and delegates execution to the underlying
  component.

* :class:`StepVariant` — an ``enum`` that distinguishes processor,
  output-formatter, and distribution steps.

* :class:`StepInfo` — a Pydantic model used to serialize step metadata
  for the ``GET /api/steps`` endpoint.

* :func:`register` — a decorator that registers a ``Step`` subclass for
  automatic API discovery.

* :class:`Pipeline` — executes a validated sequence of steps following
  the rules: **at least one Processor, exactly one OutputFormatter,
  optional Distribution nodes after the formatter**.

* :class:`PipelineResult` — the result of pipeline execution, containing
  the primary output bytes and any distribution artifacts.

* :func:`pipeline_from_steps` — creates a ``Pipeline`` from a list of
  step IDs using the global step-ID registry.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Any, Generic, TypeVar

from pydantic import BaseModel

if TYPE_CHECKING:
    from PIL import Image

    from base import DistributionNode, OutputFormatter, Processor

# ── Type variable -----------------------------------------------------------

ConfigT = TypeVar("ConfigT", bound=BaseModel)
"""Type variable bound to ``BaseModel`` for step configuration schemas."""


# ── Variant enum ------------------------------------------------------------


class StepVariant(str, enum.Enum):
    """Indicates what kind of component a :class:`Step` wraps.

    Used by the frontend to render the appropriate configuration UI and
    by :class:`Pipeline` to enforce ordering constraints.
    """

    PROCESSOR = "processor"
    """Wraps a :class:`~base.Processor` — transforms an image."""

    OUTPUT_FORMATTER = "output_formatter"
    """Wraps a :class:`~base.OutputFormatter` — encodes an image to bytes."""

    DISTRIBUTION = "distribution"
    """Wraps a :class:`~base.DistributionNode` — generates distribution artifacts."""


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
    is_base_node : bool
        If ``True`` this step must be the first step in the pipeline
        (position 0).  The frontend auto‑positions such steps and
        labels them with "Base" instead of a numeric index.
    repeatable : bool
        If ``True`` this step can appear more than once in a pipeline.
        The frontend will not exclude it from the search results even
        when it is already in the pipeline.
    """

    id: str
    name: str
    description: str
    version: str
    variant: StepVariant
    config_schema: dict
    is_base_node: bool = False
    repeatable: bool = False

    @property
    def has_configurable_options(self) -> bool:
        """``True`` if this step exposes at least one configuration field.

        The frontend uses this to decide whether to enable the settings
        (gear) button when displaying the step in the pipeline graph.
        """
        properties = self.config_schema.get("properties", {})
        return len(properties) > 0


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
    """Wraps a :class:`~base.Processor`, :class:`~base.OutputFormatter`,
    or :class:`~base.DistributionNode` into a pipeline node with discoverable
    metadata.

    Each ``Step`` carries:

    * a **variant** (:attr:`StepVariant.PROCESSOR`,
      :attr:`StepVariant.OUTPUT_FORMATTER`, or
      :attr:`StepVariant.DISTRIBUTION`) that tells the frontend what
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
    component : Processor | OutputFormatter | DistributionNode
        The wrapped component instance.
    variant : StepVariant
        ``PROCESSOR``, ``OUTPUT_FORMATTER``, or ``DISTRIBUTION``.
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
    is_base_node : bool
        If ``True`` this step must be the first step in the pipeline.
    repeatable : bool
        If ``True`` this step can appear more than once in a pipeline.
        The frontend will not exclude it from the search results even
        when it is already in the pipeline (default ``False``).
    """

    def __init__(
        self,
        component: Processor | OutputFormatter | DistributionNode,
        *,
        variant: StepVariant,
        id: str,
        name: str,
        description: str,
        version: str,
        config_schema: type[ConfigT],
        is_base_node: bool = False,
        repeatable: bool = False,
    ) -> None:
        self._component = component
        self.variant = variant
        self.id = id
        self.name = name
        self.description = description
        self.version = version
        self.config_schema = config_schema
        self.is_base_node = is_base_node
        self.repeatable = repeatable

    def execute(
        self,
        image: Image.Image,
        config: ConfigT | None = None,
        /,
        **kwargs,
    ) -> Image.Image | tuple[bytes, str] | dict:
        """Run this step on *image* with the provided *config*.

        The default implementation dispatches based on :attr:`variant`:

        * **PROCESSOR** steps call ``component.process(image, config)``.
        * **OUTPUT_FORMATTER** steps call
          ``component.format_output(image, output_format, quality)``
          where ``output_format`` and ``quality`` are read from
          ``**kwargs`` (defaulting to ``"png"`` and ``None``).
        * **DISTRIBUTION** steps call
          ``component.distribute(image, output_format, quality, config)``.

        Subclasses may override this method to implement custom
        dispatch logic.

        Parameters
        ----------
        image : PIL.Image.Image
            The image to process, format, or distribute.
        config : ConfigT | None
            Validated configuration for this step.  May be ``None`` for
            steps that need no configuration.
        **kwargs
            Additional runtime parameters.  For output-formatter steps
            the recognised keys are ``output_format`` (str) and
            ``quality`` (int | None).  Distribution steps receive the
            same keys forwarded from the output formatter.

        Returns
        -------
        PIL.Image.Image | tuple[bytes, str] | dict
            A processed image for processor steps,
            ``(encoded_bytes, content_type)`` for output-formatter steps,
            or a distribution artifact dict for distribution steps.

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

        if self.variant == StepVariant.DISTRIBUTION:
            fmt = kwargs.get("output_format", "png")
            quality = kwargs.get("quality")
            return self._component.distribute(
                image, output_format=fmt, quality=quality, config=config
            )

        msg = f"Unknown step variant: {self.variant!r}"
        raise ValueError(msg)

    @property
    def default_format(self) -> str:
        """Format string used when the step's config doesn't specify one.

        Subclasses that wrap a format-specific ``OutputFormatter`` (e.g.
        AVIF) should override this to return the correct format identifier.
        """
        return "png"

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
            is_base_node=self.is_base_node,
            repeatable=self.repeatable,
        )

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"id={self.id!r}, "
            f"name={self.name!r}, "
            f"variant={self.variant.value!r})"
        )


# ═══════════════════════════════════════════════════════════════════════════
# ── PipelineResult
# ═══════════════════════════════════════════════════════════════════════════


class PipelineResult:
    """Result of executing a :class:`Pipeline`.

    Supports tuple unpacking ``(output_bytes, content_type)`` for backward
    compatibility with callers that do not use distribution steps, while
    also exposing :attr:`distributions` for callers that need them.

    Parameters
    ----------
    output_bytes : bytes
        The primary encoded image bytes from the output formatter.
    content_type : str
        MIME type of the primary output.
    distributions : dict[str, Any] | None
        Mapping from distribution step ID to its artifact dict.
    """

    def __init__(
        self,
        output_bytes: bytes,
        content_type: str,
        distributions: dict[str, Any] | None = None,
    ) -> None:
        self.output_bytes = output_bytes
        self.content_type = content_type
        self.distributions = distributions or {}

    def __iter__(self):
        """Allow tuple unpacking: ``data, ctype = pipeline.execute(...)``."""
        return iter((self.output_bytes, self.content_type))

    def __getitem__(self, index: int) -> bytes | str:
        """Support index access for backward compatibility."""
        return (self.output_bytes, self.content_type)[index]

    def __repr__(self) -> str:
        dist_keys = list(self.distributions)
        return (
            f"PipelineResult("
            f"output_bytes={len(self.output_bytes)} bytes, "
            f"content_type={self.content_type!r}, "
            f"distributions={dist_keys})"
        )


# ═══════════════════════════════════════════════════════════════════════════
# ── Pipeline
# ═══════════════════════════════════════════════════════════════════════════


class Pipeline:
    """A validated sequence of :class:`Step` instances.

    Validation rules (enforced at construction time):

    1. At least one :attr:`StepVariant.PROCESSOR` step.
    2. Exactly one :attr:`StepVariant.OUTPUT_FORMATTER` step.
    3. The output-formatter step **must** be the last **non-distribution**
       step (distribution steps may follow it).
    4. Distribution steps (if present) must all come **after** the output
       formatter.
    5. At most one :attr:`is_base_node` step, which must be **first**.

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
        distribution_count = 0
        base_node_count = 0
        found_formatter = False

        for i, step in enumerate(steps):
            if step.variant == StepVariant.PROCESSOR:
                if found_formatter:
                    raise ValueError(
                        f"Processor step {step.id!r} cannot appear after the output "
                        f"formatter (position {i})"
                    )
                processor_count += 1

            elif step.variant == StepVariant.OUTPUT_FORMATTER:
                if found_formatter:
                    raise ValueError(
                        f"Pipeline cannot have more than one OutputFormatter step, "
                        f"got a second one at position {i} ({step.id!r})"
                    )
                formatter_count += 1
                found_formatter = True

            elif step.variant == StepVariant.DISTRIBUTION:
                if not found_formatter:
                    raise ValueError(
                        f"Distribution step {step.id!r} must appear after the output "
                        f"formatter, but no formatter has been seen yet (position {i})"
                    )
                distribution_count += 1

            if step.is_base_node:
                base_node_count += 1
                if i != 0:
                    raise ValueError(
                        f"Base node step {step.id!r} must be the first step "
                        f"in the pipeline, but it is at position {i} "
                        f"(0-based, total steps: {len(steps)})"
                    )

        if base_node_count > 1:
            raise ValueError(
                f"Pipeline must have at most one base node step, "
                f"got {base_node_count}"
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

    @property
    def base_node(self) -> Step | None:
        """Return the base node step if one exists, otherwise ``None``."""
        for s in self._steps:
            if s.is_base_node:
                return s
        return None

    @property
    def distribution_steps(self) -> list[Step]:
        """Return all distribution steps in order."""
        return [s for s in self._steps if s.variant == StepVariant.DISTRIBUTION]

    @property
    def has_distribution(self) -> bool:
        """``True`` if the pipeline includes at least one distribution step."""
        return any(s.variant == StepVariant.DISTRIBUTION for s in self._steps)

    def execute(
        self,
        image: Image.Image,
        configs: dict[str, Any] | None = None,
    ) -> PipelineResult:
        """Run every step in sequence.

        Processors run first (image → image), then the output formatter
        (image → encoded bytes), then any distribution steps (generate
        artifacts from the processed image).

        Parameters
        ----------
        image : PIL.Image.Image
            Input image to process.
        configs : dict[str, Any] | None
            Mapping from **step ID** to configuration object.  Steps
            without an entry in this dict receive ``None`` as config.

        Returns
        -------
        PipelineResult
            An object with :attr:`output_bytes`, :attr:`content_type`,
            and :attr:`distributions`.  Supports tuple unpacking as
            ``(bytes, content_type)`` for backward compatibility.
        """
        configs = configs or {}
        current = image
        last_fmt: str | None = None
        last_quality: int | None = None
        output_bytes: bytes | None = None
        content_type: str | None = None
        distributions: dict[str, Any] = {}

        for step in self._steps:
            raw = configs.get(step.id)
            # Support list-based configs for repeatable steps (same step_id
            # appearing multiple times in the pipeline).  Each element is
            # consumed in order by each step instance.
            if isinstance(raw, list):
                cfg = raw.pop(0) if raw else None
            else:
                cfg = raw

            # If no config was supplied, try an empty default so that
            # steps with all-optional fields work out of the box.
            if cfg is None:
                try:
                    cfg = step.config_schema()
                except Exception:  # noqa: S110
                    pass

            if step.variant == StepVariant.PROCESSOR:
                current = step.execute(current, cfg)  # type: ignore[assignment]

            elif step.variant == StepVariant.OUTPUT_FORMATTER:
                # Extract format/quality from config
                fmt = (
                    getattr(cfg, "format", None)
                    if cfg is not None
                    else None
                )
                if fmt is None:
                    fmt = step.default_format
                quality = (
                    getattr(cfg, "quality", None) if cfg is not None else None
                )
                last_fmt = fmt
                last_quality = quality

                data, ctype = step.execute(
                    current,
                    cfg,
                    output_format=fmt,
                    quality=quality,
                )
                # Store the primary output; keep `current` as the PIL image
                # for distribution steps.
                output_bytes = data  # type: ignore[assignment]
                content_type = ctype  # type: ignore[assignment]

            elif step.variant == StepVariant.DISTRIBUTION:
                result = step.execute(
                    current,
                    cfg,
                    output_format=last_fmt or "png",
                    quality=last_quality,
                )
                # Distribution steps return dicts
                if not isinstance(result, dict):
                    raise RuntimeError(
                        f"Distribution step {step.id!r} returned {type(result).__name__}, "
                        f"expected dict"
                    )
                distributions[step.id] = result

        # Ensure output was produced
        if output_bytes is None or content_type is None:
            raise RuntimeError(
                "Pipeline ended without reaching the output formatter "
                "(validation invariant broken)"
            )

        return PipelineResult(
            output_bytes=output_bytes,
            content_type=content_type,
            distributions=distributions,
        )

    def __repr__(self) -> str:
        ids = [s.id for s in self._steps]
        dist_count = sum(1 for s in self._steps if s.variant == StepVariant.DISTRIBUTION)
        parts = [
            f"Pipeline(steps={ids}",
            f"processors={self.processor_count}",
            f"formatter={self.formatter.id}",
        ]
        if dist_count:
            parts.append(f"distributions={dist_count}")
        return ", ".join(parts) + ")"


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
