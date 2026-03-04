/**
 * TC-FE-VLD-001 to TC-FE-VLD-030
 * Real tests for Zod validation schemas — verifies exact error messages and
 * acceptance/rejection of valid/invalid data. No mocking needed.
 */
import { describe, it, expect } from 'vitest';
import { loginSchema, patientSchema, changePasswordSchema } from '../../utils/validation';

// ─── loginSchema ─────────────────────────────────────────────────────────────

describe('TC-FE-VLD-001: loginSchema accepts valid credentials', () => {
  it('should parse without error', () => {
    const result = loginSchema.safeParse({ username: 'superadmin', password: 'Admin@123' });
    expect(result.success).toBe(true);
  });
});

describe('TC-FE-VLD-002: loginSchema rejects username shorter than 3 chars', () => {
  it('should fail and report username error', () => {
    const result = loginSchema.safeParse({ username: 'ab', password: 'Admin@123' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues[0].path).toContain('username');
    expect(issues[0].message).toMatch(/3 characters/i);
  });
});

describe('TC-FE-VLD-003: loginSchema rejects password shorter than 6 chars', () => {
  it('should fail and report password error', () => {
    const result = loginSchema.safeParse({ username: 'admin', password: '123' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues[0].path).toContain('password');
    expect(issues[0].message).toMatch(/6 characters/i);
  });
});

describe('TC-FE-VLD-004: loginSchema rejects missing username', () => {
  it('should fail when username key is absent', () => {
    const result = loginSchema.safeParse({ password: 'Admin@123' });
    expect(result.success).toBe(false);
  });
});

// ─── patientSchema ────────────────────────────────────────────────────────────

const VALID_PATIENT = {
  title: 'Mr.',
  first_name: 'John',
  last_name: 'Doe',
  date_of_birth: '1990-06-15',
  gender: 'Male',
  blood_group: 'O+',
  phone_country_code: '+91',
  phone_number: '9876543210',
  email: 'john@example.com',
  address_line_1: '123 Main Street',
};

describe('TC-FE-VLD-005: patientSchema accepts fully valid patient data', () => {
  it('should parse without error', () => {
    const result = patientSchema.safeParse(VALID_PATIENT);
    expect(result.success).toBe(true);
  });
});

describe('TC-FE-VLD-006: patientSchema rejects phone_number with letters', () => {
  it('should fail with "4-15 digits" message', () => {
    const result = patientSchema.safeParse({ ...VALID_PATIENT, phone_number: 'ABC12345' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    const phoneIssue = issues.find((i: any) => i.path.includes('phone_number'));
    expect(phoneIssue).toBeDefined();
    expect(phoneIssue.message).toMatch(/4-15 digits/i);
  });
});

describe('TC-FE-VLD-007: patientSchema rejects phone_number shorter than 4 digits', () => {
  it('should fail for 3-digit phone', () => {
    const result = patientSchema.safeParse({ ...VALID_PATIENT, phone_number: '123' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    const phoneIssue = issues.find((i: any) => i.path.includes('phone_number'));
    expect(phoneIssue).toBeDefined();
  });
});

describe('TC-FE-VLD-008: patientSchema rejects invalid email format', () => {
  it('should fail for email without @', () => {
    const result = patientSchema.safeParse({ ...VALID_PATIENT, email: 'notanemail' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    const emailIssue = issues.find((i: any) => i.path.includes('email'));
    expect(emailIssue).toBeDefined();
    expect(emailIssue.message).toMatch(/invalid email/i);
  });
});

describe('TC-FE-VLD-009: patientSchema allows empty email (optional)', () => {
  it('should succeed when email is empty string', () => {
    const result = patientSchema.safeParse({ ...VALID_PATIENT, email: '' });
    expect(result.success).toBe(true);
  });
});

describe('TC-FE-VLD-010: patientSchema allows email to be omitted', () => {
  it('should succeed when email key is missing', () => {
    const { email: _email, ...withoutEmail } = VALID_PATIENT;
    const result = patientSchema.safeParse(withoutEmail);
    expect(result.success).toBe(true);
  });
});

describe('TC-FE-VLD-011: patientSchema rejects invalid gender', () => {
  it('should fail for gender not in enum', () => {
    const result = patientSchema.safeParse({ ...VALID_PATIENT, gender: 'Unknown' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.path.includes('gender'))).toBe(true);
  });
});

describe('TC-FE-VLD-012: patientSchema rejects invalid blood_group', () => {
  it('should fail for blood group not in enum', () => {
    const result = patientSchema.safeParse({ ...VALID_PATIENT, blood_group: 'X+' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.path.includes('blood_group'))).toBe(true);
  });
});

describe('TC-FE-VLD-013: patientSchema rejects date_of_birth not matching YYYY-MM-DD', () => {
  it('should fail for slash-separated date', () => {
    const result = patientSchema.safeParse({ ...VALID_PATIENT, date_of_birth: '15/06/1990' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.path.includes('date_of_birth'))).toBe(true);
  });
});

describe('TC-FE-VLD-014: patientSchema rejects address_line_1 shorter than 5 chars', () => {
  it('should fail for very short address', () => {
    const result = patientSchema.safeParse({ ...VALID_PATIENT, address_line_1: 'A' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.path.includes('address_line_1'))).toBe(true);
  });
});

describe('TC-FE-VLD-015: patientSchema rejects invalid phone_country_code', () => {
  it('should fail for country code without leading +', () => {
    const result = patientSchema.safeParse({ ...VALID_PATIENT, phone_country_code: '91' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.path.includes('phone_country_code'))).toBe(true);
  });
});

describe('TC-FE-VLD-016: patientSchema accepts all valid blood groups', () => {
  const groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  groups.forEach((bg) => {
    it(`should accept blood group ${bg}`, () => {
      const result = patientSchema.safeParse({ ...VALID_PATIENT, blood_group: bg });
      expect(result.success).toBe(true);
    });
  });
});

// ─── changePasswordSchema ─────────────────────────────────────────────────────

const VALID_CHANGE_PW = {
  current_password: 'OldPass@1',
  new_password: 'NewPass@123',
  confirm_password: 'NewPass@123',
};

describe('TC-FE-VLD-017: changePasswordSchema accepts valid strong password', () => {
  it('should parse without error', () => {
    const result = changePasswordSchema.safeParse(VALID_CHANGE_PW);
    expect(result.success).toBe(true);
  });
});

describe('TC-FE-VLD-018: changePasswordSchema rejects password shorter than 8 chars', () => {
  it('should fail for short new password', () => {
    const result = changePasswordSchema.safeParse({ ...VALID_CHANGE_PW, new_password: 'Ab@1', confirm_password: 'Ab@1' });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.message.match(/8 characters/i))).toBe(true);
  });
});

describe('TC-FE-VLD-019: changePasswordSchema rejects password without uppercase', () => {
  it('should fail when new_password has no uppercase letter', () => {
    const pw = 'newpass@123';
    const result = changePasswordSchema.safeParse({ ...VALID_CHANGE_PW, new_password: pw, confirm_password: pw });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.message.match(/uppercase/i))).toBe(true);
  });
});

describe('TC-FE-VLD-020: changePasswordSchema rejects password without lowercase', () => {
  it('should fail when new_password has no lowercase letter', () => {
    const pw = 'NEWPASS@123';
    const result = changePasswordSchema.safeParse({ ...VALID_CHANGE_PW, new_password: pw, confirm_password: pw });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.message.match(/lowercase/i))).toBe(true);
  });
});

describe('TC-FE-VLD-021: changePasswordSchema rejects password without digit', () => {
  it('should fail when new_password has no digit', () => {
    const pw = 'NewPass@abc';
    const result = changePasswordSchema.safeParse({ ...VALID_CHANGE_PW, new_password: pw, confirm_password: pw });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.message.match(/digit/i))).toBe(true);
  });
});

describe('TC-FE-VLD-022: changePasswordSchema rejects password without special character', () => {
  it('should fail when no special char present', () => {
    const pw = 'NewPass123';
    const result = changePasswordSchema.safeParse({ ...VALID_CHANGE_PW, new_password: pw, confirm_password: pw });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.message.match(/special character/i))).toBe(true);
  });
});

describe('TC-FE-VLD-023: changePasswordSchema rejects mismatched confirm_password', () => {
  it('should fail when new_password ≠ confirm_password', () => {
    const result = changePasswordSchema.safeParse({
      ...VALID_CHANGE_PW,
      confirm_password: 'DifferentPass@1',
    });
    expect(result.success).toBe(false);
    const issues = (result as any).error.issues;
    expect(issues.some((i: any) => i.message.match(/don't match/i))).toBe(true);
    expect(issues[0].path).toContain('confirm_password');
  });
});

describe('TC-FE-VLD-024: changePasswordSchema rejects missing current_password', () => {
  it('should fail when current_password is empty', () => {
    const result = changePasswordSchema.safeParse({ ...VALID_CHANGE_PW, current_password: '' });
    expect(result.success).toBe(false);
  });
});
