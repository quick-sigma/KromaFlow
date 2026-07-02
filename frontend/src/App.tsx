import { useCounterStore } from './stores/counter'

function App() {
  const { count, increment, decrement } = useCounterStore()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold">Image Prepare</h1>
      <p className="text-gray-400">React + Zustand + Tailwind</p>
      <div className="flex items-center gap-4">
        <button
          onClick={decrement}
          className="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-500 transition"
        >
          -1
        </button>
        <span className="text-2xl font-mono tabular-nums">{count}</span>
        <button
          onClick={increment}
          className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-500 transition"
        >
          +1
        </button>
      </div>
    </div>
  )
}

export default App
