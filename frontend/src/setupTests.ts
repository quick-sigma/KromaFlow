import { vi } from 'vitest'
import '@testing-library/jest-dom'
import './i18n'

/**
 * Mock localStorage for jsdom (not available without --localstorage-file).
 */
const store: Record<string, string> = {}

vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = String(value)
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    Object.keys(store).forEach((key) => delete store[key])
  },
})

/**
 * Mock WebSocket for test environment.
 * The undici WebSocket implementation in Node 22+ has compatibility issues
 * with jsdom's Event constructor, so we provide a no-op mock.
 */
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CLOSED
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(_url: string) {
    // Don't try to connect in test environment
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
  }

  send(_data: string) {
    // No-op
  }

  addEventListener() {
    // No-op
  }

  removeEventListener() {
    // No-op
  }

  dispatchEvent() {
    return true
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)
