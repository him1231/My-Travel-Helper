import { useParams } from 'react-router-dom'
import Header from '@/components/Header'

export default function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>()
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold">Trip {tripId}</h1>
        <p className="mt-2 text-slate-600">Map + day-by-day itinerary coming next.</p>
      </main>
    </div>
  )
}
