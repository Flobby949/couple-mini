// Import the implementation directly; the package's browser entry assumes native DOM globals.
import { AbortController, AbortSignal } from 'abort-controller/dist/abort-controller'

// Query constructs an AbortController even when a query function does not consume its signal.
export function installNativeAbortController() {
  if (typeof globalThis.AbortController === 'undefined') Object.assign(globalThis, { AbortController, AbortSignal })
}
