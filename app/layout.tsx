import './globals.css'
import type { Metadata } from 'next'
import { InitSentry } from '@/components/InitSentry'
import { NavBar } from '@/components/NavBar'

export const metadata: Metadata = {
  title: 'Screenshot Trade Advisor',
  description: 'Analyze chart/orderbook screenshots for trade ideas',
  icons: {
    icon: '/StockAnalysisScreenshots.png',
    apple: '/StockAnalysisScreenshots.png',
  },
  openGraph: {
    type: 'website',
    title: 'Screenshot Trade Advisor',
    description: 'Analyze chart/orderbook screenshots for trade ideas',
    images: [{ url: '/StockAnalysisScreenshots.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Screenshot Trade Advisor',
    description: 'Analyze chart/orderbook screenshots for trade ideas',
    images: ['/StockAnalysisScreenshots.png'],
  },
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body className="min-h-dvh bg-background text-foreground">
        <InitSentry />
        <NavBar />
        {children}
      </body>
    </html>
  )
}
