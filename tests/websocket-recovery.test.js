import test from 'node:test'
import assert from 'node:assert/strict'

import { getReconnectDelay } from '../src/websocketRecovery.js'

test('reconnect delay grows exponentially with bounded jitter', () => {
  assert.equal(getReconnectDelay(0, () => 0), 400)
  assert.equal(getReconnectDelay(1, () => 0.5), 1000)
  assert.equal(getReconnectDelay(4, () => 1), 9600)
})

test('reconnect delay is bounded for large retry counts', () => {
  assert.equal(getReconnectDelay(100, () => 1), 15_000)
  assert.equal(getReconnectDelay(-1, () => 0.5), 500)
})
