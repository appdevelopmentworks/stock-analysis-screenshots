"use client"
import { useEffect, useState } from 'react'

const RUNTIME_KEYS = 'sta_runtime_keys_v1'

export function StubBanner() {
  const [stub, setStub] = useState(true)
  useEffect(() => {
    const check = () => setStub(!sessionStorage.getItem(RUNTIME_KEYS))
    check()
    const onVis = () => check()
    window.addEventListener('visibilitychange', onVis)
    window.addEventListener('storage', onVis)
    return () => {
      window.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('storage', onVis)
    }
  }, [])
  if (!stub) return null
  return (
    <div className="mb-3 rounded border border-amber-400 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
      現在は「スタブモード」です：APIキーが未復号のため、ダミー応答を返します。設定→PINで復号してください。
    </div>
  )
}

