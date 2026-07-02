import { create } from 'zustand'

export type ImageEntry = {
  id: string
  file: File
  src: string
  name: string
}

type ImagesState = {
  images: ImageEntry[]
  addImages: (files: File[]) => void
  removeImage: (id: string) => void
  processImage: (id: string) => void
  clearImages: () => void
}

export const useImagesStore = create<ImagesState>((set, get) => ({
  images: [],

  addImages: (files: File[]) => {
    const newEntries: ImageEntry[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      src: URL.createObjectURL(file),
      name: file.name,
    }))

    set((state) => ({
      images: [...state.images, ...newEntries],
    }))
  },

  removeImage: (id: string) => {
    const { images } = get()
    const entry = images.find((img) => img.id === id)
    if (entry) {
      URL.revokeObjectURL(entry.src)
    }
    set((state) => ({
      images: state.images.filter((img) => img.id !== id),
    }))
  },

  processImage: (id: string) => {
    const { images } = get()
    const entry = images.find((img) => img.id === id)
    if (entry) {
      console.log(`Processing image: ${entry.name} (${entry.id})`)
    }
  },

  clearImages: () => {
    const { images } = get()
    for (const img of images) {
      URL.revokeObjectURL(img.src)
    }
    set({ images: [] })
  },
}))
