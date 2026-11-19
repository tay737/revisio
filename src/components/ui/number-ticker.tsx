"use client"

import { useCallback, useEffect, useRef, type ComponentPropsWithoutRef } from "react"
import { useInView, useMotionValue, useSpring, type SpringOptions } from "motion/react"

import { cn } from "@/lib/utils"
import { SPRING } from "@/lib/motion"
import { useQuietMode } from "@/lib/quiet"

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  direction?: "up" | "down"
  delay?: number
  decimalPlaces?: number
  /** Marks a celebration/result numeral (session report, exam result, practice
   *  score). Quiet mode renders these statically; ordinary informational
   *  numerals keep their count-up — product decision D13. */
  celebrate?: boolean
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  celebrate = false,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const quiet = useQuietMode()
  const still = quiet && celebrate
  const motionValue = useMotionValue(direction === "down" ? value : startValue)
  const springValue = useSpring(motionValue, SPRING.meter as SpringOptions)
  const isInView = useInView(ref, { once: true, margin: "0px" })
  // The resting value is what React renders and what assistive tech reads.
  // The count-up is driven imperatively through textContent below, so a
  // re-render can never reset the numeral to 0 — previously the child was
  // `startValue`, which meant every React write (remount, hydration, parent
  // re-render) put a literal 0 back over the animated text.
  const finalValue = direction === "down" ? startValue : value
  const displayValue = direction === "down" ? value : startValue
  const format = useCallback(
    (n: number) =>
      Intl.NumberFormat("en-US", {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      }).format(n),
    [decimalPlaces]
  )

  useEffect(() => {
    if (still) return
    let timer: ReturnType<typeof setTimeout> | null = null

    if (isInView) {
      timer = setTimeout(() => {
        if (ref.current) ref.current.textContent = format(displayValue)
        motionValue.set(finalValue)
      }, delay * 1000)
    }

    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [motionValue, isInView, delay, finalValue, displayValue, still, format])

  useEffect(() => {
    if (still) return
    return springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = format(Number(latest.toFixed(decimalPlaces)))
      }
    })
  }, [springValue, format, still])

  return (
    <span
      ref={ref}
      className={cn(
        // text-foreground, not text-black/dark:text-white: the band scope
        // (.tile-dark) remaps --foreground to white, so tickers inside the
        // rank band come out light without a hardcoded pair that only the
        // .dark class can flip.
        "inline-block tracking-wider text-foreground tabular-nums",
        className
      )}
      {...props}
    >
      {format(finalValue)}
    </span>
  )
}
