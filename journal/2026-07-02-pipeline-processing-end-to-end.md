# End-to-End Pipeline Processing

## Date
2026-07-02

## Summary
Implemented full end-to-end image processing flow: clicking "Process" on an image sends the current pipeline definition (steps + configs) to the backend, which executes the pipeline via the Step/Pipeline abstraction and returns the processed image.

## Changes

### Backend

#### `steps_config.py` — New registered steps
- **`ImageProcessorStep`** (`id: img_proc`): Wraps the existing `ImageProcessor`. Config has flattened fields (`resize_width`, `resize_height`, `resize_percent`, `rotate`, `flip`, `grayscale`, `crop_left/top/right/bottom`) which are converted back to `ProcessingInstructions` in the custom `execute()` override.
- **`ImageOutputFormatterStep`** (`id: img_fmt`): Wraps the existing `ImageOutputFormatter`. Config has `format` (dropdown: png/jpeg/webp/gif/bmp/tiff) and `quality` (slider: 0–100).
- Both use `@register` decorator so they appear in `GET /api/steps` and can be used via `pipeline_from_steps()`.
- Existing `WatermarkRemovalStep` and `AVIFOutputFormatterStep` remain unchanged.

#### `main.py` — Updated `POST /api/images/process`
- **New request format**: accepts `image` (UploadFile) + `pipeline` (JSON string) instead of the old `instructions` + `recipient` + `output_format`.
- Pipeline JSON format: `[{"step_id": "img_proc", "config": {...}}, {"step_id": "img_fmt", "config": {...}}]`
- Backend parses the pipeline, looks up each step ID in `_step_id_map`, validates configs against each step's Pydantic schema, builds a `Pipeline`, and executes it.
- Returns the processed image with proper Content-Type header.
- Removed old `ProcessingInstructions`-based processing code, sync lock, and formatter registry (no longer needed — the Pipeline abstraction handles all of this).

#### `tests/test_main.py` — Updated for new API
- All tests updated to use the new pipeline JSON format.
- Tests cover: success, JPEG/WebP output, grayscale, resize+rotate, missing image, missing pipeline, invalid JSON, unknown step, invalid config, pipeline without processor, invalid image, watermark removal step, AVIF output.

### Frontend

#### `stores/pipeline.ts` — New file
- Zustand store `usePipelineStore` that holds the current `PipelineStep[]`.
- `setSteps()` action to update from PipelineEditor.

#### `PipelineEditor.tsx` — Sync to pipeline store
- Added `useEffect` that syncs local `pipelineSteps` state to the global pipeline store whenever it changes.
- This makes the current pipeline available to `processImage` in the images store.

#### `stores/images.ts` — Full processing implementation
- `processImage` is now async and:
  1. Reads pipeline steps from `usePipelineStore.getState().steps`
  2. Errors with message if no steps configured
  3. Builds FormData with image file + pipeline JSON
  4. POSTs to `/api/images/process`
  5. On success: downloads the processed image as a file
  6. On error: sets error state with detail from backend response
- Added state fields: `processingId`, `processingState` ('idle'|'processing'|'success'|'error'), `processingError`
- Added `clearProcessingStatus()` action

## Test Results
- **Backend**: 169 tests pass (all tests)
- **Frontend**: 117 tests pass (all tests)

## Files Modified/Created
- `Backend/steps_config.py` — Added ImageProcessorStep, ImageOutputFormatterStep
- `Backend/main.py` — Updated POST endpoint for pipeline JSON
- `Backend/tests/test_main.py` — Updated all tests for new API
- `frontend/src/stores/pipeline.ts` — NEW: pipeline zustand store
- `frontend/src/components/PipelineEditor.tsx` — Sync to pipeline store
- `frontend/src/stores/images.ts` — Full processing implementation
