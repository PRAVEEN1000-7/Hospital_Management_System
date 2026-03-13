import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

const CHILD_TITLES = ['Baby', 'Master'] as const;
const ADULT_TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'] as const;

export const patientSchema = z.object({
  title: z.enum(['Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.', 'Prof.', 'Baby'], {
    message: 'Title is required',
  }),
  first_name: z.string()
    .min(1, 'First name is required')
    .max(100)
    .regex(/^[A-Za-z\s.'-]+$/, 'Name should contain only alphabets'),
  last_name: z.string()
    .min(1, 'Last name is required')
    .max(100)
    .regex(/^[A-Za-z\s.'-]+$/, 'Name should contain only alphabets'),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  gender: z.enum(['Male', 'Female', 'Other'], {
    message: 'Gender is required',
  }),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], {
    message: 'Blood group is required',
  }),
  phone_country_code: z.string().regex(/^\+[0-9]{1,4}$/, 'Invalid country code').default('+91'),
  phone_number: z.string().regex(/^\d{7,15}$/, 'Phone number must be 7-15 digits'),
  email: z.union([z.string().email('Invalid email'), z.literal('')]).optional(),
  address_line_1: z.string()
    .min(5, 'Address must be at least 5 characters')
    .regex(/[A-Za-z]/, 'Address must contain meaningful text, not just numbers'),
  address_line_2: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pin_code: z.union([
    z.string().regex(/^[A-Za-z0-9 \-]{3,10}$/, 'Invalid postal code'),
    z.literal(''),
  ]).optional(),
  country: z.string().optional().default('India'),
  emergency_contact_name: z.string().optional().or(z.literal('')),
  emergency_contact_phone: z.union([
    z.string().regex(/^\d{7,15}$/, 'Emergency phone must be 7-15 digits'),
    z.literal(''),
  ]).optional(),
  emergency_contact_relation: z.union([
    z.enum(['Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Friend', 'Guardian', 'Other']),
    z.literal(''),
  ]).optional(),
}).superRefine((data, ctx) => {
  // Validate title matches age group based on DOB
  if (data.date_of_birth && data.title) {
    const dob = new Date(data.date_of_birth);
    const today = new Date();
    let ageYears = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      ageYears--;
    }
    const isChild = ageYears < 5;
    const title = data.title as string;
    if (isChild && (ADULT_TITLES as readonly string[]).includes(title)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `For children under 5, please use Baby or Master instead of ${title}`,
        path: ['title'],
      });
    }
  }
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
