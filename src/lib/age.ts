type DateParts = { year: number; month: number; day: number };

function parseDate(value: string | null | undefined): DateParts | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return { year, month, day };
}

function parts(date: Date): DateParts {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isValidDateOfBirth(value: string | null | undefined, today = new Date()): boolean {
  const birth = parseDate(value);
  if (!birth) return false;
  const current = parts(today);
  return birth.year < current.year ||
    (birth.year === current.year && (birth.month < current.month || (birth.month === current.month && birth.day <= current.day)));
}

export function ageOnDate(value: string | null | undefined, today = new Date()): number | null {
  const birth = parseDate(value);
  if (!birth || !isValidDateOfBirth(value, today)) return null;
  const current = parts(today);
  const birthdayMonth = birth.month === 2 && birth.day === 29 && !leapYear(current.year) ? 3 : birth.month;
  const birthdayDay = birth.month === 2 && birth.day === 29 && !leapYear(current.year) ? 1 : birth.day;
  let age = current.year - birth.year;
  if (current.month < birthdayMonth || (current.month === birthdayMonth && current.day < birthdayDay)) age -= 1;
  return age;
}

export const AGE_OF_CONSENT = 13;

export function isUnderAge(value: string | null | undefined, today = new Date()): boolean {
  const age = ageOnDate(value, today);
  return age !== null && age < AGE_OF_CONSENT;
}

/** Older accounts have no DOB; only accounts with a DOB are subject to this gate. */
export function learnerMeetsAgeConsent(dateOfBirth: string | null | undefined, ageConsent: boolean | null | undefined, today = new Date()): boolean {
  if (!dateOfBirth) return true;
  return isValidDateOfBirth(dateOfBirth, today) && (!isUnderAge(dateOfBirth, today) || ageConsent === true);
}
