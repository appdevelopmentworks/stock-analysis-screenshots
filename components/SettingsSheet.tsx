"use client"
import { useEffect, useState } from 'react'
import { encryptString, decryptString } from '@/lib/crypto'

type Settings = {
  provider: 'groq' | 'openai' | 'openrouter'
  profile: 'fast' | 'balanced' | 'quality'
  tone: 'concise' | 'learning'
  promptProfile?: 'default' | 'strict' | 'verbose'
  uiSource?: 'Auto' | 'SBI' | 'Rakuten' | 'Matsui' | 'TradingView'
  groqKey?: string
  openaiKey?: string
  openrouterKey?: string
  model?: string
  autoCompress?: boolean
  maxLongEdge?: number
  jpegQuality?: number
}

const STORAGE_KEY = 'sta_settings_v1'
const ENC_KEY = 'sta_encrypted_keys_v1'
const RUNTIME_KEYS = 'sta_runtime_keys_v1' // session-only
const RUNTIME_KEYS_BACKUP = 'sta_runtime_keys_backup_v1' // localStorage backup for iOS PWA

export function SettingsSheet() {
  const [s, setS] = useState<Settings>({ provider: 'groq', profile: 'balanced', tone: 'concise', promptProfile: 'default', uiSource: 'Auto', model: 'gpt-4o-mini', autoCompress: true, maxLongEdge: 1280, jpegQuality: 0.85 as any })
  const [showKey, setShowKey] = useState(false)
  const [pin, setPin] = useState('')
  const [locked, setLocked] = useState(true)
  const [hasEncrypted, setHasEncrypted] = useState<boolean>(false)
  const [hasRuntime, setHasRuntime] = useState<boolean>(false)
  const [orModels, setOrModels] = useState<string[]>([])

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    const merged = raw ? { ...s, ...JSON.parse(raw) } : { ...s }
    // Also hydrate keys from runtime backup so inputs reflect persisted keys
    try {
      const backup = localStorage.getItem(RUNTIME_KEYS_BACKUP)
      if (backup) {
        const obj = JSON.parse(backup)
        if (obj?.groqKey) (merged as any).groqKey = obj.groqKey
        if (obj?.openaiKey) (merged as any).openaiKey = obj.openaiKey
        if (obj?.openrouterKey) (merged as any).openrouterKey = obj.openrouterKey
      }
    } catch {}
    setS(merged)
    // Check if runtime keys exist in session
    const rk = sessionStorage.getItem(RUNTIME_KEYS)
    setLocked(!rk)
    setHasRuntime(!!rk || !!localStorage.getItem(RUNTIME_KEYS_BACKUP))
    setHasEncrypted(!!localStorage.getItem(ENC_KEY))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch OpenRouter models dynamically when provider is openrouter and key is present
  useEffect(() => {
    if (s.provider !== 'openrouter') { setOrModels([]); return }
    try {
      const rk = JSON.parse(sessionStorage.getItem(RUNTIME_KEYS) || localStorage.getItem(RUNTIME_KEYS_BACKUP) || 'null') || {}
      const key = rk.openrouterKey
      if (!key) return
      fetch('/api/openrouter/models', { method: 'GET', headers: { 'x-openrouter-key': key } })
        .then(r => r.ok ? r.json() : null)
        .then((data) => {
          const list: string[] = Array.isArray(data?.data) ? data.data.map((m: any) => m.id || m.name).filter(Boolean) : []
          // Prefer image-capable models: naive filter by known keywords
          const imageLike = list.filter((name) => /gpt-5|gpt-4o|grok|gemini|sonnet|opus|vl|vision|image/i.test(name))
          setOrModels(imageLike.length ? imageLike : list)
        })
        .catch(() => {})
    } catch {}
  }, [s.provider])

  async function save() {
    const pinNorm = (pin || '').trim()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: s.provider, profile: s.profile, tone: s.tone, promptProfile: s.promptProfile, uiSource: s.uiSource, model: s.model, autoCompress: s.autoCompress, maxLongEdge: s.maxLongEdge, jpegQuality: s.jpegQuality, minLongEdge: (s as any).minLongEdge, minBlurScore: (s as any).minBlurScore, maxFileKB: (s as any).maxFileKB }))
    if (pinNorm && (s.groqKey || s.openaiKey || s.openrouterKey)) {
      const encPayload: any = {}
      if (s.groqKey) encPayload.groq = await encryptString(s.groqKey, pinNorm)
      if (s.openaiKey) encPayload.openai = await encryptString(s.openaiKey, pinNorm)
      if (s.openrouterKey) encPayload.openrouter = await encryptString(s.openrouterKey, pinNorm)
      localStorage.setItem(ENC_KEY, JSON.stringify(encPayload))
      // Also make keys immediately usable and persist for next visit
      const rt: any = {}
      if (s.groqKey) rt.groqKey = s.groqKey
      if (s.openaiKey) rt.openaiKey = s.openaiKey
      if (s.openrouterKey) rt.openrouterKey = s.openrouterKey
      if (rt.groqKey || rt.openaiKey || rt.openrouterKey) {
        sessionStorage.setItem(RUNTIME_KEYS, JSON.stringify(rt))
        localStorage.setItem(RUNTIME_KEYS_BACKUP, JSON.stringify(rt))
        setLocked(false)
        setHasRuntime(true)
      }
      alert('設定と暗号化済みキーを保存しました。次回以降も自動で使用します（セキュリティのためPINの管理にご注意ください）。')
      return
    } else if ((s.groqKey || s.openaiKey || s.openrouterKey) && !pinNorm) {
      // No PIN: store keys unencrypted for convenience and auto-use later
      const rt: any = {}
      if (s.groqKey) rt.groqKey = s.groqKey
      if (s.openaiKey) rt.openaiKey = s.openaiKey
      if (s.openrouterKey) rt.openrouterKey = s.openrouterKey
      localStorage.setItem(RUNTIME_KEYS_BACKUP, JSON.stringify(rt))
      sessionStorage.setItem(RUNTIME_KEYS, JSON.stringify(rt))
      setLocked(false)
      setHasRuntime(true)
      alert('設定を保存し、APIキーを端末に平文で保持しました。次回から自動で使用します（PIN暗号化の利用を推奨）。')
      return
    }
    alert('設定を保存しました（端末内）。')
  }

  function clearKey(kind: 'groq' | 'openai' | 'openrouter') {
    const next = { ...s }
    if (kind === 'groq') delete next.groqKey
    if (kind === 'openai') delete next.openaiKey
    if (kind === 'openrouter') delete next.openrouterKey
    setS(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    // Also remove from runtime/session and backup if present
    try {
      const rtRaw = sessionStorage.getItem(RUNTIME_KEYS)
      if (rtRaw) {
        const rtObj = JSON.parse(rtRaw)
        delete rtObj[`${kind}Key`]
        if (rtObj.groqKey || rtObj.openaiKey || rtObj.openrouterKey) sessionStorage.setItem(RUNTIME_KEYS, JSON.stringify(rtObj))
        else sessionStorage.removeItem(RUNTIME_KEYS)
      }
    } catch {}
    try {
      const bkRaw = localStorage.getItem(RUNTIME_KEYS_BACKUP)
      if (bkRaw) {
        const bkObj = JSON.parse(bkRaw)
        delete bkObj[`${kind}Key`]
        if (bkObj.groqKey || bkObj.openaiKey || bkObj.openrouterKey) localStorage.setItem(RUNTIME_KEYS_BACKUP, JSON.stringify(bkObj))
        else localStorage.removeItem(RUNTIME_KEYS_BACKUP)
      }
    } catch {}
    // Update runtime flags
    const hasAny = !!sessionStorage.getItem(RUNTIME_KEYS) || !!localStorage.getItem(RUNTIME_KEYS_BACKUP)
    setHasRuntime(hasAny)
  }

  async function unlock() {
    try {
      const encRaw = localStorage.getItem(ENC_KEY)
      if (!encRaw) throw new Error('暗号化されたキーが見つかりません。まずPINを設定して保存してください。')
      const encObj = JSON.parse(encRaw)
      const result: any = {}
      const pinNorm = (pin || '').trim()
      if (!pinNorm) throw new Error('PINが入力されていません')
      if (encObj.groq) result.groqKey = await decryptString(encObj.groq, pinNorm)
      if (encObj.openai) result.openaiKey = await decryptString(encObj.openai, pinNorm)
      if (encObj.openrouter) result.openrouterKey = await decryptString(encObj.openrouter, pinNorm)
      sessionStorage.setItem(RUNTIME_KEYS, JSON.stringify(result))
      localStorage.setItem(RUNTIME_KEYS_BACKUP, JSON.stringify(result))
      setLocked(false)
      alert('キーを復号して使用可能になりました（ページを閉じると消えます）。')
    } catch (e: any) {
      alert(e?.message || '復号に失敗しました。PINが正しいか確認してください。')
    }
  }

  function lock() {
    sessionStorage.removeItem(RUNTIME_KEYS)
    localStorage.removeItem(RUNTIME_KEYS_BACKUP)
    setLocked(true)
    setHasRuntime(false)
  }

  function resetAll() {
    sessionStorage.removeItem(RUNTIME_KEYS)
    localStorage.removeItem(RUNTIME_KEYS_BACKUP)
    localStorage.removeItem(ENC_KEY)
    alert('キー情報をリセットしました（暗号化キー・セッションキー）')
    setLocked(true)
    setHasEncrypted(false)
    setHasRuntime(false)
  }

  return (
    <div className="rounded border p-4 space-y-3">
      <h2 className="font-semibold">設定</h2>
      <div />
      <div className="grid gap-2">
        <label className="flex items-center gap-2">プロバイダ
          <select value={s.provider} onChange={e => { const v = e.target.value as any; const next = { ...s, provider: v }; setS(next); try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'), provider: v })); } catch {} }} className="border rounded px-2 py-1">
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
            <option value="groq">Groq</option>
          </select>
        </label>
        {/* 使用モデル選択（プロバイダ別の候補） */}
        <label className="flex items-center gap-2">使用モデル
          <select value={s.model || 'gpt-4o-mini'} onChange={e => { const v = e.target.value; const next = { ...s, model: v }; setS(next); try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'), model: v })); } catch {} }} className="border rounded px-2 py-1">
            {s.provider === 'openai' && (
              <>
                <option value="auto">Auto（プロファイルに応じ選択）</option>
                <option value="gpt-4o-mini">gpt-4o-mini（推奨）</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="gpt-5-mini">gpt-5-mini</option>
                <option value="gpt-5">gpt-5</option>
                <option value="o4-mini">o4-mini</option>
              </>
            )}
            {s.provider === 'openrouter' && (
              <>
                <option value="auto">Auto（プロファイルに応じ選択）</option>
                {orModels.length > 0 ? (
                  orModels.map((m) => <option key={m} value={m}>{m}</option>)
                ) : (
                  <>
                    <option value="openai/gpt-5-mini">openai/gpt-5-mini</option>
                    <option value="openai/gpt-5">openai/gpt-5</option>
                    <option value="x-ai/grok-4">x-ai/grok-4</option>
                    <option value="google/gemini-2.5-pro">google/gemini-2.5-pro</option>
                    <option value="anthropic/claude-sonnet-4">anthropic/claude-sonnet-4</option>
                    <option value="anthropic/claude-opus-4">anthropic/claude-opus-4</option>
                  </>
                )}
              </>
            )}
            {/* Groqのモデルは不具合回避のため一時的に非表示 */}
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
          <label className="flex flex-col gap-1">OpenRouter API Key（任意）
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={s.openrouterKey ?? ''}
                onChange={e => setS({ ...s, openrouterKey: e.target.value })}
                className="border rounded px-2 py-1 w-full"
                placeholder="sk-or-..."
              />
              <button className="border rounded px-2" onClick={() => setShowKey(v => !v)}>{showKey ? '隠す' : '表示'}</button>
              <button className="border rounded px-2" onClick={() => clearKey('openrouter')}>削除</button>
            </div>
          </label>
          <div className="flex gap-2">
            <button className="rounded border px-3 py-1" onClick={() => {
              const rt: any = {}
              if (s.groqKey) rt.groqKey = s.groqKey
              if (s.openaiKey) rt.openaiKey = s.openaiKey
              if (s.openrouterKey) rt.openrouterKey = s.openrouterKey
              if (!rt.groqKey && !rt.openaiKey && !rt.openrouterKey) { alert('APIキーが未入力です'); return }
              sessionStorage.setItem(RUNTIME_KEYS, JSON.stringify(rt))
              localStorage.setItem(RUNTIME_KEYS_BACKUP, JSON.stringify(rt))
              alert('このセッションでAPIキーを使用します（ブラウザを閉じると消えます）。')
              setLocked(false)
              setHasRuntime(true)
            }}>このセッションで使用</button>
            {locked && <span className="text-xs text-amber-600">（推奨はPINで暗号化保存→「復号」）</span>}
          </div>
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
        <p className="text-xs text-neutral-500">復号したキーはセッション中のみ保持（ページを閉じると消去）。暗号化済みキーが無い場合はエラーになります。</p>
      </div>
      <div className="flex gap-2">
        <button className="rounded bg-blue-600 text-white px-3 py-1" onClick={save}>保存</button>
        <button className="rounded border px-3 py-1" onClick={resetAll}>リセット</button>
      </div>
      <p className="text-xs text-neutral-500">キーは端末のlocalStorageに暗号化保存され、サーバには保存されません。</p>
      <div className="text-xs text-neutral-500">
        状態: 暗号化キー {hasEncrypted ? 'あり' : 'なし'} / セッションキー {hasRuntime ? 'あり' : 'なし'}
      </div>
      {locked && <p className="text-xs text-amber-500">現在はロック状態（未復号）です。PINで復号すると解析に使用されます。</p>}
    </div>
  )
}
