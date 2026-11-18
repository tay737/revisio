'use client';

// Read-aloud (F3) — system TTS via speechSynthesis. Zero bundle cost, works
// offline, and the text never leaves the device. This module owns three rules:
//
//   • capability is checked honestly — no voices means no button, not a dead
//     control that does nothing when tapped;
//   • only the *question side* is ever composed here — accepted answers,
//     correctOptionId and verdict correctness must not reach the speaker
//     before the learner has answered;
//   • one utterance at a time — a new speak() cancels whatever is running.

export type SpeakCard = {
  kind: 'cloze' | 'flashcard' | 'mcq';
  textWithBlank: string | null;
  prompt: string | null;
  question: string | null;
  options: { id: string; text: string }[] | null;
};

/** True when this browser can actually speak — the gate the button renders on. */
export function speechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

/** Voices load asynchronously; an empty list now may not stay empty. */
export function speechVoicesReady(): boolean {
  try {
    return window.speechSynthesis.getVoices().length > 0;
  } catch {
    return false;
  }
}

function pickVoice(): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang.toLowerCase().startsWith('en')) ?? voices[0] ?? null;
  } catch {
    return null;
  }
}

/** Strip markdown to speakable plain text: emphasis markers, links, code
 *  fences and list bullets are typography, not words. */
export function stripForSpeech(md: string): string {
  const text = md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → link text
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ') // inline/fenced code markers
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^\s*[-*+]\s+/gm, '') // bullets
    .replace(/^\s*\d+[.)]\s+/gm, '') // ordered lists
    .replace(/^>\s?/gm, '') // quotes
    .replace(/\*\*|__|\*|_/g, '') // emphasis
    .replace(/\$\$?([^$]+)\$\$?/g, '$1') // inline/display math → contents
    .replace(/\|/g, ' '); // table pipes
  return text.replace(/\s+/g, ' ').trim();
}

/** The question side of a card, composed per kind. Never includes answers. */
export function cardSpeechText(card: SpeakCard): string {
  if (card.kind === 'cloze') {
    // The blank reads as the word "blank" — a cloze heard aloud is a fill-in,
    // and reading the underscores aloud would be noise.
    return stripForSpeech((card.textWithBlank ?? '').replace(/_{2,}/g, ' blank '));
  }
  if (card.kind === 'flashcard') return stripForSpeech(card.prompt ?? '');
  const parts = [stripForSpeech(card.question ?? '')];
  for (const o of card.options ?? []) {
    const t = stripForSpeech(o.text);
    if (t) parts.push(t);
  }
  return parts.filter(Boolean).join('. ');
}

/** Free markdown (model answer, explanation) → speakable text. */
export function markdownSpeechText(md: string): string {
  return stripForSpeech(md);
}

let active: SpeechSynthesisUtterance | null = null;

/** Speak `text`, cancelling anything in flight. Returns false when the
 *  capability gate fails — callers treat that as "no button". */
export function speak(text: string, onEnd?: () => void): boolean {
  if (!speechSupported() || !text.trim()) return false;
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.95;
  const done = () => {
    if (active === utterance) active = null;
    onEnd?.();
  };
  utterance.onend = done;
  utterance.onerror = done;
  active = utterance;
  try {
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    active = null;
    return false;
  }
}

export function stopSpeaking(): void {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // nothing to stop
  }
  active = null;
}

export function speakingNow(): boolean {
  return active !== null;
}
