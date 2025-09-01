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

  async function onAnalyze() {
    setLoading(true)
    setPhase('idle')
    setErrorMsg(null)
    try {
      const fd = new FormData()
      // Preprocess images if enabled
      const settings = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sta_settings_v1') || '{}') : {}
      const pre = await preprocessIfNeeded(files, { autoCompress: !!settings?.autoCompress, maxLongEdge: settings?.maxLongEdge ?? 1280, quality: settings?.jpegQuality ?? 0.85 })
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
      if (!runtime?.groqKey && !runtime?.openaiKey) {
        setLoading(false)
        setProgress(null)
        setErrorMsg('APIキーが未復号です。設定を開き、PINで「復号（使用可能に）」を押してください。')
        return
      }
      const meta: any = { market: 'JP', tone: settings?.tone ?? 'concise', profile: settings?.profile ?? 'balanced', provider: settings?.provider ?? 'groq', promptProfile: settings?.promptProfile ?? 'default' }
      if (settings?.uiSource && settings.uiSource !== 'Auto') meta.uiSource = settings.uiSource
      if (!meta.uiSource && autoUi && autoUi !== 'Unknown') meta.uiSource = autoUi
      setLastMeta(meta)
      fd.append('meta', JSON.stringify(meta))
      // iOS Safari は fetch のSSEストリーミングが不安定なためオフにする
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
      const isiOS = /iPhone|iPad|iPod/.test(ua)
      const headers: Record<string, string> = {}
      if (!isiOS) headers['X-Stream'] = '1'
      if (runtime?.groqKey) headers['X-API-Key'] = runtime.groqKey
      if (runtime?.openaiKey) headers['X-OpenAI-Key'] = runtime.openaiKey
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
              } else if (evt.event === 'extraction') {
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
        const data = await res.json()
        setResult(data)
        setPhase('done')
      }

      // Save to history (browser only) after we have final result
      if (typeof window !== 'undefined') {
        const fileData = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, dataUrl: await fileToDataUrl(f) })))
        const entry = { id: new Date().toISOString(), meta: lastMeta || {}, files: fileData, result }
        await addHistory(entry as any)
      }
    } finally {
      setLoading(false)
    }
  }

  async function reeval(withFiles: File[], meta: any) {
    setFiles(withFiles)
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
        setResult(data)
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
        {errorMsg && (
          <div className="rounded border border-rose-500 bg-rose-50 text-rose-800 px-3 py-2 text-sm">
            {errorMsg}
          </div>
        )}
        {qualityHints.length > 0 && (
          <details className="rounded border border-amber-400 bg-amber-50 text-amber-800 px-3 py-2 text-xs">
            <summary>画像品質の注意（クリックで詳細）</summary>
            <div className="mt-1 space-y-1">
              <div>{qualityHints.join(' / ')}</div>
              <div className="text-amber-700/90">ヒント: 解像度は長辺900px以上推奨。ブラー指標は0.02以上を目安。ファイルは6MB以下を推奨。</div>
            </div>
          </details>
        )}
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ResultPane data={result} meta={lastMeta} />
          </motion.div>
        )}
      </div>
    </main>
  )
}
