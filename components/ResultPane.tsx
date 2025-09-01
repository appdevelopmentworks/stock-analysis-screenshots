import { useEffect, useState } from 'react'
import { formatMarkdown, formatScenarioMarkdown } from '@/lib/format'

type Props = { data: any; meta?: any }
export function ResultPane({ data, meta }: Props) {
  const [tone, setTone] = useState<'concise'|'learning'>('concise')
  const [copied, setCopied] = useState<'json'|'md'|null>(null)
  useEffect(() => {
    const s = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sta_settings_v1') || '{}') : {}
    if (s?.tone) setTone(s.tone)
  }, [])
  if (!data) return null
  const { decision, horizon, rationale, confidence } = data
  const md = formatMarkdown(data, { meta, level: tone })
  const scenarios = data.scenarios || {}

  async function copy(text: string, kind: 'json'|'md') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1200)
    } catch {}
  }
  return (
    <div className="rounded border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">結果</h2>
        <div className="flex items-center gap-2">
          <button className="text-xs border rounded px-2 py-1" onClick={() => copy(JSON.stringify(data, null, 2), 'json')}>{copied==='json' ? 'JSONコピー済' : 'JSONコピー'}</button>
          <button className="text-xs border rounded px-2 py-1" onClick={() => copy(md, 'md')}>{copied==='md' ? 'MDコピー済' : 'MDコピー'}</button>
          { (scenarios.base || scenarios.bull || scenarios.bear) && (
            <button className="text-xs border rounded px-2 py-1" onClick={() => copy(formatScenarioMarkdown(data), 'md')}>
              {copied==='md' ? 'シナリオMDコピー済' : 'シナリオMDコピー'}
            </button>
          )}
          <span className="text-xs">信頼度: {(confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className="text-sm">結論: <b>{decision}</b>（{horizon}）<span className="ml-2 text-xs text-neutral-500">トーン: {tone}</span></div>
      <div className="max-w-none">
        {/* naive markdown rendering: pre for now */}
        <pre className="bg-card text-foreground border border-default p-3 rounded overflow-auto text-sm whitespace-pre-wrap">{md}</pre>
      </div>
      { (scenarios.base || scenarios.bull || scenarios.bear) && (
        <div className="grid gap-3">
          <h3 className="font-medium">シナリオ</h3>
          <div className="grid md:grid-cols-3 gap-3">
            {['base','bull','bear'].map((k) => scenarios[k] && (
              <div key={k} className={`rounded border p-3 text-sm ${k==='bull' ? 'border-emerald-500/60 bg-emerald-500/5' : k==='bear' ? 'border-rose-500/60 bg-rose-500/5' : 'border-sky-500/60 bg-sky-500/5'}`}>
                <div className="font-semibold mb-1">{k === 'base' ? 'ベース' : k === 'bull' ? '強気' : '弱気'}</div>
                {scenarios[k]?.conditions && <div>条件: {scenarios[k].conditions}</div>}
                <div>Entry: {scenarios[k]?.entry ?? '—'}</div>
                <div className="">SL(無効化): <span className="font-medium">{scenarios[k]?.sl ?? '—'}</span></div>
                <div>TP: {Array.isArray(scenarios[k]?.tp) ? scenarios[k].tp.slice(0,3).join(', ') : '—'}</div>
                {Array.isArray(scenarios[k]?.rationale) && scenarios[k].rationale.length > 0 && (
                  <ul className="list-disc ml-5 mt-1">
                    {scenarios[k].rationale.slice(0,3).map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                )}
                {scenarios[k]?.rr && <div>想定RR: <span className="font-semibold">{scenarios[k].rr}</span> {Number(scenarios[k]?.rr) >= 1.5 ? '✅' : '⚠️'}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      <details>
        <summary className="cursor-pointer select-none text-sm">JSON 詳細</summary>
        <pre className="bg-card text-foreground border border-default p-3 rounded overflow-auto text-xs">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  )
}
