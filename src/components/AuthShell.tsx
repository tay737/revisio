import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BlurFade } from '@/components/ui/motion/blur-fade';

/**
 * One shell for all four auth pages (login, register, staff login, staff
 * register). They previously duplicated the same three lines of layout; this
 * owns it once.
 *
 * The backdrop is the spec's tile rhythm rather than a gradient: a near-black
 * tile occupying the upper 46% of the viewport against the parchment canvas.
 * That is not decoration for its own sake — it is what makes the frosted card
 * legible as glass, because there is finally something behind it to blur.
 */
export function AuthShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 h-[46%] bg-[#272729]" />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle className="!border-white/20 !bg-white/10 !text-white/80 hover:!text-white" />
      </div>

      <div className="relative w-full max-w-md px-6 py-14">
        <BlurFade>
          <Link
            href="/"
            className="mb-6 flex items-center justify-center gap-2 text-[17px] font-semibold tracking-[-0.374px] text-white"
          >
            <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-accent text-[11px] font-semibold text-accent-ink">
              R
            </span>
            Revisio
          </Link>
        </BlurFade>

        <BlurFade delay={0.08}>{children}</BlurFade>

        {footer && (
          <div className="mt-6 text-center">
            <p className="t-fine text-muted">{footer}</p>
          </div>
        )}
      </div>
    </main>
  );
}
