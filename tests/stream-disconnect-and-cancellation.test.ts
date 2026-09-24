import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('Stream Disconnect & AbortSignal Semantics', () => {
  test('abort signal triggers cancellation listener immediately', () => {
    const controller = new AbortController()
    let aborted = false

    controller.signal.addEventListener('abort', () => {
      aborted = true
    })

    assert.equal(aborted, false)
    controller.abort()
    assert.equal(aborted, true)
    assert.equal(controller.signal.aborted, true)
  })

  test('composite AbortSignal.any aborts when client aborts', () => {
    const clientController = new AbortController()
    const timeoutSignal = AbortSignal.timeout(60000)

    const compositeSignal = AbortSignal.any([clientController.signal, timeoutSignal])
    assert.equal(compositeSignal.aborted, false)

    clientController.abort()
    assert.equal(compositeSignal.aborted, true)
  })

  test('composite AbortSignal.any aborts when timeout expires', async () => {
    const clientController = new AbortController()
    const fastTimeoutSignal = AbortSignal.timeout(20) // 20ms timeout

    const compositeSignal = AbortSignal.any([clientController.signal, fastTimeoutSignal])
    assert.equal(compositeSignal.aborted, false)

    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(compositeSignal.aborted, true)
  })
})
