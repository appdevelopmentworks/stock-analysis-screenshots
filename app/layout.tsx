import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Screenshot Trade Advisor',
  description: 'Analyze chart/orderbook screenshots for trade ideas',
  icons: [{ rel: 'icon', url: '/icons/icon-192.png' }],
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}

