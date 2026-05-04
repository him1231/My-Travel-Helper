import { Link, Navigate } from 'react-router-dom'
import { Compass, MapPin, Users, Wallet } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function Landing() {
  const { user } = useAuth()
  if (user) return <Navigate to="/trips" replace />

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex items-center gap-2 text-sky-700">
          <Compass className="h-6 w-6" />
          <span className="font-semibold">My Travel Helper</span>
        </div>

        <h1 className="mt-10 max-w-2xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Plan every trip in one place — map, itinerary, budget, friends.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-slate-600">
          Drop pins on a map, build a day-by-day plan, track your budget, and share with travel buddies.
          Free, no backend, your data stays in your Firebase.
        </p>

        <div className="mt-8 flex gap-3">
          <Link
            to="/login"
            className="rounded-lg bg-sky-600 px-5 py-3 font-medium text-white shadow-sm hover:bg-sky-700"
          >
            Get started
          </Link>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          <Feature icon={<MapPin />} title="Map view" body="Click pins to add stops. See your whole trip at a glance." />
          <Feature icon={<Wallet />} title="Budget tracking" body="Estimate costs per activity, roll up by day or trip." />
          <Feature icon={<Users />} title="Share trips" body="Invite friends or send a read-only link." />
        </div>
      </div>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sky-600">{icon}</div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </div>
  )
}
