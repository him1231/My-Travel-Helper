import { useParams } from 'react-router-dom'

export default function Shared() {
  const { token } = useParams<{ token: string }>()
  return (
    <div className="grid h-screen place-items-center text-slate-500">
      Public shared trip ({token}) — read-only view coming soon.
    </div>
  )
}
