"use client"
import { useEffect, useState } from 'react'
import { sanitizeSR, normalizeOrderbook, validateDecision, tickSizeForMarket, snapToTick } from '@/lib/validation'
import { formatMarkdown } from '@/lib/format'

type Case = { name: string; run: () => void }

export default function TestsPage() {
  const [results, setResults] = useState<{ name: string; ok: boolean; msg?: string }[]>([])

  useEffect(() => {
    const out: { name: string; ok: boolean; msg?: string }[] = []
    const test = (name: string, fn: () => void) => {
      try { fn(); out.push({ name, ok: true }) } catch (e: any) { out.push({ name, ok: false, msg: String(e?.message || e) }) }
    }

    // SR sanitize
    test('sanitizeSR removes NaN and sorts', () => {
      const sr = sanitizeSR({ support: [100, 99.5, NaN, 100], resistance: [110, 111.2] }, 'JP')
      if (sr.support[0] > sr.support[1]) throw new Error('support not sorted')
      if (sr.support.includes(NaN as any)) throw new Error('NaN not removed')
    })

    // Orderbook normalize
    test('normalizeOrderbook computes spread and pressure', () => {
      const ob = normalizeOrderbook({ levels: [{ price: 100, bid: 500 }, { price: 101, ask: 400 }] }, 'JP')
      if (typeof ob.spread !== 'number' || ob.spread <= 0) throw new Error('spread invalid')
      if (!['bid','ask','neutral'].includes(ob.pressure)) throw new Error('pressure invalid')
    })

    // Tick size
    test('tick size JP ranges', () => {
      if (tickSizeForMarket('JP', 900) !== 1) throw new Error('tick size <1000 should be 1')
      if (snapToTick(1003, 'JP') % 1 !== 0) throw new Error('JP snap not integral at low range')
    })

    // Decision validate
    test('validateDecision clamps confidence and snaps levels', () => {
      const v = validateDecision({ decision: 'buy', horizon: 'intraday', levels: { entry: 1003.4, sl: 990.6, tp: [1020.2], sr: { support: [990.6], resistance: [1020.2] } }, confidence: 1.5, rationale: [] }, 'JP')
      if (v.confidence > 1) throw new Error('confidence not clamped')
      if (typeof v.levels.entry === 'number' && v.levels.entry % 1 !== 0) throw new Error('entry not snapped for JP')
    })

    // Markdown format
    test('formatMarkdown returns non-empty', () => {
      const md = formatMarkdown({ decision: 'hold', horizon: 'intraday', rationale: ['テスト'], levels: { sr: { support: [], resistance: [] } }, orderbook: { pressure: 'neutral', levels: [] }, extracted: { market: 'JP' }, confidence: 0.5, notes: [] } as any, { level: 'concise' })
      if (!md || md.length < 10) throw new Error('markdown empty')
    })

    setResults(out)
  }, [])

  const pass = results.filter(r => r.ok).length
  const fail = results.length - pass
  return (
    <main className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">ブラウザ内ユニットテスト（簡易）</h1>
      <div className="mb-3 text-sm">結果: <span className="text-emerald-500">{pass} passed</span> / <span className="text-rose-500">{fail} failed</span></div>
      <ul className="text-sm list-disc ml-5">
        {results.map((r, i) => (
          <li key={i} className={r.ok ? 'text-emerald-500' : 'text-rose-500'}>
            {r.ok ? '✓' : '✗'} {r.name} {r.msg && <span className="text-neutral-400">— {r.msg}</span>}
          </li>
        ))}
      </ul>
    </main>
  )
}
