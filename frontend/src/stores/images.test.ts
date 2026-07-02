import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useImagesStore } from './images'
import { usePipelineStore } from './pipeline'

function createMockFile(name: string, type = 'image/png'): File {
  return new File(['fake-content'], name, { type })
}

beforeEach(() => {
  useImagesStore.setState({ images: [] })
  usePipelineStore.setState({ steps: [] })
})

describe('images store', () => {
  it('should start with an empty images array', () => {
    const { images } = useImagesStore.getState()
    expect(images).toEqual([])
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

  it('should attempt to process when the pipeline has an output formatter', async () => {
    // Set up pipeline with both a processor and output formatter
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
        {
          step: {
            id: 'avif_fmt',
            name: 'avif-output-formatter',
            variant: 'output_formatter',
          },
          config: { quality: 85 },
        },
      ],
    })

    // Mock fetch to return success
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob()),
    })

    const { addImages, processImage } = useImagesStore.getState()
    await addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]

    processImage(entry.id)

    // Should have set processing state
    const state = useImagesStore.getState()
    expect(state.processingId).toBe(entry.id)
    expect(state.processingState).toBe('processing')
  })

  it('should clear all images and revoke all blob URLs', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const { addImages, clearImages } = useImagesStore.getState()

    await addImages([createMockFile('a.png'), createMockFile('b.png')])
    const urls = useImagesStore.getState().images.map((img) => img.src)

    await clearImages()

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(0)
    expect(revokeSpy).toHaveBeenCalledWith(urls[0])
    expect(revokeSpy).toHaveBeenCalledWith(urls[1])
  })
})
