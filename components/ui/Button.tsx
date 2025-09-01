"use client"
import * as React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost', size?: 'sm' | 'md' }
export function Button({ className = '', variant = 'default', size = 'md', ...props }: Props) {
  const v = variant === 'outline' ? 'border border-default bg-transparent text-foreground' : variant === 'ghost' ? 'bg-transparent text-foreground' : 'bg-blue-600 text-white'
  const s = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-4 py-2 text-sm'
  return <button {...props} className={`rounded ${v} ${s} ${className} disabled:opacity-50`} />
}

