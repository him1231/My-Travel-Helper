import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Header from '@/components/Header'
import { useAuth } from '@/hooks/useAuth'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'HKD', 'TWD', 'CNY', 'KRW', 'AUD', 'CAD', 'SGD', 'THB']

export default function Profile() {
  const { user, signOut } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setDisplayName(data.displayName ?? user.displayName ?? '')
        setCurrency(data.prefs?.currency ?? 'USD')
      } else {
        setDisplayName(user.displayName ?? '')
      }
      setLoaded(true)
    }).catch(console.error)
  }, [user])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: displayName.trim(),
        'prefs.currency': currency,
        updatedAt: serverTimestamp(),
      })
      toast.success('Preferences saved')
    } catch (err) {
      toast.error('Save failed')
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

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

          {loaded && (
            <form onSubmit={handleSave} className="mt-6 space-y-4">
              <h2 className="font-semibold text-slate-800">Preferences</h2>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Display name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input mt-1"
                  placeholder="Your name"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Default currency</span>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input mt-1">
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save preferences'}
              </button>
            </form>
          )}

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
