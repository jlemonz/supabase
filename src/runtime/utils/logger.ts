// Enhanced logging utility for Vercel deployment

// Define more specific types for logger data
type LogData = Record<string, unknown>
type ErrorObject = Error | { message?: string, stack?: string } | string | unknown

// Detect environment - important for sending logs from client to server
const isClient = typeof window !== 'undefined'

// Get browser information when in client mode
function getBrowserInfo() {
  if (!isClient) return {}

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    url: window.location.href,
    referrer: document.referrer || 'direct',
  }
}

const logger = {
  info: (message: string, data?: LogData) => {
    const logObject = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      ...(data && { data }),
      source: isClient ? 'client' : 'server',
      ...(isClient && { browser: getBrowserInfo() }),
    }
    // Log normally first (will appear in browser console or server logs directly)
    console.log(JSON.stringify(logObject))
    // If we're on client side, also send to server so it appears in Vercel logs
    if (isClient) {
      sendLogToServer(logObject)
    }
  },
  warn: (message: string, data?: LogData) => {
    const logObject = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message,
      ...(data && { data }),
      source: isClient ? 'client' : 'server',
      ...(isClient && { browser: getBrowserInfo() }),
    }

    console.warn(JSON.stringify(logObject))

    if (isClient) {
      sendLogToServer(logObject)
    }
  },
  error: (message: string, error?: ErrorObject) => {
    const logObject: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      source: isClient ? 'client' : 'server',
      ...(isClient && { browser: getBrowserInfo() }),
    }

    if (error) {
      if (error instanceof Error) {
        logObject.error = error.message
        if (error.stack) {
          logObject.stack = error.stack
        }
      }
      else {
        logObject.error = error
      }
    }

    console.error(JSON.stringify(logObject))

    if (isClient) {
      sendLogToServer(logObject)
    }
  },

  // Add navigation logging
  navigation: (to: string, from: string) => {
    const logObject = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Page navigation',
      data: { to, from },
      source: 'client',
      browser: getBrowserInfo(),
    }

    console.log(JSON.stringify(logObject))

    if (isClient) {
      sendLogToServer(logObject)
    }
  },
}

// Function to send client logs to server
function sendLogToServer(logData: Record<string, unknown>) {
  // Use fetch to send log data to server
  // This endpoint will need to be created in the user's Nuxt application
  fetch('/api/client-logs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(logData),
    // Don't wait for response, fire and forget
    // This ensures logging doesn't slow down the application
  }).catch((err) => {
    // If log sending fails, log to console but don't retry to avoid loops
    console.error('Failed to send log to server:', err)
  })
}

export default logger
