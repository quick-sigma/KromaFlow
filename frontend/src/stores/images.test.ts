import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useImagesStore } from './images'
import { usePipelineStore } from './pipeline'

function createMockFile(name: string, type = 'image/png'): File {
  return new File(['fake-content'], name, { type })
}

beforeEach(() => {
  useImagesStore.setState({ images: [], processedImages: [] })
  usePipelineStore.setState({ steps: [] })
})

describe('images store', () => {
  it('should start with empty arrays', () => {
    const { images, processedImages } = useImagesStore.getState()
    expect(images).toEqual([])
    expect(processedImages).toEqual([])
  })

  it('should add a single image and create a blob URL', async () => {
    const { addImages } = useImagesStore.getState()
    const file = createMockFile('photo.png')

    await addImages([file])

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(1)
    expect(images[0].name).toBe('photo.png')
    expect(images[0].type).toBe('image/png')
    expect(images[0].size).toBeGreaterThan(0)
    expect(images[0].src).toMatch(/^blob:/)
    expect(images[0].id).toBeDefined()
    expect(images[0].blobKey).toContain(images[0].id)
  })

  it('should add multiple images at once', async () => {
    const { addImages } = useImagesStore.getState()

    await addImages([
      createMockFile('a.png'),
      createMockFile('b.jpeg', 'image/jpeg'),
    ])

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(2)
    expect(images[0].name).toBe('a.png')
    expect(images[1].name).toBe('b.jpeg')
  })

  it('should append new images to existing ones', async () => {
    await useImagesStore.getState().addImages([createMockFile('first.png')])
    await useImagesStore.getState().addImages([createMockFile('second.png')])

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(2)
    expect(images[0].name).toBe('first.png')
    expect(images[1].name).toBe('second.png')
  })

  it('should remove an image by id and revoke its blob URL', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const { addImages, removeImage } = useImagesStore.getState()

    await addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]
    const blobUrl = entry.src

    await removeImage(entry.id)

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(0)
    expect(revokeSpy).toHaveBeenCalledWith(blobUrl)
  })

  it('should remove only the specified image', async () => {
    const { addImages, removeImage } = useImagesStore.getState()

    await addImages([createMockFile('keep.png'), createMockFile('remove.png')])
    const toRemove = useImagesStore.getState().images[1]

    await removeImage(toRemove.id)

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(1)
    expect(images[0].name).toBe('keep.png')
  })

  it('should add a processed image result', async () => {
    const { addImages, processImage } = useImagesStore.getState()

    // Set up pipeline with output formatter
    usePipelineStore.setState({
      steps: [
        {
          step: {
            id: 'png_fmt',
            name: 'png-output-formatter',
            variant: 'output_formatter',
          },
          config: {},
        },
      ],
    })

    // Mock fetch to return success
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () =>
        Promise.resolve(new Blob(['processed'], { type: 'image/png' })),
    })

    await addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]

    // Wait for processing to complete
    await new Promise((resolve) => {
      const unsubscribe = useImagesStore.subscribe((state) => {
        if (state.processingState === 'success') {
          unsubscribe()
          resolve(undefined)
        }
      })
      processImage(entry.id)
    })

    const { processedImages } = useImagesStore.getState()
    expect(processedImages).toHaveLength(1)
    expect(processedImages[0].originalId).toBe(entry.id)
    expect(processedImages[0].originalName).toBe('photo.png')
    expect(processedImages[0].name).toContain('photo-processed')
    expect(processedImages[0].src).toMatch(/^blob:/)
    expect(processedImages[0].processedAt).toBeGreaterThan(0)
  })

  it('should remove a processed image', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')

    // Manually add a processed image entry
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'test.png',
          src: 'blob:http://localhost/processed-src',
          name: 'test-processed.png',
          type: 'image/png',
          size: 100,
          blobKey: 'processed-blob-p1',
          processedAt: Date.now(),
        },
      ],
    })

    await useImagesStore.getState().removeProcessedImage('p1')

    const { processedImages } = useImagesStore.getState()
    expect(processedImages).toHaveLength(0)
    expect(revokeSpy).toHaveBeenCalled()
  })

  it('should reject processing when the pipeline is empty', async () => {
    // Pipeline is empty — processImage should set an error
    const { addImages, processImage } = useImagesStore.getState()

    await addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]

    processImage(entry.id)

    const state = useImagesStore.getState()
    expect(state.processingState).toBe('error')
    expect(state.processingError).toBe(
      'No pipeline steps configured. Add steps first.',
    )
  })

  it('should reject processing when the pipeline has steps but no output formatter', async () => {
    // Set up pipeline with only a processor step
    usePipelineStore.setState({
      steps: [
        {
          step: {
            id: 'wm_remover',
            name: 'watermark-remover',
            variant: 'processor',
          },
          config: {},
        },
      ],
    })

    const { addImages, processImage } = useImagesStore.getState()
    await addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]

    processImage(entry.id)

    const state = useImagesStore.getState()
    expect(state.processingState).toBe('error')
    expect(state.processingError).toContain('output')
  })

  it('should clear all images and processed images and revoke all blob URLs', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const { addImages, clearImages } = useImagesStore.getState()

    await addImages([createMockFile('a.png'), createMockFile('b.png')])
    const urls = useImagesStore.getState().images.map((img) => img.src)

    // Add a processed image
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'a.png',
          src: 'blob:http://localhost/p-src',
          name: 'a-processed.png',
          type: 'image/png',
          size: 100,
          blobKey: 'processed-blob-p1',
          processedAt: Date.now(),
        },
      ],
    })

    await clearImages()

    const { images, processedImages } = useImagesStore.getState()
    expect(images).toHaveLength(0)
    expect(processedImages).toHaveLength(0)
    expect(revokeSpy).toHaveBeenCalledWith(urls[0])
    expect(revokeSpy).toHaveBeenCalledWith(urls[1])
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/p-src')
  })

  it('should clear only original images with clearOriginalImages', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    await useImagesStore.getState().addImages([
      createMockFile('keep-processed.png'),
    ])

    // Add a processed image
    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'keep-processed.png',
          src: 'blob:http://localhost/p-src',
          name: 'keep-processed-processed.png',
          type: 'image/png',
          size: 100,
          blobKey: 'processed-blob-p1',
          processedAt: Date.now(),
        },
      ],
    })

    const imgEntry = useImagesStore.getState().images[0]
    await useImagesStore.getState().clearOriginalImages()

    const { images, processedImages } = useImagesStore.getState()
    expect(images).toHaveLength(0)
    // Processed images should survive
    expect(processedImages).toHaveLength(1)
    expect(revokeSpy).toHaveBeenCalledWith(imgEntry.src)
  })

  it('should clear only processed images with clearProcessedImages', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    await useImagesStore.getState().addImages([
      createMockFile('original.png'),
    ])

    useImagesStore.setState({
      processedImages: [
        {
          id: 'p1',
          originalId: 'orig1',
          originalName: 'original.png',
          src: 'blob:http://localhost/p-src',
          name: 'original-processed.png',
          type: 'image/png',
          size: 100,
          blobKey: 'processed-blob-p1',
          processedAt: Date.now(),
        },
      ],
    })

    await useImagesStore.getState().clearProcessedImages()

    const { images, processedImages } = useImagesStore.getState()
    // Original images should survive
    expect(images).toHaveLength(1)
    expect(processedImages).toHaveLength(0)
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/p-src')
  })
})
