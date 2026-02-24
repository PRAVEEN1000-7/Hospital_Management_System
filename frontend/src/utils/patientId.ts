/**
 * HMS 12-Digit Patient ID System — Frontend Utilities
 *
 * Format: [HOSPITAL 2][GENDER 1][YY 2][MONTH 1][CHECK 1][SEQUENCE 5] = 12 chars
 * Example: HCM262K00147
 */

const GENDER_DECODE: Record<string, string> = {
  M: 'Male',
  F: 'Female',
  O: 'Other',
  N: 'Not Disclosed',
  U: 'Unknown',
};

const MONTH_DECODE: Record<string, number> = {
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
  '7': 7, '8': 8, '9': 9, A: 10, B: 11, C: 12,
};

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Calculate the weighted checksum character for the first 6 chars of a patient ID.
 */
function calculateChecksum(prefix: string): string {
  let total = 0;
  for (let i = 0; i < prefix.length; i++) {
    const char = prefix[i];
    let value: number;
    if (/\d/.test(char)) {
      value = parseInt(char, 10);
    } else {
      value = char.toUpperCase().charCodeAt(0) - 55; // A=10, B=11, etc.
    }
    total += value * (i + 1);
  }
  const checkVal = total % 36;
  return checkVal < 10 ? String(checkVal) : String.fromCharCode(55 + checkVal);
}

export interface PatientIdComponents {
  hospitalCode: string;
  genderCode: string;
  gender: string;
  year: number;
  monthCode: string;
  month: number;
  monthName: string;
  checksum: string;
  checksumValid: boolean;
  sequence: number;
  formatted: string;
}

/**
 * Parse a 12-digit patient ID into its components.
 * Returns null if the format is invalid.
 */
export function parsePatientId(patientId: string): PatientIdComponents | null {
  if (!patientId || patientId.length !== 12) return null;

  const hospitalCode = patientId.slice(0, 2);
  const genderCode = patientId[2];
  const yearCode = patientId.slice(3, 5);
  const monthCode = patientId[5];
  const checksum = patientId[6];
  const sequenceStr = patientId.slice(7);

  // Validate year is numeric
  if (!/^\d{2}$/.test(yearCode)) return null;

  // Validate month code
  const month = MONTH_DECODE[monthCode];
  if (!month) return null;

  // Validate sequence is numeric
  if (!/^\d{5}$/.test(sequenceStr)) return null;

  // Validate checksum
  const prefix = patientId.slice(0, 6);
  const expectedCheck = calculateChecksum(prefix);
  const checksumValid = checksum === expectedCheck;

  return {
    hospitalCode,
    genderCode,
    gender: GENDER_DECODE[genderCode] || 'Unknown',
    year: 2000 + parseInt(yearCode, 10),
    monthCode,
    month,
    monthName: MONTH_NAMES[month] || '',
    checksum,
    checksumValid,
    sequence: parseInt(sequenceStr, 10),
    formatted: `${hospitalCode}-${genderCode}-${yearCode}-${monthCode}-${checksum}-${sequenceStr}`,
  };
}

/**
 * Validate a 12-digit patient ID (format + checksum).
 */
export function validatePatientId(patientId: string): boolean {
  const parsed = parsePatientId(patientId);
  return parsed !== null && parsed.checksumValid;
}

/**
 * Format a 12-digit patient ID with separator dashes for display.
 * e.g. "HCM262K00147" → "HC-M-26-2-K-00147"
 */
export function formatPatientId(patientId: string): string {
  if (!patientId || patientId.length !== 12) return patientId;
  return `${patientId.slice(0, 2)}-${patientId[2]}-${patientId.slice(3, 5)}-${patientId[5]}-${patientId[6]}-${patientId.slice(7)}`;
}
