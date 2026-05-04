import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '@/components/Modal'
import PlacesAutocomplete from '@/components/PlacesAutocomplete'
import type { POI } from '@/lib/types'
import { createTrip } from '@/lib/firestore/trips'
import { useAuth } from '@/hooks/useAuth'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'HKD', 'TWD', 'CNY', 'KRW', 'AUD', 'CAD', 'SGD', 'THB']

export default function NewTripModal({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [destination, setDestination] = useState<POI | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [budgetLimit, setBudgetLimit] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setTitle(''); setDestination(null); setStartDate(''); setEndDate(''); setCurrency('USD'); setBudgetLimit('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !title.trim()) return
    if (startDate && endDate && endDate < startDate) {
      toast.error('End date must be after start')
      return
    }
    setBusy(true)
    try {
      const id = await createTrip(user.uid, {
        title: title.trim(),
        destination: destination ?? undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        currency,
        budgetLimit: budgetLimit ? { amount: parseFloat(budgetLimit), currency } : undefined,
      })
      toast.success('Trip created')
      reset()
      onCreated(id)
    } catch (err) {
      toast.error('Failed to create trip')
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New trip"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
          <button type="submit" form="new-trip-form" disabled={busy || !title.trim()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <form id="new-trip-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Tokyo 2026"
            className="input"
            autoFocus
            required
          />
        </Field>

        <Field label="Destination (optional)">
          <PlacesAutocomplete
            placeholder={destination ? destination.name : 'Search city or place'}
            onSelect={(poi) => setDestination(poi)}
          />
          {destination && (
            <div className="mt-1 text-xs text-slate-500">Selected: {destination.name}</div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
          </Field>
          <Field label="End date">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
          </Field>
        </div>

        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Budget limit (optional)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={budgetLimit}
            onChange={(e) => setBudgetLimit(e.target.value)}
            placeholder={`e.g. 2000 (${currency})`}
            className="input"
          />
        </Field>
      </form>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
