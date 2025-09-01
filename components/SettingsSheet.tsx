"use client"
import { useEffect, useState } from 'react'
import { encryptString, decryptString } from '@/lib/crypto'

type Settings = {
  provider: 'groq' | 'openai'
  profile: 'fast' | 'balanced' | 'quality'
  tone: 'concise' | 'learning'
  promptProfile?: 'default' | 'strict' | 'verbose'
  uiSource?: 'Auto' | 'SBI' | 'Rakuten' | 'Matsui' | 'TradingView'
  groqKey?: string
  openaiKey?: string
  autoCompress?: boolean
  maxLongEdge?: number
  jpegQuality?: number
}

const STORAGE_KEY = 'sta_settings_v1'
const ENC_KEY = 'sta_encrypted_keys_v1'
const RUNTIME_KEYS = 'sta_runtime_keys_v1' // session-only

export function SettingsSheet() {
  const [s, setS] = useState<Settings>({ provider: 'groq', profile: 'balanced', tone: 'concise', promptProfile: 'default', uiSource: 'Auto', autoCompress: true, maxLongEdge: 1280, jpegQuality: 0.85 as any })
  const [showKey, setShowKey] = useState(false)
  const [pin, setPin] = useState('')
  const [locked, setLocked] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) setS({ ...s, ...JSON.parse(raw) })
    // Check if runtime keys exist in session
    const rk = sessionStorage.getItem(RUNTIME_KEYS)
    setLocked(!rk)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: s.provider, profile: s.profile, tone: s.tone, promptProfile: s.promptProfile, uiSource: s.uiSource, autoCompress: s.autoCompress, maxLongEdge: s.maxLongEdge, jpegQuality: s.jpegQuality, minLongEdge: (s as any).minLongEdge, minBlurScore: (s as any).minBlurScore, maxFileKB: (s as any).maxFileKB }))
    if (pin && (s.groqKey || s.openaiKey)) {
      const encPayload: any = {}
      if (s.groqKey) encPayload.groq = await encryptString(s.groqKey, pin)
      if (s.openaiKey) encPayload.openai = await encryptString(s.openaiKey, pin)
      localStorage.setItem(ENC_KEY, JSON.stringify(encPayload))
    }
    alert('設定を保存しました（端末内、キーはPINで暗号化）。')
  }

  function clearKey(kind: 'groq' | 'openai') {
    const next = { ...s }
    if (kind === 'groq') delete next.groqKey
    if (kind === 'openai') delete next.openaiKey
    setS(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  async function unlock() {
    try {
      const encRaw = localStorage.getItem(ENC_KEY)
      if (!encRaw) throw new Error('暗号化されたキーが見つかりません')
      const encObj = JSON.parse(encRaw)
      const result: any = {}
      if (encObj.groq) result.groqKey = await decryptString(encObj.groq, pin)
      if (encObj.openai) result.openaiKey = await decryptString(encObj.openai, pin)
      sessionStorage.setItem(RUNTIME_KEYS, JSON.stringify(result))
      setLocked(false)
      alert('キーを復号して使用可能になりました（ページを閉じると消えます）。')
    } catch (e: any) {
      alert('復号に失敗しました。PINが正しいか確認してください。')
    }
  }

  function lock() {
    sessionStorage.removeItem(RUNTIME_KEYS)
    setLocked(true)
  }

  return (
    <div className="rounded border p-4 space-y-3">
      <h2 className="font-semibold">設定</h2>
      <div />
      <div className="grid gap-2">
        <label className="flex items-center gap-2">プロバイダ
          <select value={s.provider} onChange={e => setS({ ...s, provider: e.target.value as any })} className="border rounded px-2 py-1">
            <option value="groq">Groq</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <div className="flex items-center"><span className="mr-2">表示:</span>{/* inline theme toggle */}{require('./ThemeToggle').ThemeToggle()}</div>
        <label className="flex items-center gap-2">プロファイル
          <select value={s.profile} onChange={e => setS({ ...s, profile: e.target.value as any })} className="border rounded px-2 py-1">
            <option value="fast">Fast</option>
            <option value="balanced">Balanced</option>
            <option value="quality">Quality</option>
          </select>
        </label>
        <label className="flex items-center gap-2">トーン
          <select value={s.tone} onChange={e => setS({ ...s, tone: e.target.value as any })} className="border rounded px-2 py-1">
            <option value="concise">端的</option>
            <option value="learning">学習</option>
          </select>
        </label>
        <label className="flex items-center gap-2">プロンプト
          <select value={s.promptProfile} onChange={e => setS({ ...s, promptProfile: e.target.value as any })} className="border rounded px-2 py-1">
            <option value="default">Default</option>
            <option value="strict">Strict（厳密JSON/保守寄り）</option>
            <option value="verbose">Verbose（理由を厚め）</option>
          </select>
        </label>
        <label className="flex items-center gap-2">UIヒント
          <select value={s.uiSource} onChange={e => setS({ ...s, uiSource: e.target.value as any })} className="border rounded px-2 py-1">
            <option value="Auto">Auto</option>
            <option value="SBI">SBI</option>
            <option value="Rakuten">楽天</option>
            <option value="Matsui">松井</option>
            <option value="TradingView">TradingView</option>
          </select>
        </label>
        <div className="grid gap-2">
          <label className="flex flex-col gap-1">Groq API Key（端末保存）
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={s.groqKey ?? ''}
                onChange={e => setS({ ...s, groqKey: e.target.value })}
                className="border rounded px-2 py-1 w-full"
                placeholder="gsk_..."
              />
              <button className="border rounded px-2" onClick={() => setShowKey(v => !v)}>{showKey ? '隠す' : '表示'}</button>
              <button className="border rounded px-2" onClick={() => clearKey('groq')}>削除</button>
            </div>
          </label>
          <label className="flex flex-col gap-1">OpenAI API Key（任意、フェイルオーバー用）
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={s.openaiKey ?? ''}
                onChange={e => setS({ ...s, openaiKey: e.target.value })}
                className="border rounded px-2 py-1 w-full"
                placeholder="sk-..."
              />
              <button className="border rounded px-2" onClick={() => setShowKey(v => !v)}>{showKey ? '隠す' : '表示'}</button>
              <button className="border rounded px-2" onClick={() => clearKey('openai')}>削除</button>
            </div>
          </label>
        </div>
      </div>
      <div className="grid gap-2">
        <h3 className="font-medium mt-2">画像前処理</h3>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!s.autoCompress} onChange={e => setS({ ...s, autoCompress: e.target.checked })} /> 自動圧縮を有効化
        </label>
        <label className="flex items-center gap-2">最大長辺(px)
          <input type="number" value={s.maxLongEdge ?? 1280} onChange={e => setS({ ...s, maxLongEdge: Number(e.target.value) })} className="border rounded px-2 py-1 w-24" />
        </label>
        <label className="flex items-center gap-2">JPEG品質
          <input type="number" step="0.05" min="0.4" max="1" value={s.jpegQuality ?? 0.85} onChange={e => setS({ ...s, jpegQuality: Number(e.target.value) as any })} className="border rounded px-2 py-1 w-24" />
        </label>
        <div className="text-xs text-neutral-500">※ 圧縮は送信前にクライアントで実施。画質と速度/コストのバランスを調整できます。</div>
        <h4 className="font-medium mt-2">品質判定のしきい値</h4>
        <label className="flex items-center gap-2">最低長辺(px)
          <input type="number" defaultValue={(s as any).minLongEdge ?? 900} onChange={e => setS({ ...s, minLongEdge: Number(e.target.value) } as any)} className="border rounded px-2 py-1 w-24" />
        </label>
        <label className="flex items-center gap-2">ブラー指標しきい値(0–1)
          <input type="number" step="0.01" min="0" max="1" defaultValue={(s as any).minBlurScore ?? 0.02} onChange={e => setS({ ...s, minBlurScore: Number(e.target.value) } as any)} className="border rounded px-2 py-1 w-24" />
        </label>
        <label className="flex items-center gap-2">最大ファイルサイズ(KB)
          <input type="number" defaultValue={(s as any).maxFileKB ?? 6000} onChange={e => setS({ ...s, maxFileKB: Number(e.target.value) } as any)} className="border rounded px-2 py-1 w-24" />
        </label>
        <div className="text-xs text-neutral-500">i: ブラー指標は0〜1で明瞭さの目安（低いほどぼやけ）。既定は0.02です。</div>
      </div>
      <div className="grid gap-2">
        <label className="flex items-center gap-2">PIN（暗号化/復号に使用）
          <input type="password" value={pin} onChange={e => setPin(e.target.value)} className="border rounded px-2 py-1" placeholder="4–64文字" />
        </label>
        <div className="flex gap-2">
          <button className="rounded bg-green-600 text-white px-3 py-1" onClick={unlock} disabled={!pin}>復号（使用可能に）</button>
          <button className="rounded border px-3 py-1" onClick={lock}>ロック</button>
        </div>
        <p className="text-xs text-neutral-500">復号したキーはセッション中のみ保持（ページを閉じると消去）。</p>
      </div>
      <div className="flex gap-2">
        <button className="rounded bg-blue-600 text-white px-3 py-1" onClick={save}>保存</button>
      </div>
      <p className="text-xs text-neutral-500">キーは端末のlocalStorageに暗号化保存され、サーバには保存されません。</p>
      {locked && <p className="text-xs text-amber-500">現在はロック状態（未復号）です。PINで復号すると解析に使用されます。</p>}
    </div>
  )
}
