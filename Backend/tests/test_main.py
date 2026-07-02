"""Integration tests for the FastAPI application."""

import json
import pytest
from io import BytesIO
from PIL import Image
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


# ── Fixture: isolate storage per test ────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean_storage(monkeypatch, tmp_path):
    """Redirect processed-image storage to a temp directory for test isolation.

    Also empties the in-memory metadata dict so tests start clean.
    """
    storage_dir = tmp_path / "processed"
    storage_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("main.STORAGE_DIR", storage_dir)
    monkeypatch.setattr("main._METADATA_FILE", storage_dir / "metadata.json")
    import main as main_mod

    main_mod._processed_metadata.clear()


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_image_bytes(
    size=(100, 100), color=(255, 0, 0), fmt="PNG"
) -> bytes:
    """Create a Pillow image and return its bytes."""
    img = Image.new("RGB", size, color=color)
    buf = BytesIO()
    img.save(buf, format=fmt)
    buf.seek(0)
    return buf.getvalue()


def _upload(
    image_bytes: bytes | None = None,
    filename: str = "test.png",
    pipeline: list[dict] | None = None,
) -> any:
    """Helper to POST a processing request with a pipeline definition."""
    if image_bytes is None:
        image_bytes = _make_image_bytes()

    if pipeline is None:
        pipeline = [
            {"step_id": "wm_remover", "config": {}},
            {"step_id": "avif_fmt", "config": {"quality": 85}},
        ]

    return client.post(
        "/api/images/process",
        files={"image": (filename, image_bytes, "image/png")},
        data={
            "pipeline": json.dumps(pipeline),
        },
    )


# ── Tests: root ──────────────────────────────────────────────────────────────


class TestReadRoot:
    """GET /"""

    def test_read_root(self):
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "Hello World"}


# ── Tests: process ───────────────────────────────────────────────────────────


class TestProcessImageEndpoint:
    """POST /api/images/process"""

    def test_process_image_success(self):
        """Valid request returns JSON with resultId and downloadUrl."""
        response = _upload()
        assert response.status_code == 200
        data = response.json()
        assert "resultId" in data
        assert data["type"] == "image/avif"
        assert data["size"] > 0
        assert data["downloadUrl"].startswith("/api/images/")
        assert data["downloadUrl"].endswith("/download")

    def test_process_image_downloadable(self):
        """The resultId can be used to download the processed image."""
        process_resp = _upload()
        assert process_resp.status_code == 200
        data = process_resp.json()

        download_resp = client.get(data["downloadUrl"])
        assert download_resp.status_code == 200
        assert download_resp.headers["content-type"] == "image/avif"

        # Verify it's a valid image
        result_img = Image.open(BytesIO(download_resp.content))
        assert result_img.format == "AVIF"

    def test_process_image_with_watermark_remover(self):
        """Pipeline with wm_remover produces a downloadable AVIF."""
        response = _upload(pipeline=[
            {"step_id": "wm_remover", "config": {}},
            {"step_id": "avif_fmt", "config": {"quality": 85}},
        ])
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "image/avif"

        dl = client.get(data["downloadUrl"])
        assert dl.status_code == 200
        result = Image.open(BytesIO(dl.content))
        assert result.format == "AVIF"

    def test_process_image_with_avif_quality(self):
        """Quality setting should be accepted by avif_fmt."""
        response = _upload(pipeline=[
            {"step_id": "wm_remover", "config": {}},
            {"step_id": "avif_fmt", "config": {"quality": 50}},
        ])
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "image/avif"

    def test_process_image_returns_display_name(self):
        """Display name is derived from the original filename."""
        img_bytes = _make_image_bytes()
        response = _upload(image_bytes=img_bytes, filename="my-photo.png")
        assert response.status_code == 200
        data = response.json()
        assert data["name"].startswith("my-photo-processed")

    # ── Error handling ────────────────────────────────────────────────

    def test_missing_image_file(self):
        """Request without image file returns 422."""
        response = client.post(
            "/api/images/process",
            data={
                "pipeline": json.dumps(
                    [{"step_id": "wm_remover", "config": {}}]
                ),
            },
        )
        assert response.status_code == 422

    def test_missing_pipeline(self):
        """Request without pipeline field returns 422."""
        img_bytes = _make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
        )
        assert response.status_code == 422

    def test_invalid_pipeline_json(self):
        """Invalid JSON in pipeline returns 422."""
        img_bytes = _make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
            data={"pipeline": "not-valid-json"},
        )
        assert response.status_code == 422

    def test_pipeline_not_a_list(self):
        """Pipeline JSON must be an array."""
        img_bytes = _make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
            data={"pipeline": json.dumps({"step_id": "wm_remover"})},
        )
        assert response.status_code == 422

    def test_pipeline_empty_list(self):
        """Empty pipeline returns 422."""
        img_bytes = _make_image_bytes()
        response = client.post(
            "/api/images/process",
            files={"image": ("test.png", img_bytes, "image/png")},
            data={"pipeline": json.dumps([])},
        )
        assert response.status_code == 422

    def test_unknown_step_id(self):
        """Unknown step ID returns 400."""
        img_bytes = _make_image_bytes()
        response = _upload(
            image_bytes=img_bytes,
            pipeline=[{"step_id": "nonexistent", "config": {}}],
        )
        assert response.status_code == 400
        assert "Unknown step ID" in response.text

    def test_invalid_step_config_type(self):
        """Config with wrong types returns 422."""
        img_bytes = _make_image_bytes()
        response = _upload(
            image_bytes=img_bytes,
            pipeline=[
                {"step_id": "wm_remover", "config": {}},
                {
                    "step_id": "avif_fmt",
                    "config": {"quality": "not-a-number"},
                },
            ],
        )
        assert response.status_code == 422
        assert "Invalid config" in response.text

    def test_no_processor_pipeline(self):
        """Pipeline without a processor step returns 422."""
        img_bytes = _make_image_bytes()
        response = _upload(
            image_bytes=img_bytes,
            pipeline=[
                {"step_id": "avif_fmt", "config": {"quality": 85}}
            ],
        )
        assert response.status_code == 422
        assert "at least one Processor" in response.text

    def test_invalid_image_file(self):
        """Uploading a non-image file returns 400."""
        response = client.post(
            "/api/images/process",
            files={
                "image": (
                    "notimage.txt",
                    b"this is not an image",
                    "text/plain",
                )
            },
            data={
                "pipeline": json.dumps([
                    {"step_id": "wm_remover", "config": {}},
                    {"step_id": "avif_fmt", "config": {"quality": 85}},
                ]),
            },
        )
        assert response.status_code == 400
        assert "not a valid image" in response.text.lower()

    def test_watermark_removal_and_avif(self):
        """Pipeline with wm_remover + avif_fmt."""
        response = _upload(pipeline=[
            {"step_id": "wm_remover", "config": {}},
            {"step_id": "avif_fmt", "config": {"quality": 85}},
        ])
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "image/avif"
        assert data["size"] > 0


