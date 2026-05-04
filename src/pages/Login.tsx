import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Compass } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function Login() {
  const { user, signIn } = useAuth()
  const nav = useNavigate()

  if (user) return <Navigate to="/trips" replace />

  const handleSignIn = async () => {
    try {
      await signIn()
      nav('/trips')
    } catch (e) {
      toast.error('Sign-in failed')
      console.error(e)
    }
  }

  return (
    <div className="grid h-screen place-items-center bg-gradient-to-br from-sky-50 to-emerald-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex items-center gap-2 text-sky-700">
          <Compass className="h-6 w-6" />
          <span className="font-semibold">My Travel Helper</span>
        </div>
        <h1 className="mt-6 text-2xl font-bold">Welcome back</h1>
        <p className="mt-2 text-slate-600">Sign in to plan and save your trips.</p>
        <button
          onClick={handleSignIn}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 font-medium hover:bg-slate-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.28-1.93-6.14-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.86 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.36-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.68-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.65l3.15-3.15C17.45 2.1 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.68 2.84C6.72 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}
