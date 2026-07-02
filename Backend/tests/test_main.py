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
        pipeline: list[dict] | None = None,
    ) -> any:
        """Helper to POST a processing request with a pipeline definition."""
        if image_bytes is None:
            image_bytes = TestProcessImageEndpoint._make_image_bytes()

        if pipeline is None:
            pipeline = [
                {"step_id": "img_proc", "config": {}},
                {"step_id": "img_fmt", "config": {"format": "png"}},
            ]

        return client.post(
            "/api/images/process",
            files={"image": (filename, image_bytes, "image/png")},
            data={
                "pipeline": json.dumps(pipeline),
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
        response = self._upload(pipeline=[
            {"step_id": "img_proc", "config": {}},
            {"step_id": "img_fmt", "config": {"format": "jpeg", "quality": 80}},
        ])
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/jpeg"

    def test_process_image_with_config(self):
        """Config like grayscale should affect the output."""
        response = self._upload(pipeline=[
            {"step_id": "img_proc", "config": {"grayscale": True}},
            {"step_id": "img_fmt", "config": {"format": "png"}},
        ])
        assert response.status_code == 200
        result = Image.open(BytesIO(response.content))
        assert result.mode == "L"  # grayscale

    def test_process_image_webp_output(self):
        """WebP output returns correct content type."""
        response = self._upload(pipeline=[
            {"step_id": "img_proc", "config": {}},
            {"step_id": "img_fmt", "config": {"format": "webp", "quality": 85}},
        ])
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/webp"

    def test_process_large_image_with_multiple_operations(self):
        """Combined operations on a larger image."""
        img_bytes = self._make_image_bytes(size=(200, 150))
        response = self._upload(
            image_bytes=img_bytes,
            pipeline=[
                {"step_id": "img_proc", "config": {
                    "resize_width": 100,
                    "rotate": 90,
                    "grayscale": True,
                }},
                {"step_id": "img_fmt", "config": {"format": "png"}},
            ],
        )
        assert response.status_code == 200
        result = Image.open(BytesIO(response.content))
        assert result.size == (150, 100)  # 100 wide rotated 90 => 150x100
        assert result.mode == "L"  # grayscale

    # ── Error handling ────────────────────────────────────────────────

    def test_missing_image_file(self):
        """Request without image file returns 422."""
        response = client.post(
            "/api/images/process",
            data={
                "pipeline": json.dumps([{"step_id": "img_proc", "config": {}}]),
            },
        )
        assert response.status_code == 422

    def test_missing_pipeline(self):
        """Request without pipeline field returns 422."""
        img_bytes = self._make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
        )
        assert response.status_code == 422

    def test_invalid_pipeline_json(self):
        """Invalid JSON in pipeline returns 422."""
        img_bytes = self._make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
            data={"pipeline": "not-valid-json"},
        )
        assert response.status_code == 422

    def test_pipeline_not_a_list(self):
        """Pipeline JSON must be an array."""
        img_bytes = self._make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
            data={"pipeline": json.dumps({"step_id": "img_proc"})},
        )
        assert response.status_code == 422

    def test_pipeline_empty_list(self):
        """Empty pipeline returns 422."""
        img_bytes = self._make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
            data={"pipeline": json.dumps([])},
        )
        assert response.status_code == 422

    def test_unknown_step_id(self):
        """Unknown step ID returns 400."""
        img_bytes = self._make_image_bytes()
        response = self._upload(
            image_bytes=img_bytes,
            pipeline=[{"step_id": "nonexistent", "config": {}}],
        )
        assert response.status_code == 400
        assert "Unknown step ID" in response.text

    def test_invalid_step_config_type(self):
        """Config with wrong types returns 422."""
        img_bytes = self._make_image_bytes()
        response = self._upload(
            image_bytes=img_bytes,
            pipeline=[
                {"step_id": "img_proc", "config": {}},
                {"step_id": "img_fmt", "config": {"quality": "not-a-number"}},
            ],
        )
        assert response.status_code == 422
        assert "Invalid config" in response.text

    def test_unsupported_format_at_runtime(self):
        """Format that passes Pydantic validation but is rejected at execution."""
        img_bytes = self._make_image_bytes()
        response = self._upload(
            image_bytes=img_bytes,
            pipeline=[
                {"step_id": "img_proc", "config": {}},
                {"step_id": "img_fmt", "config": {"format": "invalid_format"}},
            ],
        )
        assert response.status_code == 400
        assert "Unsupported output format" in response.text

    def test_no_processor_pipeline(self):
        """Pipeline without a processor step returns 422."""
        img_bytes = self._make_image_bytes()
        response = self._upload(
            image_bytes=img_bytes,
            pipeline=[{"step_id": "img_fmt", "config": {"format": "png"}}],
        )
        assert response.status_code == 422
        assert "at least one Processor" in response.text

    def test_invalid_image_file(self):
        """Uploading a non-image file returns 400."""
        response = client.post(
            "/api/images/process",
            files={"image": ("notimage.txt", b"this is not an image", "text/plain")},
            data={
                "pipeline": json.dumps([
                    {"step_id": "img_proc", "config": {}},
                    {"step_id": "img_fmt", "config": {"format": "png"}},
                ]),
            },
        )
        assert response.status_code == 400
        assert "not a valid image" in response.text.lower()

    # ── Watermark removal via pipeline step ───────────────────────────

    def test_watermark_removal_step(self):
        """Pipeline with wm_remover step (no watermark to detect)."""
        response = self._upload(pipeline=[
            {"step_id": "wm_remover", "config": {}},
            {"step_id": "img_fmt", "config": {"format": "png"}},
        ])
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"

    # ── AVIF output via pipeline step ─────────────────────────────────

    def test_avif_output_success(self):
        """AVIF output returns correct content type."""
        response = self._upload(pipeline=[
            {"step_id": "img_proc", "config": {}},
            {"step_id": "avif_fmt", "config": {"quality": 85}},
        ])
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/avif"
        result = Image.open(BytesIO(response.content))
        assert result.format == "AVIF"

    def test_avif_output_with_grayscale(self):
        """AVIF with grayscale config works correctly."""
        response = self._upload(pipeline=[
            {"step_id": "img_proc", "config": {"grayscale": True}},
            {"step_id": "avif_fmt", "config": {"quality": 85}},
        ])
        assert response.status_code == 200
        result = Image.open(BytesIO(response.content))
        assert result.size == (100, 100)
        assert result.format == "AVIF"
