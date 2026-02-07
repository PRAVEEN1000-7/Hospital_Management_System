import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const patientSchema = z.object({
  title: z.enum(['Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.', 'Prof.', 'Baby'], {
    errorMap: () => ({ message: 'Please select a title' }),
  }),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  gender: z.enum(['Male', 'Female', 'Other'], {
    errorMap: () => ({ message: 'Please select a gender' }),
  }),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], {
    errorMap: () => ({ message: 'Please select a blood group' }),
  }).optional().or(z.literal('')),
  country_code: z.string().regex(/^\+[0-9]{1,4}$/, 'Invalid country code').default('+91'),
  mobile_number: z.string()
    .min(4, 'Mobile number must be at least 4 digits')
    .max(15, 'Mobile number must be at most 15 digits')
    .regex(/^\d{4,15}$/, 'Enter a valid phone number (digits only, 4-15 digits)'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address_line1: z.string().min(5, 'Address must be at least 5 characters'),
  address_line2: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pin_code: z.string()
    .regex(/^[A-Za-z0-9 \-]{3,10}$/, 'Invalid postal/ZIP code')
    .optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('')),
  emergency_contact_name: z.string().optional().or(z.literal('')),
  emergency_contact_country_code: z.string().regex(/^\+[0-9]{1,4}$/, 'Invalid country code').optional().or(z.literal('')),
  emergency_contact_mobile: z.string()
    .regex(/^\d{4,15}$/, 'Enter a valid phone number (digits only)')
    .optional().or(z.literal('')),
  emergency_contact_relationship: z.enum([
    'Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter',
    'Brother', 'Sister', 'Friend', 'Guardian', 'Other',
  ], {
    errorMap: () => ({ message: 'Please select a relationship' }),
  }).optional().or(z.literal('')),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type PatientFormData = z.infer<typeof patientSchema>;
