import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '@/components/Modal'
import type { Activity, ActivityCategory, Day } from '@/lib/types'
import { updateActivity, removeActivity } from '@/lib/firestore/trips'

const CATEGORIES: { value: ActivityCategory; label: string; emoji: string }[] = [
  { value: 'sight', label: 'Sight', emoji: '🏛️' },
  { value: 'food', label: 'Food', emoji: '🍽️' },
  { value: 'hotel', label: 'Hotel', emoji: '🏨' },
  { value: 'transport', label: 'Transport', emoji: '🚌' },
  { value: 'other', label: 'Other', emoji: '📌' },
]

export default function ActivityEditModal({
  open, onClose, tripId, day, activity, currency,
}: {
  open: boolean
  onClose: () => void
  tripId: string
  day: Day
  activity: Activity | null
  currency: string
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ActivityCategory | ''>('')
  const [startTime, setStartTime] = useState('')
  const [duration, setDuration] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!activity) return
    setTitle(activity.title)
    setCategory(activity.poi?.category ?? '')
    setStartTime(activity.startTime ?? '')
    setDuration(activity.durationMinutes != null ? String(activity.durationMinutes) : '')
    setCostAmount(activity.cost?.amount != null ? String(activity.cost.amount) : '')
    setNotes(activity.notes ?? '')
  }, [activity])

  if (!activity) return null

  const handleSave = async () => {
    try {
      const patch: Partial<Activity> = {
        title: title.trim() || activity.title,
        startTime: startTime || undefined,
        durationMinutes: duration ? Number(duration) : undefined,
        cost: costAmount ? { amount: Number(costAmount), currency } : undefined,
        notes: notes || undefined,
      }
      if (activity.poi && category) {
        patch.poi = { ...activity.poi, category: category as ActivityCategory }
      }
      await updateActivity(tripId, day, activity.id, patch)
      onClose()
    } catch (e) {
      toast.error('Save failed')
      console.error(e)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Remove this activity?')) return
    try {
      await removeActivity(tripId, day, activity.id)
      onClose()
    } catch (e) {
      toast.error('Delete failed')
      console.error(e)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit activity"
      footer={
        <>
          <button onClick={handleDelete} className="mr-auto text-sm text-red-600 hover:underline">Delete</button>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">Save</button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
        </Field>

        <div>
          <span className="text-sm font-medium text-slate-700">Category</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(category === c.value ? '' : c.value)}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                  category === c.value
                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <span>{c.emoji}</span> {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" />
          </Field>
          <Field label="Duration (min)">
            <input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} className="input" />
          </Field>
        </div>
        <Field label={`Cost (${currency})`}>
          <input type="number" min="0" step="0.01" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} className="input" />
        </Field>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input" />
        </Field>
      </div>
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
