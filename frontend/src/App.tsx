import FileInput from './components/FileInput'
import MiniatureList from './components/MiniatureList'
import { useImagesStore } from './stores/images'

function App() {
  const addImages = useImagesStore((state) => state.addImages)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files?.length) return
    addImages(Array.from(files))
    event.target.value = ''
  }

  return (
    <div className="min-h-screen flex flex-col items-center gap-6 bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-bold">Image Prepare</h1>
      <FileInput onChange={handleFileChange} />
      <MiniatureList />
    </div>
  )
}

export default App
