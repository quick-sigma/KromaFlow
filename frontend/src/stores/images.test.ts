import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useImagesStore } from './images'

function createMockFile(name: string, type = 'image/png'): File {
  return new File(['fake-content'], name, { type })
}

beforeEach(() => {
  useImagesStore.setState({ images: [] })
})

describe('images store', () => {
  it('should start with an empty images array', () => {
    const { images } = useImagesStore.getState()
    expect(images).toEqual([])
  })

  it('should add a single image and create a blob URL', () => {
    const { addImages } = useImagesStore.getState()
    const file = createMockFile('photo.png')

    addImages([file])

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(1)
    expect(images[0].name).toBe('photo.png')
    expect(images[0].file).toBe(file)
    expect(images[0].src).toMatch(/^blob:/)
    expect(images[0].id).toBeDefined()
  })

  it('should add multiple images at once', () => {
    const { addImages } = useImagesStore.getState()

    addImages([createMockFile('a.png'), createMockFile('b.jpeg', 'image/jpeg')])

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(2)
    expect(images[0].name).toBe('a.png')
    expect(images[1].name).toBe('b.jpeg')
  })

  it('should append new images to existing ones', () => {
    useImagesStore.getState().addImages([createMockFile('first.png')])
    useImagesStore.getState().addImages([createMockFile('second.png')])

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(2)
    expect(images[0].name).toBe('first.png')
    expect(images[1].name).toBe('second.png')
  })

  it('should remove an image by id and revoke its blob URL', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const { addImages, removeImage } = useImagesStore.getState()

    addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]
    const blobUrl = entry.src

    removeImage(entry.id)

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(0)
    expect(revokeSpy).toHaveBeenCalledWith(blobUrl)
  })

  it('should remove only the specified image', () => {
    const { addImages, removeImage } = useImagesStore.getState()

    addImages([createMockFile('keep.png'), createMockFile('remove.png')])
    const toRemove = useImagesStore.getState().images[1]

    removeImage(toRemove.id)

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(1)
    expect(images[0].name).toBe('keep.png')
  })

  it('should process an image by id', () => {
    const { addImages, processImage } = useImagesStore.getState()

    addImages([createMockFile('photo.png')])
    const entry = useImagesStore.getState().images[0]

    processImage(entry.id)

    // processImage currently logs; we just verify it doesn't throw
    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(1)
  })

  it('should clear all images and revoke all blob URLs', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const { addImages, clearImages } = useImagesStore.getState()

    addImages([createMockFile('a.png'), createMockFile('b.png')])
    const urls = useImagesStore.getState().images.map((img) => img.src)

    clearImages()

    const { images } = useImagesStore.getState()
    expect(images).toHaveLength(0)
    expect(revokeSpy).toHaveBeenCalledWith(urls[0])
    expect(revokeSpy).toHaveBeenCalledWith(urls[1])
  })
})
