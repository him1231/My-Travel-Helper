import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plane, ClipboardPaste, Pencil } from 'lucide-react'
import Modal from '@/components/Modal'
import IataAutocomplete from '@/components/IataAutocomplete'
import type { FlightInfo, Money } from '@/lib/types'
import { parseFlightText } from '@/lib/flightParse'
import { searchAirports, searchAirlines, findAirport, type IataAirport, type IataAirline } from '@/lib/iata'

type Tab = 'manual' | 'paste'

export default function FlightImportModal({
  open, onClose, onSubmit, initialFlight, initialCost, currency, onDelete,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (flight: FlightInfo, cost?: Money) => Promise<void> | void
  initialFlight?: FlightInfo
  initialCost?: Money
  currency?: string
  onDelete?: () => Promise<void> | void
}) {
  const [tab, setTab] = useState<Tab>('manual')
  // form state — flat fields that mirror FlightInfo
  const [airline, setAirline] = useState('')
  const [flightNumber, setFlightNumber] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [seat, setSeat] = useState('')
  const [bookingClass, setBookingClass] = useState('')
  const [depCode, setDepCode] = useState('')
  const [depCity, setDepCity] = useState('')
  const [depTime, setDepTime] = useState('')   // ISO local "YYYY-MM-DDTHH:mm"
  const [depTerminal, setDepTerminal] = useState('')
  const [depGate, setDepGate] = useState('')
  const [arrCode, setArrCode] = useState('')
  const [arrCity, setArrCity] = useState('')
  const [arrTime, setArrTime] = useState('')
  const [arrTerminal, setArrTerminal] = useState('')
  const [arrGate, setArrGate] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [costAmount, setCostAmount] = useState('')

  // Seed form when opened in edit mode
  useEffect(() => {
    if (!open) return
    if (initialFlight) {
      setAirline(initialFlight.airline ?? '')
      setFlightNumber(initialFlight.flightNumber ?? '')
      setConfirmation(initialFlight.confirmation ?? '')
      setSeat(initialFlight.seat ?? '')
      setBookingClass(initialFlight.bookingClass ?? '')
      setDepCode(initialFlight.departure.airportCode ?? '')
      setDepCity(initialFlight.departure.city ?? '')
      setDepTime(initialFlight.departure.time ?? '')
      setDepTerminal(initialFlight.departure.terminal ?? '')
      setDepGate(initialFlight.departure.gate ?? '')
      setArrCode(initialFlight.arrival.airportCode ?? '')
      setArrCity(initialFlight.arrival.city ?? '')
      setArrTime(initialFlight.arrival.time ?? '')
      setArrTerminal(initialFlight.arrival.terminal ?? '')
      setArrGate(initialFlight.arrival.gate ?? '')
    }
    setCostAmount(initialCost?.amount != null ? String(initialCost.amount) : '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const reset = () => {
    setTab('manual')
    setAirline(''); setFlightNumber(''); setConfirmation(''); setSeat(''); setBookingClass('')
    setDepCode(''); setDepCity(''); setDepTime(''); setDepTerminal(''); setDepGate('')
    setArrCode(''); setArrCity(''); setArrTime(''); setArrTerminal(''); setArrGate('')
    setPastedText(''); setCostAmount('')
  }

  const close = () => { reset(); onClose() }

  const applyParsed = () => {
    const r = parseFlightText(pastedText)
    if (r.airline) setAirline(r.airline)
    if (r.flightNumber) setFlightNumber(r.flightNumber)
    if (r.confirmation) setConfirmation(r.confirmation)
    if (r.seat) setSeat(r.seat)
    if (r.bookingClass) setBookingClass(r.bookingClass)
    if (r.departure?.airportCode) setDepCode(r.departure.airportCode)
    if (r.departure?.city) setDepCity(r.departure.city)
    if (r.departure?.time) setDepTime(r.departure.time)
    if (r.departure?.terminal) setDepTerminal(r.departure.terminal)
    if (r.departure?.gate) setDepGate(r.departure.gate)
    if (r.arrival?.airportCode) setArrCode(r.arrival.airportCode)
    if (r.arrival?.city) setArrCity(r.arrival.city)
    if (r.arrival?.time) setArrTime(r.arrival.time)
    if (r.arrival?.terminal) setArrTerminal(r.arrival.terminal)
    if (r.arrival?.gate) setArrGate(r.arrival.gate)
    setTab('manual') // jump to manual so user can review
    toast.success('Flight info extracted — please review')
  }

  const handleSave = () => {
    if (!flightNumber.trim() && !depCode.trim() && !arrCode.trim()) {
      toast.error('Enter at least a flight number or airports')
      return
    }
    const flight: FlightInfo = {
      airline: airline.trim() || undefined,
      flightNumber: flightNumber.trim().toUpperCase() || undefined,
      confirmation: confirmation.trim() || undefined,
      seat: seat.trim() || undefined,
      bookingClass: bookingClass.trim() || undefined,
      departure: {
        airportCode: depCode.trim().toUpperCase() || undefined,
        city: depCity.trim() || undefined,
        time: depTime || undefined,
        terminal: depTerminal.trim() || undefined,
        gate: depGate.trim() || undefined,
      },
      arrival: {
        airportCode: arrCode.trim().toUpperCase() || undefined,
        city: arrCity.trim() || undefined,
        time: arrTime || undefined,
        terminal: arrTerminal.trim() || undefined,
        gate: arrGate.trim() || undefined,
      },
    }
    const cost: Money | undefined = costAmount.trim()
      ? { amount: Number(costAmount), currency: currency ?? initialCost?.currency ?? 'USD' }
      : undefined
    close()
    Promise.resolve(onSubmit(flight, cost)).catch((e) => {
      console.error(e); toast.error('Failed to save flight')
    })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={initialFlight ? 'Edit flight info' : 'Add flight'}
      footer={
        <>
          {onDelete && (
            <button
              onClick={() => {
                if (!confirm('Remove this flight activity?')) return
                close()
                Promise.resolve(onDelete()).catch((e) => { console.error(e); toast.error('Failed to delete flight') })
              }}
              className="mr-auto text-sm text-red-600 hover:underline"
            >
              Delete
            </button>
          )}
          <button onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            <Plane className="h-3.5 w-3.5" /> Save flight
          </button>
        </>
      }
    >
      {/* Tab strip */}
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => setTab('manual')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            tab === 'manual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Pencil className="h-3.5 w-3.5" /> Manual
        </button>
        <button
          onClick={() => setTab('paste')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            tab === 'paste' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ClipboardPaste className="h-3.5 w-3.5" /> Paste from email
        </button>
      </div>

      {tab === 'paste' ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Paste a flight confirmation email. We'll best-effort extract airline,
            flight number, airports, times, confirmation number, seat, and gate —
            then you'll review and edit before saving.
          </p>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={10}
            placeholder="Paste the full confirmation email text here…"
            className="input w-full font-mono text-xs"
          />
          <button
            onClick={applyParsed}
            disabled={!pastedText.trim()}
            className="w-full rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
          >
            Extract flight info →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Airline">
              <IataAutocomplete<IataAirline>
                value={airline}
                onChange={setAirline}
                onSelect={(a) => {
                  setAirline(a.name)
                  // If the flight number looks empty or doesn't already start with the carrier code, prefix it.
                  if (!flightNumber.trim()) setFlightNumber(`${a.code} `)
                  else if (!/^[A-Z0-9]{2,3}\b/.test(flightNumber.trim().toUpperCase())) {
                    setFlightNumber(`${a.code} ${flightNumber.trim()}`)
                  }
                }}
                search={(q) => searchAirlines(q, 8)}
                renderItem={(a) => (
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono font-semibold text-slate-700">{a.code}</span>
                    <span className="truncate">{a.name}</span>
                    {a.country && <span className="ml-auto text-[10px] text-slate-400">{a.country}</span>}
                  </div>
                )}
                itemToValue={(a) => a.name}
                placeholder="American Airlines"
              />
            </Field>
            <Field label="Flight #">
              <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} className="input" placeholder="AA 100" />
            </Field>
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-500">Departure</legend>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Airport (IATA)">
                <IataAutocomplete<IataAirport>
                  value={depCode}
                  onChange={(v) => {
                    setDepCode(v)
                    // Auto-fill city if the typed code matches a known airport and city is empty.
                    if (!depCity.trim() && v.length === 3) {
                      const hit = findAirport(v)
                      if (hit?.city) setDepCity(hit.city)
                    }
                  }}
                  onSelect={(ap) => {
                    setDepCode(ap.code)
                    if (ap.city) setDepCity(ap.city)
                  }}
                  search={(q) => searchAirports(q, 8)}
                  renderItem={(ap) => (
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono font-semibold text-slate-700">{ap.code}</span>
                      <span className="truncate">{ap.city}</span>
                      <span className="ml-auto truncate text-[10px] text-slate-400">{ap.name}</span>
                    </div>
                  )}
                  itemToValue={(ap) => ap.code}
                  placeholder="JFK"
                  maxLength={3}
                  uppercase
                />
              </Field>
              <Field label="City">
                <input value={depCity} onChange={(e) => setDepCity(e.target.value)} className="input" placeholder="New York" />
              </Field>
            </div>
            <Field label="Departure (local time)">
              <input type="datetime-local" value={depTime} onChange={(e) => setDepTime(e.target.value)} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Terminal">
                <input value={depTerminal} onChange={(e) => setDepTerminal(e.target.value)} className="input" />
              </Field>
              <Field label="Gate">
                <input value={depGate} onChange={(e) => setDepGate(e.target.value)} className="input" />
              </Field>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-500">Arrival</legend>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Airport (IATA)">
                <IataAutocomplete<IataAirport>
                  value={arrCode}
                  onChange={(v) => {
                    setArrCode(v)
                    if (!arrCity.trim() && v.length === 3) {
                      const hit = findAirport(v)
                      if (hit?.city) setArrCity(hit.city)
                    }
                  }}
                  onSelect={(ap) => {
                    setArrCode(ap.code)
                    if (ap.city) setArrCity(ap.city)
                  }}
                  search={(q) => searchAirports(q, 8)}
                  renderItem={(ap) => (
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono font-semibold text-slate-700">{ap.code}</span>
                      <span className="truncate">{ap.city}</span>
                      <span className="ml-auto truncate text-[10px] text-slate-400">{ap.name}</span>
                    </div>
                  )}
                  itemToValue={(ap) => ap.code}
                  placeholder="LHR"
                  maxLength={3}
                  uppercase
                />
              </Field>
              <Field label="City">
                <input value={arrCity} onChange={(e) => setArrCity(e.target.value)} className="input" placeholder="London" />
              </Field>
            </div>
            <Field label="Arrival (local time)">
              <input type="datetime-local" value={arrTime} onChange={(e) => setArrTime(e.target.value)} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Terminal">
                <input value={arrTerminal} onChange={(e) => setArrTerminal(e.target.value)} className="input" />
              </Field>
              <Field label="Gate">
                <input value={arrGate} onChange={(e) => setArrGate(e.target.value)} className="input" />
              </Field>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Confirmation / PNR">
              <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="input" placeholder="ABC123" />
            </Field>
            <Field label="Seat">
              <input value={seat} onChange={(e) => setSeat(e.target.value)} className="input" placeholder="12A" />
            </Field>
          </div>
          <Field label="Class">
            <input value={bookingClass} onChange={(e) => setBookingClass(e.target.value)} className="input" placeholder="Economy" />
          </Field>
          <Field label={`Cost${currency ? ` (${currency})` : ''}`}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costAmount}
              onChange={(e) => setCostAmount(e.target.value)}
              className="input"
              placeholder="0.00"
            />
          </Field>
        </div>
      )}
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-600">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  )
}
