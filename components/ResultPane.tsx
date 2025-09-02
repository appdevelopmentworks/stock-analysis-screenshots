import { useEffect, useState } from 'react'
import { formatMarkdown, formatScenarioMarkdown } from '@/lib/format'

type Props = { data: any; meta?: any; historyId?: string | null }
export function ResultPane({ data, meta, historyId }: Props) {
  const [tone, setTone] = useState<'concise'|'learning'>('concise')
  const [copied, setCopied] = useState<'json'|'md'|null>(null)
  const [saved, setSaved] = useState<'json'|'md'|'link'|null>(null)
  useEffect(() => {
    const s = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sta_settings_v1') || '{}') : {}
    if (s?.tone) setTone(s.tone)
  }, [])
  if (!data) return null
  const { decision, horizon, rationale, confidence } = data
  const md = formatMarkdown(data, { meta, level: tone })
  const scenarios = data.scenarios || {}
  const providers = data.providers || {}
  const label = (p?: string) => p === 'openai' ? 'OpenAI' : p === 'groq' ? 'Groq' : p === 'openrouter' ? 'OpenRouter' : p ?? '—'
  const provText = (providers.vision || providers.decision || data.provider)
    ? `Vision: ${label(providers.vision)} / Decision: ${label(providers.decision ?? data.provider)}`
    : null
  const extraction = (data as any).extraction

  async function copy(text: string, kind: 'json'|'md') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1200)
    } catch {}
  }
  function download(text: string, filename: string, kind: 'json'|'md') {
    const blob = new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setSaved(kind)
    setTimeout(() => setSaved(null), 1200)
  }
  async function copyShareLink() {
    try {
      const url = new URL(window.location.href)
      if (historyId) url.searchParams.set('id', historyId)
      await navigator.clipboard.writeText(url.toString())
      setSaved('link')
      setTimeout(() => setSaved(null), 1200)
    } catch {}
  }
  return (
    <div className="rounded border p-4 space-y-3">
      {Array.isArray(data?.notes) && data.notes.some((n: string) => n.includes('スタブ返却')) && (
        <div className="mb-2 rounded border border-amber-400 bg-amber-50 text-amber-800 px-3 py-2 text-xs">
          これはスタブ（ダミー）応答です。キー未設定/抽出失敗時に表示されます。
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">結果</h2>
        <div className="flex items-center gap-2">
          {provText && (<span className="text-xs text-neutral-500">{provText}</span>)}
          <button className="text-xs border rounded px-2 py-1" onClick={() => copy(JSON.stringify(data, null, 2), 'json')}>{copied==='json' ? 'JSONコピー済' : 'JSONコピー'}</button>
          <button className="text-xs border rounded px-2 py-1" onClick={() => copy(md, 'md')}>{copied==='md' ? 'MDコピー済' : 'MDコピー'}</button>
          <button className="text-xs border rounded px-2 py-1" onClick={() => download(JSON.stringify(data, null, 2), `analysis-${new Date().toISOString()}.json`, 'json')}>{saved==='json' ? 'JSON保存済' : 'JSON保存'}</button>
          <button className="text-xs border rounded px-2 py-1" onClick={() => download(md, `analysis-${new Date().toISOString()}.md`, 'md')}>{saved==='md' ? 'MD保存済' : 'MD保存'}</button>
          {historyId && <button className="text-xs border rounded px-2 py-1" onClick={copyShareLink}>{saved==='link' ? '共有リンクコピー済' : '共有リンク'}</button>}
          { (scenarios.base || scenarios.bull || scenarios.bear) && (
            <button className="text-xs border rounded px-2 py-1" onClick={() => copy(formatScenarioMarkdown(data), 'md')}>
              {copied==='md' ? 'シナリオMDコピー済' : 'シナリオMDコピー'}
            </button>
          )}
          <span className="text-xs">信頼度: {(confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className="text-sm">結論: <b>{decision}</b>（{horizon}）<span className="ml-2 text-xs text-neutral-500">トーン: {tone}</span></div>
      {extraction && (
        <details className="rounded border border-default bg-card text-foreground px-3 py-2 text-xs">
          <summary>診断（抽出の要点）</summary>
          <div className="mt-1 space-y-1">
            <div>ticker: {extraction?.extracted?.ticker ?? '—'} / market: {extraction?.extracted?.market ?? '—'} / timeframe: {extraction?.extracted?.timeframe ?? '—'}</div>
            <div>SR: S={Array.isArray(extraction?.levels?.sr?.support) ? extraction.levels.sr.support.slice(0,3).join(', ') : '—'} / R={Array.isArray(extraction?.levels?.sr?.resistance) ? extraction.levels.sr.resistance.slice(0,3).join(', ') : '—'}</div>
            <div>板: levels={Array.isArray(extraction?.orderbook?.levels) ? extraction.orderbook.levels.length : 0} / pressure={extraction?.orderbook?.pressure ?? '—'}</div>
          </div>
        </details>
      )}
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
