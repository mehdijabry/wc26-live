import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  })
}

export function timeUntil(iso: string) {
  const target = new Date(iso).getTime()
  const now = Date.now()
  const delta = target - now
  if (delta <= 0) return { d: 0, h: 0, m: 0, s: 0, done: true }
  const d = Math.floor(delta / 86_400_000)
  const h = Math.floor((delta % 86_400_000) / 3_600_000)
  const m = Math.floor((delta % 3_600_000) / 60_000)
  const s = Math.floor((delta % 60_000) / 1000)
  return { d, h, m, s, done: false }
}

export function userTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
