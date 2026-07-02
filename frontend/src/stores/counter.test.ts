import { describe, it, expect } from 'vitest'
import { useCounterStore } from './counter'

describe('counter store', () => {
  it('should start with count 0', () => {
    const { count } = useCounterStore.getState()
    expect(count).toBe(0)
  })

  it('should increment count', () => {
    useCounterStore.getState().increment()
    expect(useCounterStore.getState().count).toBe(1)
  })

  it('should decrement count', () => {
    useCounterStore.setState({ count: 5 })
    useCounterStore.getState().decrement()
    expect(useCounterStore.getState().count).toBe(4)
  })
})