# ── Tests: download ──────────────────────────────────────────────────────────


class TestDownloadProcessedImage:
    """GET /api/images/{image_id}/download"""

    def test_download_existing_image(self):
        """Downloading a known processed image returns the file."""
        process_resp = _upload()
        data = process_resp.json()

        response = client.get(data["downloadUrl"])
        assert response.status_code == 200
        assert response.headers["content-type"] == data["type"]
        assert int(response.headers.get("content-length", 0)) == data["size"]

    def test_download_nonexistent_image(self):
        """Downloading a nonexistent resultId returns 404."""
        response = client.get("/api/images/nonexistent-uuid/download")
        assert response.status_code == 404

    def test_download_deleted_image(self):
        """Downloading a deleted image returns 404."""
        process_resp = _upload()
        data = process_resp.json()

        # Delete it first
        client.delete(f"/api/images/{data['resultId']}")

        # Then try to download
        response = client.get(data["downloadUrl"])
        assert response.status_code == 404


# ── Tests: delete ────────────────────────────────────────────────────────────


class TestDeleteProcessedImage:
    """DELETE /api/images/{image_id}"""

    def test_delete_existing_image(self):
        """Deleting an existing image returns 204 and removes the file."""
        process_resp = _upload()
        data = process_resp.json()

        response = client.delete(f"/api/images/{data['resultId']}")
        assert response.status_code == 204

        # Verify it's gone
        dl_response = client.get(data["downloadUrl"])
        assert dl_response.status_code == 404

    def test_delete_nonexistent_image(self):
        """Deleting a nonexistent image returns 204 (idempotent)."""
        response = client.delete("/api/images/nonexistent-uuid")
        assert response.status_code == 204

    def test_delete_twice_is_idempotent(self):
        """Deleting the same image twice returns 204 both times."""
        process_resp = _upload()
        data = process_resp.json()

        first = client.delete(f"/api/images/{data['resultId']}")
        assert first.status_code == 204

        second = client.delete(f"/api/images/{data['resultId']}")
        assert second.status_code == 204
