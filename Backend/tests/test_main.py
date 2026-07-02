"""Integration tests for the FastAPI application."""

import json
from io import BytesIO
from PIL import Image
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


class TestReadRoot:
    """GET /"""

    def test_read_root(self):
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "Hello World"}


class TestProcessImageEndpoint:
    """POST /api/images/process"""

    # ── Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _make_image_bytes(
        size=(100, 100), color=(255, 0, 0), fmt="PNG"
    ) -> bytes:
        """Create a Pillow image and return its bytes."""
        img = Image.new("RGB", size, color=color)
        buf = BytesIO()
        img.save(buf, format=fmt)
        buf.seek(0)
        return buf.getvalue()

    @staticmethod
    def _upload(
        image_bytes: bytes | None = None,
        filename: str = "test.png",
        recipient: str = "alice",
        instructions: dict | None = None,
        output_format: str = "png",
    ) -> any:
        """Helper to POST a processing request."""
        if image_bytes is None:
            image_bytes = TestProcessImageEndpoint._make_image_bytes()

        return client.post(
            "/api/images/process",
            files={"image": (filename, image_bytes, "image/png")},
            data={
                "recipient": recipient,
                "instructions": json.dumps(instructions or {}),
                "output_format": output_format,
            },
        )

    # ── Happy path ────────────────────────────────────────────────────

    def test_process_image_success(self):
        """Valid request returns processed image with correct content type."""
        response = self._upload()
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"

    def test_process_image_jpeg_output(self):
        """JPEG output returns correct content type and valid image."""
        response = self._upload(output_format="jpeg")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/jpeg"

    def test_process_image_with_instructions(self):
        """Instructions like resize should affect the output."""
        instructions = {"resize": {"width": 50, "height": 50}}
        response = self._upload(instructions=instructions)
        assert response.status_code == 200
        result = Image.open(BytesIO(response.content))
        assert result.size == (50, 50)

    def test_process_image_different_recipient(self):
        """Recipient field is accepted (no auth, just stored)."""
        response = self._upload(recipient="bob@domain.com")
        assert response.status_code == 200

    def test_process_image_webp_output(self):
        """WebP output returns correct content type."""
        response = self._upload(output_format="webp")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/webp"

    def test_process_large_image_with_multiple_operations(self):
        """Combined operations on a larger image."""
        img_bytes = self._make_image_bytes(size=(200, 150))
        instructions = {
            "resize": {"width": 100},
            "rotate": 90,
            "grayscale": True,
        }
        response = self._upload(
            image_bytes=img_bytes,
            instructions=instructions,
        )
        assert response.status_code == 200
        result = Image.open(BytesIO(response.content))
        assert result.size == (150, 100)  # 100 wide rotated 90 => 150x100

    # ── Error handling ────────────────────────────────────────────────

    def test_missing_image_file(self):
        """Request without image file returns 422."""
        response = client.post(
            "/api/images/process",
            data={
                "recipient": "alice",
                "instructions": "{}",
                "output_format": "png",
            },
        )
        assert response.status_code == 422

    def test_missing_recipient(self):
        """Request without recipient returns 422."""
        img_bytes = self._make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
            data={
                "instructions": "{}",
                "output_format": "png",
            },
        )
        assert response.status_code == 422

    def test_invalid_instructions_json(self):
        """Invalid JSON in instructions returns 422."""
        img_bytes = self._make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
            data={
                "recipient": "alice",
                "instructions": "not-valid-json",
                "output_format": "png",
            },
        )
        assert response.status_code == 422

    def test_invalid_instructions_structure(self):
        """Valid JSON but wrong structure for instructions type returns 422."""
        img_bytes = self._make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
            data={
                "recipient": "alice",
                "instructions": '"just a string"',
                "output_format": "png",
            },
        )
        assert response.status_code == 422

    def test_unsupported_output_format(self):
        """Unsupported format returns 400."""
        img_bytes = self._make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
            data={
                "recipient": "alice",
                "instructions": "{}",
                "output_format": "pdf",
            },
        )
        assert response.status_code == 400
        assert "Unsupported output format" in response.text

    def test_invalid_image_file(self):
        """Uploading a non-image file returns 400."""
        response = client.post(
            "/api/images/process",
            files={"image": ("notimage.txt", b"this is not an image", "text/plain")},
            data={
                "recipient": "alice",
                "instructions": "{}",
                "output_format": "png",
            },
        )
        assert response.status_code == 400
        assert "not a valid image" in response.text.lower()

    # ── Watermark removal ─────────────────────────────────────────────

    def test_watermark_removal_flag_accepted(self):
        """The remove_watermark flag is accepted (watermark won't be detected)."""
        instructions = {"remove_watermark": True}
        response = self._upload(instructions=instructions)
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"

    def test_watermark_removal_false_is_noop(self):
        """remove_watermark: false behaves like no flag."""
        instructions = {"remove_watermark": False}
        response = self._upload(instructions=instructions)
        assert response.status_code == 200
