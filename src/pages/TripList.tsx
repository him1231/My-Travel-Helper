import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import Header from '@/components/Header'
import TripCard from '@/components/TripCard'
import NewTripModal from '@/components/NewTripModal'
import { useAuth } from '@/hooks/useAuth'
import { subscribeUserTrips, deleteTrip } from '@/lib/firestore/trips'
import type { Trip } from '@/lib/types'

export default function TripList() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (!user) return
    return subscribeUserTrips(
      user.uid,
      (t) => { setTrips(t); setLoading(false); setLoadError(false) },
      () => { setLoadError(true); setLoading(false) },
    )
  }, [user])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trip? This cannot be undone.')) return
    try {
      await deleteTrip(id)
      toast.success('Trip deleted')
    } catch (e) {
      toast.error('Delete failed')
      console.error(e)
    }
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your trips</h1>
            <p className="text-sm text-slate-600">Hi {user?.displayName ?? 'traveller'}.</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            New trip
          </button>
        </div>

        {loading ? (
          <div className="mt-10 text-slate-500">Loading…</div>
        ) : loadError ? (
          <div className="mt-10 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
            <p className="font-medium">Couldn't load your trips.</p>
            <p className="mt-1 text-sm">Check your connection and try refreshing the page.</p>
          </div>
        ) : trips.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            <p>No trips yet.</p>
            <p className="mt-1 text-sm">Click <span className="font-medium">New trip</span> to start planning.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((t) => (
              <TripCard key={t.id} trip={t} onDelete={() => handleDelete(t.id)} />
            ))}
          </div>
        )}
      </main>

      <NewTripModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(id) => { setShowNew(false); nav(`/trips/${id}`) }}
      />
    </div>
  )
}
