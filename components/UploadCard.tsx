"use client"
import { useCallback } from 'react'

type Props = { onFiles: (files: File[]) => void }
export function UploadCard({ onFiles }: Props) {
  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(e.target.files ?? []))
  }, [onFiles])
  return (
    <div className="rounded border p-4">
      <p className="mb-2 font-medium">スクショを選択（複数可）</p>
      <input type="file" accept="image/*" multiple onChange={onChange} />
    </div>
  )
}

