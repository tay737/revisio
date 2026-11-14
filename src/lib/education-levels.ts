/**
 * The level a learner names at sign-up (docs/FRONTEND-ARCHITECTURE.md §4.3).
 *
 * One list, two readers: `POST /api/v1/auth/register` validates against the ids,
 * and the registration wizard renders the labels. Client-safe on purpose — the
 * route handler and the wizard must never hold two copies of the same five
 * options, or a value the picker offers gets refused at the door.
 */
export const EDUCATION_LEVELS = [
  { id: 'gcse', label: 'GCSE' },
  { id: 'alevel', label: 'A-level' },
  { id: 'ib', label: 'IB' },
  { id: 'university', label: 'University' },
  { id: 'other', label: 'Other' },
] as const;

export type EducationLevel = (typeof EDUCATION_LEVELS)[number]['id'];

export function isEducationLevel(value: unknown): value is EducationLevel {
  return typeof value === 'string' && EDUCATION_LEVELS.some((level) => level.id === value);
}

export function educationLevelLabel(value: string | null | undefined): string | null {
  return EDUCATION_LEVELS.find((level) => level.id === value)?.label ?? null;
}
