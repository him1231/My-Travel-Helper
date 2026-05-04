import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Landing from './pages/Landing'
import Login from './pages/Login'
import TripList from './pages/TripList'
import TripDetail from './pages/TripDetail'
import Shared from './pages/Shared'
import Profile from './pages/Profile'
import AuthGuard from './components/AuthGuard'
import { useAuth } from './hooks/useAuth'

export default function App() {
  const { loading } = useAuth()
  if (loading) return <div className="grid h-screen place-items-center text-slate-500">Loading…</div>

  return (
    <HashRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/shared/:token" element={<Shared />} />
        <Route element={<AuthGuard />}>
          <Route path="/trips" element={<TripList />} />
          <Route path="/trips/:tripId" element={<TripDetail />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
