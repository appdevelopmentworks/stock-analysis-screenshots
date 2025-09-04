"use client"
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getHistory } from '@/lib/history'
import { ResultPane } from '@/components/ResultPane'
import { Button } from '@/components/ui/Button'

export default function ResultPage() {
  const sp = useSearchParams()
  const id = sp.get('id') || ''
  const [entry, setEntry] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) { setError('idが指定されていません'); return }
    ;(async () => {
      try {
        const ent = await getHistory(id)
        if (!ent) { setError('履歴が見つかりません'); return }
        setEntry(ent)
      } catch (e: any) {
        setError(e?.message || '読み込みに失敗しました')
      }
    })()
  }, [id])

  return (
    <main className="container mx-auto p-4 max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-semibold">結果</h1>
        <Link href="/"><Button>ホームに戻る</Button></Link>
      </div>
      {!id && <div className="text-sm text-muted">URLに?id=... を指定してください。</div>}
      {error && <div className="text-sm text-rose-500">{error}</div>}
      {entry && <ResultPane data={entry.result} meta={entry.meta} historyId={entry.id} />}
    </main>
  )}

