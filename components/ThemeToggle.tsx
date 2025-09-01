"use client"
import { useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const KEY = 'sta_theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')
  useEffect(() => {
    const t = (localStorage.getItem(KEY) as Theme) || 'system'
    setTheme(t)
    applyTheme(t)
  }, [])

  function applyTheme(t: Theme) {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    if (t === 'light') root.classList.add('light')
    if (t === 'dark') root.classList.add('dark')
  }

  function onChange(t: Theme) {
    setTheme(t)
    localStorage.setItem(KEY, t)
    applyTheme(t)
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-xs text-neutral-500">テーマ</span>
      <select value={theme} onChange={(e) => onChange(e.target.value as Theme)} className="border rounded px-2 py-1">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  )
}

