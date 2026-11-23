import test from 'node:test'
import assert from 'node:assert/strict'

import { getReconnectDelay, getWebSocketUrl } from '../src/websocketRecovery.js'

test('reconnect delay grows exponentially with bounded jitter', () => {
  assert.equal(getReconnectDelay(0, () => 0), 400)
  assert.equal(getReconnectDelay(1, () => 0.5), 1000)
  assert.equal(getReconnectDelay(4, () => 1), 9600)
})

test('reconnect delay is bounded for large retry counts', () => {
  assert.equal(getReconnectDelay(100, () => 1), 15_000)
  assert.equal(getReconnectDelay(-1, () => 0.5), 500)
})

test('websocket URL follows the current host and page security protocol', () => {
  assert.equal(getWebSocketUrl({ protocol: 'http:', hostname: '192.168.1.10' }), 'ws://192.168.1.10:3001')
  assert.equal(getWebSocketUrl({ protocol: 'https:', hostname: 'fiss.example.com' }), 'wss://fiss.example.com:3001')
})

test('websocket URL honors an explicitly configured server endpoint', () => {
  assert.equal(
    getWebSocketUrl({ protocol: 'https:', hostname: 'fiss.example.com' }, 'wss://realtime.example.com/socket'),
    'wss://realtime.example.com/socket',
  )
})

test('production requires an explicitly configured websocket endpoint', () => {
  assert.equal(getWebSocketUrl({ protocol: 'https:', hostname: 'fiss.vercel.app' }, undefined, true), null)
  assert.equal(
    getWebSocketUrl({ protocol: 'https:', hostname: 'fiss.vercel.app' }, 'wss://realtime.example.com', true),
    'wss://realtime.example.com',
  )
})
