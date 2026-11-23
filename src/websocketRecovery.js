export function getReconnectDelay(attempt, random = Math.random) {
  const baseDelay = 500
  const maxDelay = 15_000
  const exponent = Math.min(Math.max(0, Math.floor(attempt)), 5)
  const jitter = 0.8 + random() * 0.4
  return Math.min(maxDelay, Math.round(baseDelay * (2 ** exponent) * jitter))
}

export function getWebSocketUrl(location, configuredUrl, isProduction = false) {
  if (configuredUrl) return configuredUrl
  if (isProduction) return null
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.hostname}:3001`
}
