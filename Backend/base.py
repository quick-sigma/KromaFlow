"""Abstract base classes for the image processing pipeline.

Defines three core abstractions:

* :class:`Processor` – transforms a Pillow ``Image`` according to
  structured instructions.
* :class:`OutputFormatter` – encodes a processed ``Image`` into bytes
  in a requested format.
* :class:`DistributionNode` – takes a processed image and generates
  distribution artifacts (e.g. SRCSet images, zip archives).
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from PIL import Image

from models import ProcessingInstructions


class Processor(ABC):
    """Transforms an image according to structured instructions.

    Implementations should **copy** the input image before mutating it.
    """

    @abstractmethod
    def process(
        self,
        image: Image.Image,
        instructions: ProcessingInstructions,
    ) -> Image.Image:
        """Apply *instructions* to *image* and return the result.

        Parameters
        ----------
        image : Image.Image
            The source image (must not be mutated).
        instructions : ProcessingInstructions
            Describes the transformations to apply.

        Returns
        -------
        Image.Image
            A new image with the transformations applied.
        """
        ...


class OutputFormatter(ABC):
    """Encodes a processed image into bytes in the requested format.

    Also handles format-specific concerns such as alpha-channel
    compositing for formats that do not support transparency.
    """

    @abstractmethod
    def format_output(
        self,
        image: Image.Image,
        output_format: str,
        quality: int | None = None,
    ) -> tuple[bytes, str]:
        """Encode *image* as *output_format* and return ``(bytes, content_type)``.

        Parameters
        ----------
        image : Image.Image
            The (already processed) image to encode.
        output_format : str
            Target format (e.g. ``"png"``, ``"jpeg"``, ``"webp"``).
        quality : int | None
            Compression quality for lossy formats (1-100).

        Returns
        -------
        tuple[bytes, str]
            ``(image_data, mime_type)`` e.g. ``(b"…", "image/png")``.

        Raises
        ------
        ValueError
            If *output_format* is not supported.
        """
        ...


class DistributionNode(ABC):
    """Distributes a processed image into multiple output artifacts.

    Distribution nodes run **after** the output formatter and take the
    already-processed (but not yet encoded) image together with format
    parameters to produce derivative artifacts such as:

    * HTML ``srcset`` image sets at standard breakpoint widths.
    * Zip archives containing multiple format/size variants.
    * Sprite sheets or tile atlases.

    Implementations must be stateless (all state lives in the config).
    """

    @abstractmethod
    def distribute(
        self,
        image: Image.Image,
        output_format: str,
        quality: int | None = None,
        config: object | None = None,
    ) -> dict:
        """Generate distribution artifacts from *image*.

        Parameters
        ----------
        image : Image.Image
            The processed image (before encoding).  Make a **copy** before
            mutating.
        output_format : str
            The target format selected by the output formatter (e.g.
            ``"png"``, ``"jpeg"``, ``"webp"``, ``"avif"``).
        quality : int | None
            Compression quality for lossy formats (1-100).
        config : object | None
            Validated distribution-step configuration.

        Returns
        -------
        dict
            A dictionary describing the distribution artifacts.  Must
            contain at least ``"type"`` (a machine-readable string
            identifying the distribution kind, e.g. ``"srcset"``) and
            ``"artifacts"`` (a list of artifact descriptors).

        Raises
        ------
        ValueError
            If the configuration is invalid or generation fails.
        """
        ...
