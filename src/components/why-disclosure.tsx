'use client';

import { Markdown } from '@/components/Markdown';
import { Icon } from '@/components/ui/icons';
import { ListenButton } from '@/components/listen-button';
import { markdownSpeechText } from '@/lib/speak';
import { whyHint } from '@/lib/why-hint';

/**
 * The progressive "Why" (F9). `explanation_md` is markdown — the body renders
 * through <Markdown>, never as raw text. A card the learner has missed before
 * (`lapsed`) opens by default and shows the first sentence peeled as a hint;
 * everything else stays one tap away. `<details>` carries the keyboard and
 * screen-reader semantics for free.
 *
 * Shared by the daily/learn verdict panel and cram's result block.
 */
export function WhyDisclosure({ explanation, lapsed }: { explanation: string; lapsed: boolean }) {
  const hint = lapsed ? whyHint(explanation) : null;
  return (
    <div className="mt-2.5 rounded-md bg-card/70 px-3 py-2">
      {hint && <p className="t-caption reading-prose text-foreground">Hint: {hint}</p>}
      <details className="group" open={lapsed || undefined}>
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <span className="t-fine font-semibold text-muted-foreground">Why</span>
          <Icon
            name="collapse"
            size={14}
            className="text-muted-foreground transition-transform group-open:rotate-180"
          />
          <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
            <ListenButton
              text={markdownSpeechText(explanation)}
              label="Listen to the explanation"
              className="-my-1.5"
            />
          </span>
        </summary>
        <Markdown text={explanation} className="mt-1.5 t-caption reading-prose text-foreground" />
      </details>
    </div>
  );
}
