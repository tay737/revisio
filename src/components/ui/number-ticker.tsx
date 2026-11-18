"use client"

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react"
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
  const formatted = Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value)

  useEffect(() => {
    if (still) return
    let timer: ReturnType<typeof setTimeout> | null = null

    if (isInView) {
      timer = setTimeout(() => {
        motionValue.set(direction === "down" ? startValue : value)
      }, delay * 1000)
    }

    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [motionValue, isInView, delay, value, direction, startValue, still])

  useEffect(() => {
    if (still) return
    return springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = Intl.NumberFormat("en-US", {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        }).format(Number(latest.toFixed(decimalPlaces)))
      }
    })
  }, [springValue, decimalPlaces, still])

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
      {still ? formatted : startValue}
    </span>
  )
}
