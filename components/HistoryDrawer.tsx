"use client"
import { useEffect, useState } from 'react'
import { HistoryEntry, listHistory, deleteHistory, dataUrlToFile } from '@/lib/history'

type Props = { onReevaluate: (files: File[], meta: any) => void }

export function HistoryDrawer({ onReevaluate }: Props) {
  const [items, setItems] = useState<HistoryEntry[]>([])
  const [open, setOpen] = useState(false)

  async function refresh() { setItems(await listHistory()) }
  useEffect(() => { refresh() }, [])

  async function onDelete(id: string) {
    await deleteHistory(id)
    await refresh()
  }

  function toFiles(entry: HistoryEntry): File[] {
    return entry.files.map(f => dataUrlToFile(f.dataUrl, f.name, f.type))
  }

  return (
    <div className="rounded border">
      <button className="w-full text-left px-3 py-2" onClick={() => setOpen(v => !v)}>
        履歴 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="max-h-[50vh] overflow-auto divide-y">
          {items.length === 0 && <div className="p-3 text-sm text-neutral-500">履歴はありません</div>}
          {items.map((it) => (
            <div key={it.id} className="p-3 text-sm flex gap-2 items-start justify-between">
              <div>
                <div className="font-medium">{new Date(it.id).toLocaleString()}</div>
                <div className="text-xs text-neutral-500">images: {it.files.length}, decision: {it.result?.decision}</div>
              </div>
              <div className="flex gap-2">
                <button className="border rounded px-2 py-1" onClick={() => onReevaluate(toFiles(it), it.meta)}>再評価</button>
                <button className="border rounded px-2 py-1" onClick={() => onDelete(it.id)}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

