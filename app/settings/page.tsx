"use client"
import { SettingsSheet } from '@/components/SettingsSheet'

export default function SettingsPage() {
  return (
    <main className="container mx-auto p-4 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">設定</h1>
      <SettingsSheet />
    </main>
  )
}

