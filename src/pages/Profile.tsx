import Header from '@/components/Header'
import { useAuth } from '@/hooks/useAuth'

export default function Profile() {
  const { user, signOut } = useAuth()
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold">Profile</h1>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            {user?.photoURL && (
              <img src={user.photoURL} alt="" className="h-16 w-16 rounded-full" />
            )}
            <div>
              <div className="font-semibold">{user?.displayName ?? '—'}</div>
              <div className="text-sm text-slate-600">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="mt-6 rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </main>
    </div>
  )
}
