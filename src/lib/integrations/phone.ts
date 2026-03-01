/**
 * Phone number normalization to E.164 format.
 * Handles common US formats: (502) 555-1234, 502-555-1234, 5025551234, +15025551234
 * Returns E.164 string (+1XXXXXXXXXX) or original input if can't normalize.
 */
export function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");

  // Already E.164 with country code
  if (hasPlus && digits.length >= 11) {
    return `+${digits}`;
  }

  // US number: 10 digits → +1XXXXXXXXXX
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // US number with country code: 11 digits starting with 1
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // Can't normalize — return cleaned version
  return hasPlus ? `+${digits}` : digits;
}
