"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavBar() {
  const pathname = usePathname()
  const linkCls = (href: string) => `px-3 py-2 rounded ${pathname === href ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
  return (
    <nav className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto max-w-3xl flex items-center justify-between px-4 py-2">
        <Link href="/" className="font-semibold">スクショ解析</Link>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/" className={linkCls('/')}>ホーム</Link>
          <Link href="/settings" className={linkCls('/settings')}>設定</Link>
          <Link href="/help" className={linkCls('/help')}>使い方</Link>
        </div>
      </div>
    </nav>
  )
}

