import { useSyncExternalStore } from 'react'

declare global {
  interface Window {
    gm_authFailure?: () => void
  }
}

let authFailed = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.gm_authFailure = () => {
    if (authFailed) return
    authFailed = true
    emit()
  }
}

export function reportMapsRuntimeError() {
  if (authFailed) return
  authFailed = true
  emit()
}

function getSnapshot() {
  return authFailed
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useMapsAuthFailed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
