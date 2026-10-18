"use client"

import { useCallback, useState, type CSSProperties, type MouseEvent } from "react"

/**
 * Magic UI Ripple Button (registry: ripple-button), adapted. The registry's own
 * button element is not used: its bg/border utilities would fight the `.btn-*`
 * colours in globals.css, which own every button's look. Instead the ripple
 * engine is exported so the shared `Button` hosts it.
 */
export type Ripple = { key: number; x: number; y: number; size: number }

const RIPPLE_MS = 600

export function useRipples() {
  const [ripples, setRipples] = useState<Ripple[]>([])

  const add = useCallback((event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    // Keyboard activation reports clientX/Y of 0: centre the ripple instead.
    const fromKeyboard = event.detail === 0
    const x = fromKeyboard ? rect.width / 2 - size / 2 : event.clientX - rect.left - size / 2
    const y = fromKeyboard ? rect.height / 2 - size / 2 : event.clientY - rect.top - size / 2
    const key = Date.now() + Math.random()

    setRipples((prev) => [...prev, { key, x, y, size }])
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.key !== key))
    }, RIPPLE_MS)
  }, [])

  return { ripples, add }
}

export function RippleLayer({ ripples }: { ripples: Ripple[] }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {ripples.map((ripple) => (
        <span
          key={ripple.key}
          className="absolute rounded-full"
          style={
            {
              width: ripple.size,
              height: ripple.size,
              left: ripple.x,
              top: ripple.y,
              background: "color-mix(in oklab, var(--primary-foreground) 28%, transparent)",
              animation: `btn-ripple ${RIPPLE_MS}ms var(--ease-out) forwards`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}
