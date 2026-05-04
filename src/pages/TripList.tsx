import { Plus } from 'lucide-react'
import Header from '@/components/Header'
import { useAuth } from '@/hooks/useAuth'

export default function TripList() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your trips</h1>
            <p className="text-sm text-slate-600">Hi {user?.displayName ?? 'traveller'} — let's plan something.</p>
          </div>
          <button
            disabled
            className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white opacity-60"
            title="Coming next"
          >
            <Plus className="h-4 w-4" />
            New trip
          </button>
        </div>

        <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          <p>No trips yet.</p>
          <p className="mt-1 text-sm">Trip creation + map view ships in the next iteration.</p>
        </div>
      </main>
    </div>
  )
}
