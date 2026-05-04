import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type User } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, googleProvider, db } from '@/lib/firebase'

type AuthCtx = {
  user: User | null
  loading: boolean
  signIn: () => Promise<unknown>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

async function upsertUserProfile(user: User) {
  await setDoc(
    doc(db, 'users', user.uid),
    {
      uid: user.uid,
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u)
        setLoading(false)
        if (u) {
          upsertUserProfile(u).catch(console.error)
        }
      }),
    [],
  )

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        signIn: () => signInWithPopup(auth, googleProvider),
        signOut: () => fbSignOut(auth),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
