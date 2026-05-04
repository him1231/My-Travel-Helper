import { useEffect, useState } from 'react'

interface DayForecast {
  date: string        // YYYY-MM-DD
  tempMax: number
  tempMin: number
  weatherCode: number
}

// WMO Weather interpretation codes → emoji
function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code <= 3) return '☁️'
  if (code <= 49) return '🌫️'
  if (code <= 59) return '🌦️'
  if (code <= 69) return '🌨️'
  if (code <= 79) return '❄️'
  if (code <= 84) return '🌧️'
  if (code <= 94) return '⛈️'
  return '🌩️'
}

function formatShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function WeatherWidget({ lat, lng }: { lat: number; lng: number }) {
  const [forecast, setForecast] = useState<DayForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const days: DayForecast[] = data.daily.time.map((date: string, i: number) => ({
          date,
          tempMax: Math.round(data.daily.temperature_2m_max[i]),
          tempMin: Math.round(data.daily.temperature_2m_min[i]),
          weatherCode: data.daily.weathercode[i],
        }))
        setForecast(days)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [lat, lng])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="animate-pulse">Loading weather…</span>
      </div>
    )
  }

  if (error || forecast.length === 0) return null

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {forecast.map((d) => (
        <div
          key={d.date}
          className="flex min-w-[60px] flex-shrink-0 flex-col items-center gap-0.5 rounded-xl border border-slate-100 bg-white px-2 py-2 text-center shadow-sm"
          title={formatShort(d.date)}
        >
          <span className="text-lg">{weatherEmoji(d.weatherCode)}</span>
          <span className="text-xs font-medium text-slate-700">{d.tempMax}°</span>
          <span className="text-xs text-slate-400">{d.tempMin}°</span>
          <span className="text-[10px] text-slate-400">{d.date.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}
