import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const patientSchema = z.object({
  title: z.enum(['Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.', 'Prof.', 'Baby'], {
    required_error: 'Title is required',
  }),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  gender: z.enum(['Male', 'Female', 'Other'], {
    required_error: 'Gender is required',
  }),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], {
    required_error: 'Blood group is required',
  }),
  country_code: z.string().regex(/^\+[0-9]{1,4}$/, 'Invalid country code').default('+91'),
  mobile_number: z.string().regex(/^\d{4,15}$/, 'Mobile number must be 4-15 digits'),
  email: z.union([z.string().email('Invalid email'), z.literal('')]).optional(),
  address_line1: z.string().min(5, 'Address must be at least 5 characters'),
  address_line2: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pin_code: z.union([
    z.string().regex(/^[A-Za-z0-9 \-]{3,10}$/, 'Invalid postal code'),
    z.literal(''),
  ]).optional(),
  country: z.string().optional().default('India'),
  emergency_contact_name: z.string().optional().or(z.literal('')),
  emergency_contact_country_code: z.union([
    z.string().regex(/^\+[0-9]{1,4}$/),
    z.literal(''),
  ]).optional(),
  emergency_contact_mobile: z.union([
    z.string().regex(/^\d{4,15}$/, 'Emergency mobile must be 4-15 digits'),
    z.literal(''),
  ]).optional(),
  emergency_contact_relationship: z.union([
    z.enum(['Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Friend', 'Guardian', 'Other']),
    z.literal(''),
  ]).optional(),
});

export type PatientFormData = z.infer<typeof patientSchema>;

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[0-9]/, 'Must contain a digit')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Must contain a special character'),
  confirm_password: z.string().min(1, 'Confirm your password'),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
});

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
