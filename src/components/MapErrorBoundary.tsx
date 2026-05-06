import { Component, type ReactNode } from 'react'
import { reportMapsRuntimeError } from '@/lib/mapsStatus'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { hasError: boolean }

export default class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(err: unknown) {
    console.error('Map crashed:', err)
    reportMapsRuntimeError()
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="grid h-full w-full place-items-center bg-slate-50 p-4 text-center text-sm text-slate-500">
          Map unavailable
        </div>
      )
    }
    return this.props.children
  }
}
