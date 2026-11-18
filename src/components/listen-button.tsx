'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { speak, speechSupported, speechVoicesReady, stopSpeaking } from '@/lib/speak';

/**
 * The per-card listen control (F3).
 *
 * Card content, not chrome — it stays visible inside Focus sessions because
 * hearing the question is part of answering it. Honesty rules from the spec:
 *
 *   • hidden entirely when the browser cannot speak (no dead controls);
 *   • speaks only what it is given — callers pass question-side text, never
 *     answers, so audio cannot leak the verdict early;
 *   • a second tap stops; advancing the card or leaving the session unmounts
 *     this and cancels the utterance;
 *   • the icon swaps to a static "speaking" glyph and a polite live region
 *     announces Reading/Done — no animated equalizer (motion budget).
 */
export function ListenButton({
  text,
  label = 'Listen to this card',
  className,
}: {
  /** Already-speakable text (see lib/speak helpers). Empty/null hides the button. */
  text: string | null | undefined;
  label?: string;
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [announce, setAnnounce] = useState('');
  const utteranceId = useRef(0);
  const doneTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!speechSupported()) return;
    const check = () => setReady(speechVoicesReady());
    check();
    // Voices populate asynchronously on some platforms — listen for the event
    // rather than polling, and re-check once in case it already fired.
    try {
      window.speechSynthesis.addEventListener('voiceschanged', check);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', check);
    } catch {
      const t = window.setTimeout(check, 400);
      return () => window.clearTimeout(t);
    }
  }, []);

  // Leaving the card or the session must not leave a voice talking.
  useEffect(
    () => () => {
      utteranceId.current += 1;
      stopSpeaking();
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
    },
    [],
  );

  if (!ready || !text?.trim()) return null;

  const say = (msg: string) => {
    setAnnounce('');
    // Re-announce the same string twice in a row needs a tick between writes.
    requestAnimationFrame(() => setAnnounce(msg));
  };

  const toggle = () => {
    if (speaking) {
      utteranceId.current += 1;
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const id = ++utteranceId.current;
    const started = speak(text, () => {
      if (utteranceId.current !== id) return;
      setSpeaking(false);
      say('Done');
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
      doneTimer.current = window.setTimeout(() => setAnnounce(''), 1200);
    });
    if (started) {
      setSpeaking(true);
      say('Reading');
    }
  };

  return (
    <span className={cn('inline-flex items-center', className)}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={speaking}
        title={speaking ? 'Stop reading' : label}
        onClick={toggle}
        className={cn(
          'grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors',
          'text-muted-foreground hover:bg-secondary hover:text-foreground',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          speaking && 'bg-secondary text-foreground',
        )}
      >
        <Icon name={speaking ? 'speaking' : 'listen'} size={18} />
      </button>
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </span>
  );
}
