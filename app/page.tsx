"use client"
import { useState } from 'react'
import { motion } from 'framer-motion'
import { SettingsSheet } from '@/components/SettingsSheet'
import { StubBanner } from '@/components/StubBanner'
import { HistoryDrawer } from '@/components/HistoryDrawer'
import { addHistory, fileToDataUrl } from '@/lib/history'
import { ResultPane } from '@/components/ResultPane'
import { analyzeImageQuality, preprocessIfNeeded } from '@/lib/image'
import { detectUiSourceFromImage } from '@/lib/ui-detect'
import { Button } from '@/components/ui/Button'

export default function Page() {
  const [files, setFiles] = useState<File[]>([])
  const [result, setResult] = useState<any>(null)
  const [phase, setPhase] = useState<'idle'|'extraction'|'decision'|'done'>('idle')
  const [loading, setLoading] = useState(false)
  const [lastMeta, setLastMeta] = useState<any>(null)
  const [progress, setProgress] = useState<{pct:number,msg?:string}|null>(null)
  const [qualityHints, setQualityHints] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [lastErrorContext, setLastErrorContext] = useState<any>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [preprocInfo, setPreprocInfo] = useState<any[]>([])

  // Load by share link (?id=...) if present
  if (typeof window !== 'undefined' && typeof (window as any).__sta_init_once__ === 'undefined') {
    (window as any).__sta_init_once__ = true
    ;(async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const id = params.get('id')
        if (id) {
          const mod = await import('@/lib/history')
          const entry = await mod.getHistory(id)
          if (entry) {
            setResult(entry.result)
            setLastMeta(entry.meta)
            setHistoryId(entry.id)
          }
        }
      } catch {}
    })()
  }

  async function onAnalyze() {
    setLoading(true)
    setPhase('idle')
    setErrorMsg(null)
    setResult(null)
    setProgress(null)
    setLastMeta(null)
    setLogs([])
    setHistoryId(null)
    try {
      const fd = new FormData()
      // Preprocess images if enabled (force for HEIC/HEIF on iOS)
      const settings = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sta_settings_v1') || '{}') : {}
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
      const isiOS = /iPhone|iPad|iPod/.test(ua)
      const hasHeic = files.some(f => /heic|heif/i.test(f.type) || /\.heic$|\.heif$/i.test(f.name))
      const needForceConvert = isiOS && hasHeic
      // record pre metrics
      const preMetrics = await Promise.all(files.map(async (f) => ({ name: f.name, before: await analyzeImageQuality(f) })))
      const pre = await preprocessIfNeeded(files, { autoCompress: (!!settings?.autoCompress) || needForceConvert, maxLongEdge: settings?.maxLongEdge ?? 1280, quality: settings?.jpegQuality ?? 0.85 })
      const postMetrics = await Promise.all(pre.map(async (f) => ({ after: await analyzeImageQuality(f) })))
      const combined = preMetrics.map((m, i) => ({ name: m.name, ...m.before, after: postMetrics[i]?.after }))
      setPreprocInfo(combined)
      // UI source auto-detect (first image) if Auto
      let autoUi: any = null
      if (!settings?.uiSource || settings.uiSource === 'Auto') {
        try { autoUi = await detectUiSourceFromImage(pre[0]) } catch {}
      }
      const hints: string[] = []
      for (const f of pre) {
        try {
          const q = await analyzeImageQuality(f)
          const minEdge = settings?.minLongEdge ?? 900
          const minBlur = settings?.minBlurScore ?? 0.02
          const maxKB = settings?.maxFileKB ?? 6000
          if (q.longEdge < minEdge) hints.push(`${f.name}: 低解像度（長辺${q.longEdge}px < ${minEdge}px）`)
          if (q.blurScore < minBlur) hints.push(`${f.name}: ぼやけあり（指標${q.blurScore.toFixed(3)} < ${minBlur}）`)
          if (q.fileKB > maxKB) hints.push(`${f.name}: ファイルサイズ大（${q.fileKB}KB > ${maxKB}KB）→圧縮推奨`)
        } catch {}
      }
      setQualityHints(hints)
      pre.forEach(f => fd.append('files', f))
      // Load client settings to pass keys and preferences
      const runtime = typeof window !== 'undefined'
        ? (JSON.parse(sessionStorage.getItem('sta_runtime_keys_v1') || 'null')
          || JSON.parse(localStorage.getItem('sta_runtime_keys_backup_v1') || 'null') || {})
        : {}
      if (!runtime?.groqKey && !runtime?.openaiKey && !runtime?.openrouterKey) {
        setLoading(false)
        setProgress(null)
        setErrorMsg('APIキーが未復号です。設定を開き、PINで「復号（使用可能に）」を押してください。')
        return
      }
      const meta: any = { market: 'JP', tone: settings?.tone ?? 'concise', profile: settings?.profile ?? 'balanced', provider: settings?.provider ?? 'groq', promptProfile: settings?.promptProfile ?? 'default', model: settings?.model || settings?.openaiModel || 'gpt-4o-mini' }
      if (settings?.uiSource && settings.uiSource !== 'Auto') meta.uiSource = settings.uiSource
      if (!meta.uiSource && autoUi && autoUi !== 'Unknown') meta.uiSource = autoUi
      setLastMeta(meta)
      fd.append('meta', JSON.stringify(meta))
      // iOS Safari は fetch のSSEストリーミングが不安定なためオフにする
      const headers: Record<string, string> = {}
      if (!isiOS) headers['X-Stream'] = '1'
      if (runtime?.groqKey) headers['X-API-Key'] = runtime.groqKey
      if (runtime?.openaiKey) headers['X-OpenAI-Key'] = runtime.openaiKey
      if (runtime?.openrouterKey) headers['X-OpenRouter-Key'] = runtime.openrouterKey
      const res = await fetch('/api/analyze', { method: 'POST', body: fd, headers })
      const isStream = (res.headers.get('content-type') || '').includes('text/event-stream') && !isiOS
      if (isStream && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() || ''
          for (const chunk of chunks) {
            const line = chunk.split('\n').find(l => l.startsWith('data:'))
            if (!line) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            try {
              const evt = JSON.parse(payload)
              if (evt.event === 'progress') {
                setProgress({ pct: evt.pct ?? 0, msg: evt.msg })
              } else if (evt.event === 'log') {
                setProgress({ pct: progress?.pct ?? 0, msg: `${evt.data?.stage ?? ''}: ${evt.data?.error ?? ''}` })
                setLogs((prev) => [...prev, `${evt.data?.stage ?? ''}: ${evt.data?.error ?? evt.data?.provider ?? ''} ${evt.data?.status ?? ''}`].slice(-200))
              } else if (evt.event === 'extraction') {
                setPhase('extraction')
                setResult((prev: any) => ({ ...(prev || {}), extraction: evt.data }))
              } else if (evt.event === 'decision') {
                setPhase('decision')
                const d = evt.data
                const isStub = Array.isArray(d?.notes) && d.notes.some((n: string) => n.includes('スタブ返却'))
                const isNone = d?.provider === 'none' || d?.providers?.decision === 'none'
                if (isStub || isNone) {
                  setErrorMsg('モデル応答の整形に失敗したため結果を表示できませんでした。画像や設定を見直すか、別プロバイダ/プロファイルで再実行してください。')
                  setLastErrorContext({ provider: (d?.providers?.decision || d?.provider || 'unknown') })
                } else {
                  setResult((prev: any) => ({ ...(prev || {}), ...d }))
                }
              } else if (evt.event === 'end') {
                setPhase('done')
              }
            } catch {}
          }
        }
      } else {
        const data = await res.json()
        const isStub = Array.isArray(data?.notes) && data.notes.some((n: string) => n.includes('スタブ返却'))
        const isNone = data?.provider === 'none' || data?.providers?.decision === 'none'
        if (isStub || isNone) {
          setErrorMsg('モデル応答の整形に失敗したため結果を表示できませんでした。画像や設定を見直すか、別プロバイダ/プロファイルで再実行してください。')
          setLastErrorContext({ provider: (data?.providers?.decision || data?.provider || 'unknown') })
        } else {
          setResult(data)
        }
        setPhase('done')
      }

      // Save to history (browser only) after we have final result
      if (typeof window !== 'undefined') {
        const fileData = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, dataUrl: await fileToDataUrl(f) })))
        const id = new Date().toISOString()
        const entry = { id, meta: lastMeta || {}, files: fileData, result }
        await addHistory(entry as any)
        setHistoryId(id)
      }
    } finally {
      setLoading(false)
    }
  }

  async function reeval(withFiles: File[], meta: any) {
    setFiles(withFiles)
    setResult(null)
    setProgress(null)
    setErrorMsg(null)
    setLastErrorContext(null)
    // reuse onAnalyze flow but with provided files/meta
    setLoading(true)
    setPhase('idle')
    try {
      const fd = new FormData()
      withFiles.forEach(f => fd.append('files', f))
      setLastMeta(meta)
      fd.append('meta', JSON.stringify(meta))
      const settings = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sta_settings_v1') || '{}') : {}
      const runtime = typeof window !== 'undefined'
        ? (JSON.parse(sessionStorage.getItem('sta_runtime_keys_v1') || 'null')
          || JSON.parse(localStorage.getItem('sta_runtime_keys_backup_v1') || 'null') || {})
        : {}
      const headers: Record<string, string> = { 'X-Stream': '1' }
      if (runtime?.groqKey) headers['X-API-Key'] = runtime.groqKey
      if (runtime?.openaiKey) headers['X-OpenAI-Key'] = runtime.openaiKey
      const res = await fetch('/api/analyze', { method: 'POST', body: fd, headers })
      const isStream = (res.headers.get('content-type') || '').includes('text/event-stream')
      if (isStream && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() || ''
          for (const chunk of chunks) {
            const line = chunk.split('\n').find(l => l.startsWith('data:'))
            if (!line) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            try {
              const evt = JSON.parse(payload)
              if (evt.event === 'extraction') {
                setPhase('extraction')
                setResult((prev: any) => ({ ...(prev || {}), extraction: evt.data }))
              } else if (evt.event === 'decision') {
                setPhase('decision')
                setResult(evt.data)
              } else if (evt.event === 'end') {
                setPhase('done')
              }
            } catch {}
          }
        }
      } else {
        if (!res.ok) {
          const txt = await res.text()
          throw new Error(`API error ${res.status}: ${txt}`)
        }
        const data = await res.json()
        const isStub = Array.isArray(data?.notes) && data.notes.some((n: string) => n.includes('スタブ返却'))
        const isNone = data?.provider === 'none' || data?.providers?.decision === 'none'
        if (isStub || isNone) {
          setErrorMsg('モデル応答の整形に失敗したため結果を表示できませんでした。画像や設定を見直すか、別プロバイダ/プロファイルで再実行してください。')
        } else {
          setResult(data)
        }
        setPhase('done')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="container mx-auto p-4 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">スクショ解析アドバイザ（MVP）</h1>
      <StubBanner />
      <div className="grid gap-4">
        <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="block w-full" />
        {/* Settings quick access */}
        <details className="rounded border p-3">
          <summary className="cursor-pointer select-none">設定（キー/プロファイル）</summary>
          <div className="mt-3">
            <SettingsSheet />
          </div>
        </details>
        <HistoryDrawer onReevaluate={reeval} />
        <Button onClick={onAnalyze} disabled={!files.length || loading}>
          {loading ? '解析中…' : '解析する'}
        </Button>
        {progress && (
          <div className="w-full">
            <div className="h-2 rounded border border-default overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${progress.pct}%` }} />
            </div>
            <div className="text-xs text-muted mt-1">{progress.msg ?? '処理中...'}</div>
          </div>
        )}
        {logs.length > 0 && (
          <details className="rounded border border-default bg-card text-foreground px-3 py-2 text-xs">
            <summary>詳細ログ</summary>
            <div className="mt-1 space-y-1">
              {logs.map((l, i) => <div key={i} className="font-mono break-all">{l}</div>)}
            </div>
          </details>
        )}
        {errorMsg && (
          <div className="rounded border border-rose-500 bg-rose-50 text-rose-800 px-3 py-2 text-sm space-y-2">
            <div>{errorMsg}</div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onAnalyze} variant="outline">再試行</Button>
              <Button onClick={async () => {
                const s = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sta_settings_v1') || '{}') : {}
                const meta = { market: 'JP', tone: s?.tone ?? 'concise', profile: s?.profile ?? 'balanced', provider: 'openai', promptProfile: s?.promptProfile ?? 'default', model: s?.model || s?.openaiModel || 'gpt-4o-mini' }
                await reeval(files, meta as any)
              }} variant="outline">OpenAIで再試行</Button>
              <Button onClick={async () => {
                const s = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sta_settings_v1') || '{}') : {}
                const meta = { market: 'JP', tone: s?.tone ?? 'concise', profile: s?.profile ?? 'balanced', provider: 'groq', promptProfile: s?.promptProfile ?? 'default', model: s?.model || s?.openaiModel || 'gpt-4o-mini' }
                await reeval(files, meta as any)
              }} variant="outline">Groqで再試行</Button>
              <Button onClick={async () => {
                const s = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sta_settings_v1') || '{}') : {}
                const meta = { market: 'JP', tone: s?.tone ?? 'concise', profile: s?.profile ?? 'balanced', provider: 'openrouter', promptProfile: s?.promptProfile ?? 'default', model: s?.model || s?.openaiModel || 'openai/gpt-4o-mini' }
                await reeval(files, meta as any)
              }} variant="outline">OpenRouterで再試行</Button>
              <a href="#" onClick={(e) => { e.preventDefault(); const det = document.querySelector('details'); if (det && !det.open) (det as HTMLDetailsElement).open = true; det?.scrollIntoView({ behavior: 'smooth' }); }} className="underline text-rose-700">モデル設定を見直す</a>
            </div>
          </div>
        )}
        {qualityHints.length > 0 && (
          <details className="rounded border border-amber-400 bg-amber-50 text-amber-800 px-3 py-2 text-xs">
            <summary>画像品質の注意（クリックで詳細）</summary>
            <div className="mt-1 space-y-1">
              <div>{qualityHints.join(' / ')}</div>
              <div className="text-amber-700/90">ヒント: 解像度は長辺900px以上推奨。ブラー指標は0.02以上を目安。ファイルは6MB以下を推奨。</div>
              {preprocInfo.length > 0 && (
                <div className="mt-2">
                  {preprocInfo.map((p, i) => (
                    <div key={i} className="mt-1">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs">before: {p.width}x{p.height} long={p.longEdge}px blur={Number(p.blurScore).toFixed(3)} size={p.fileKB}KB</div>
                      {p.after && <div className="text-xs">after: {p.after.width}x{p.after.height} long={p.after.longEdge}px blur={Number(p.after.blurScore).toFixed(3)} size={p.after.fileKB}KB</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ResultPane data={result} meta={lastMeta} historyId={historyId} />
          </motion.div>
        )}
      </div>
    </main>
  )
}
