import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import Modal from '@/components/Modal'
import type { Activity, ActivityCategory, RouteInfo } from '@/lib/types'

const CATEGORIES: { value: ActivityCategory; label: string; emoji: string }[] = [
  { value: 'sight', label: 'Sight', emoji: '🏛️' },
  { value: 'food', label: 'Food', emoji: '🍽️' },
  { value: 'hotel', label: 'Hotel', emoji: '🏨' },
  { value: 'transport', label: 'Transport', emoji: '🚌' },
  { value: 'other', label: 'Other', emoji: '📌' },
]

export default function ActivityEditModal({
  open, onClose, activity, currency, onSave, onDelete,
}: {
  open: boolean
  onClose: () => void
  activity: Activity | null
  currency: string
  onSave: (patch: Partial<Activity>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ActivityCategory | ''>('')
  const [startTime, setStartTime] = useState('')
  const [duration, setDuration] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [photoInput, setPhotoInput] = useState('')
  const [routeMode, setRouteMode] = useState<'straight' | 'drive'>('straight')

  useEffect(() => {
    if (!activity) return
    setTitle(activity.title)
    setCategory(activity.poi?.category ?? '')
    setStartTime(activity.startTime ?? '')
    setDuration(activity.durationMinutes != null ? String(activity.durationMinutes) : '')
    setCostAmount(activity.cost?.amount != null ? String(activity.cost.amount) : '')
    setNotes(activity.notes ?? '')
    setPhotos(activity.photos ?? (activity.poi?.photoUrl ? [activity.poi.photoUrl] : []))
    setPhotoInput('')
    setRouteMode(activity.route?.mode ?? 'straight')
  }, [activity])

  if (!activity) return null

  const handleAddPhoto = () => {
    const url = photoInput.trim()
    if (!url) return
    try { new URL(url) } catch { toast.error('Invalid URL'); return }
    setPhotos((prev) => [...prev, url])
    setPhotoInput('')
  }

  const handleSave = () => {
    const patch: Partial<Activity> = {
      title: title.trim() || activity.title,
      startTime: startTime || undefined,
      durationMinutes: duration ? Number(duration) : undefined,
      cost: costAmount ? { amount: Number(costAmount), currency } : undefined,
      notes: notes || undefined,
      photos: photos.length > 0 ? photos : undefined,
    }
    if (activity.poi && category) {
      patch.poi = { ...activity.poi, category: category as ActivityCategory }
    }
    // hotelCheckIn anchors a hotel-stay to its host day. If the user changes the
    // category away from 'hotel', the anchor is no longer meaningful.
    const wasHotel = activity.poi?.category === 'hotel' && !!activity.hotelCheckIn
    if (wasHotel && category !== 'hotel') {
      patch.hotelCheckIn = undefined
    }
    if (activity.type === 'transport') {
      const prevMode = activity.route?.mode ?? 'straight'
      if (routeMode !== prevMode || !activity.route) {
        patch.route = { mode: routeMode } as RouteInfo
      }
    }
    // Close immediately; the write is latency-compensated locally and toasts on rejection.
    onClose()
    onSave(patch).catch((e) => {
      toast.error('Save failed')
      console.error(e)
    })
  }

  const handleDelete = () => {
    if (!confirm('Remove this activity?')) return
    onClose()
    onDelete().catch((e) => {
      toast.error('Delete failed')
      console.error(e)
    })
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

        {/* Route mode — transport only */}
        {activity.type === 'transport' && (
          <div>
            <span className="text-sm font-medium text-slate-700">Map route</span>
            <div className="mt-1 flex gap-2">
              {(['straight', 'drive'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRouteMode(mode)}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                    routeMode === mode
                      ? 'border-sky-500 bg-sky-50 text-sky-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {mode === 'straight' ? '📏 Straight line' : '🛣️ Drive route'}
                </button>
              ))}
            </div>
            {routeMode === 'drive' && !activity.route?.polyline && (
              <p className="mt-1 text-xs text-slate-400">Route will be fetched automatically after saving.</p>
            )}
          </div>
        )}

        {/* Photo URLs */}
        <div>
          <span className="text-sm font-medium text-slate-700">Photos</span>
          {photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((url, i) => (
                <div key={i} className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-slate-200">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100"
                    aria-label="Remove photo"
                  >
                    <X className="h-4 w-4 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <input
              type="url"
              value={photoInput}
              onChange={(e) => setPhotoInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddPhoto() } }}
              placeholder="Paste photo URL…"
              className="input flex-1"
            />
            <button
              type="button"
              onClick={handleAddPhoto}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50"
            >
              Add
            </button>
          </div>
        </div>
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
