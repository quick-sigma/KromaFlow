"""Abstract base classes for the image processing pipeline.

Defines two core abstractions:

* :class:`Processor` – transforms a Pillow ``Image`` according to
  structured instructions.
* :class:`OutputFormatter` – encodes a processed ``Image`` into bytes
  in a requested format.
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
