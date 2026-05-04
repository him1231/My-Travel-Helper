import { Link } from 'react-router-dom'
import { Compass, LogOut, User as UserIcon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function Header() {
  const { user, signOut } = useAuth()
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/trips" className="flex items-center gap-2 font-semibold">
          <Compass className="h-5 w-5 text-sky-600" />
          My Travel Helper
        </Link>
        {user && (
          <div className="flex items-center gap-4">
            <Link to="/profile" className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
              <UserIcon className="h-4 w-4" />
              {user.displayName ?? user.email}
            </Link>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
