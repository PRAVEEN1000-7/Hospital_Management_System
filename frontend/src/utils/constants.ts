export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

// ─── Core Options ──────────────────────────────────────────────

export const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const;

export const TITLE_OPTIONS = ['Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.', 'Prof.', 'Baby'] as const;

export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const RELATIONSHIP_OPTIONS = [
  'Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter',
  'Brother', 'Sister', 'Friend', 'Guardian', 'Other',
] as const;

// ─── Country / State / Phone Code Data ─────────────────────────

export interface CountryInfo {
  name: string;
  code: string;
  phoneCode: string;
  postalCodeLabel: string;
  states: string[];
}

export const COUNTRIES: CountryInfo[] = [
  {
    name: 'India', code: 'IN', phoneCode: '+91', postalCodeLabel: 'PIN Code',
    states: [
      'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
      'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
      'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
      'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
      'Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh',
      'Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh',
      'Lakshadweep','Puducherry',
    ],
  },
  {
    name: 'United States', code: 'US', phoneCode: '+1', postalCodeLabel: 'ZIP Code',
    states: [
      'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
      'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
      'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
      'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
      'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
      'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
      'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
      'Wisconsin','Wyoming','District of Columbia',
    ],
  },
  {
    name: 'United Kingdom', code: 'GB', phoneCode: '+44', postalCodeLabel: 'Postcode',
    states: ['England','Scotland','Wales','Northern Ireland','Greater London','Greater Manchester','West Midlands','West Yorkshire','South Yorkshire','Merseyside','Tyne and Wear'],
  },
  {
    name: 'Canada', code: 'CA', phoneCode: '+1', postalCodeLabel: 'Postal Code',
    states: ['Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Northwest Territories','Nova Scotia','Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon'],
  },
  {
    name: 'Australia', code: 'AU', phoneCode: '+61', postalCodeLabel: 'Postcode',
    states: ['Australian Capital Territory','New South Wales','Northern Territory','Queensland','South Australia','Tasmania','Victoria','Western Australia'],
  },
  {
    name: 'United Arab Emirates', code: 'AE', phoneCode: '+971', postalCodeLabel: 'Postal Code',
    states: ['Abu Dhabi','Ajman','Dubai','Fujairah','Ras Al Khaimah','Sharjah','Umm Al Quwain'],
  },
  {
    name: 'Saudi Arabia', code: 'SA', phoneCode: '+966', postalCodeLabel: 'Postal Code',
    states: ['Riyadh','Makkah','Madinah','Eastern Province','Asir','Tabuk','Hail','Northern Borders','Jazan','Najran','Al Bahah','Al Jawf','Qassim'],
  },
  {
    name: 'Germany', code: 'DE', phoneCode: '+49', postalCodeLabel: 'Postleitzahl',
    states: ['Baden-Württemberg','Bavaria','Berlin','Brandenburg','Bremen','Hamburg','Hesse','Lower Saxony','Mecklenburg-Vorpommern','North Rhine-Westphalia','Rhineland-Palatinate','Saarland','Saxony','Saxony-Anhalt','Schleswig-Holstein','Thuringia'],
  },
  {
    name: 'Malaysia', code: 'MY', phoneCode: '+60', postalCodeLabel: 'Postcode',
    states: ['Johor','Kedah','Kelantan','Malacca','Negeri Sembilan','Pahang','Penang','Perak','Perlis','Sabah','Sarawak','Selangor','Terengganu','Kuala Lumpur','Labuan','Putrajaya'],
  },
  {
    name: 'Nepal', code: 'NP', phoneCode: '+977', postalCodeLabel: 'Postal Code',
    states: ['Province No. 1','Madhesh Province','Bagmati Province','Gandaki Province','Lumbini Province','Karnali Province','Sudurpashchim Province'],
  },
  {
    name: 'Sri Lanka', code: 'LK', phoneCode: '+94', postalCodeLabel: 'Postal Code',
    states: ['Central','Eastern','North Central','Northern','North Western','Sabaragamuwa','Southern','Uva','Western'],
  },
  {
    name: 'Bangladesh', code: 'BD', phoneCode: '+880', postalCodeLabel: 'Postal Code',
    states: ['Barishal','Chattogram','Dhaka','Khulna','Mymensingh','Rajshahi','Rangpur','Sylhet'],
  },
  {
    name: 'Pakistan', code: 'PK', phoneCode: '+92', postalCodeLabel: 'Postal Code',
    states: ['Punjab','Sindh','Khyber Pakhtunkhwa','Balochistan','Islamabad Capital Territory','Gilgit-Baltistan','Azad Kashmir'],
  },
  // Countries without detailed state lists (free text input for state)
  { name: 'Singapore', code: 'SG', phoneCode: '+65', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Qatar', code: 'QA', phoneCode: '+974', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Oman', code: 'OM', phoneCode: '+968', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Kuwait', code: 'KW', phoneCode: '+965', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Bahrain', code: 'BH', phoneCode: '+973', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'France', code: 'FR', phoneCode: '+33', postalCodeLabel: 'Code Postal', states: [] },
  { name: 'Japan', code: 'JP', phoneCode: '+81', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'China', code: 'CN', phoneCode: '+86', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'South Korea', code: 'KR', phoneCode: '+82', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Italy', code: 'IT', phoneCode: '+39', postalCodeLabel: 'CAP', states: [] },
  { name: 'Spain', code: 'ES', phoneCode: '+34', postalCodeLabel: 'Código Postal', states: [] },
  { name: 'Brazil', code: 'BR', phoneCode: '+55', postalCodeLabel: 'CEP', states: [] },
  { name: 'Mexico', code: 'MX', phoneCode: '+52', postalCodeLabel: 'Código Postal', states: [] },
  { name: 'South Africa', code: 'ZA', phoneCode: '+27', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Nigeria', code: 'NG', phoneCode: '+234', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Egypt', code: 'EG', phoneCode: '+20', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Russia', code: 'RU', phoneCode: '+7', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Indonesia', code: 'ID', phoneCode: '+62', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Thailand', code: 'TH', phoneCode: '+66', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Vietnam', code: 'VN', phoneCode: '+84', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Philippines', code: 'PH', phoneCode: '+63', postalCodeLabel: 'ZIP Code', states: [] },
  { name: 'Turkey', code: 'TR', phoneCode: '+90', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'New Zealand', code: 'NZ', phoneCode: '+64', postalCodeLabel: 'Postcode', states: [] },
  { name: 'Afghanistan', code: 'AF', phoneCode: '+93', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Iran', code: 'IR', phoneCode: '+98', postalCodeLabel: 'Postal Code', states: [] },
  { name: 'Iraq', code: 'IQ', phoneCode: '+964', postalCodeLabel: 'Postal Code', states: [] },
];

/** Build phone code dropdown from countries */
export const COUNTRY_CODE_OPTIONS = COUNTRIES.map((c) => ({
  code: c.phoneCode,
  label: `${c.phoneCode} (${c.name})`,
  country: c.name,
})).filter((v, i, a) => a.findIndex((t) => t.code === v.code) === i);

/** Reverse lookup: state name → country name (for auto-populate) */
export const STATE_COUNTRY_MAP: Record<string, string> = {};
COUNTRIES.forEach((country) => {
  country.states.forEach((state) => {
    if (!STATE_COUNTRY_MAP[state]) {
      STATE_COUNTRY_MAP[state] = country.name;
    }
  });
});

/** Get states for a given country name */
export function getStatesForCountry(countryName: string): string[] {
  const country = COUNTRIES.find((c) => c.name === countryName);
  return country?.states || [];
}

/** Get postal code label for a country */
export function getPostalCodeLabel(countryName: string): string {
  const country = COUNTRIES.find((c) => c.name === countryName);
  return country?.postalCodeLabel || 'Postal Code';
}

/** Get phone code for a country */
export function getPhoneCodeForCountry(countryName: string): string {
  const country = COUNTRIES.find((c) => c.name === countryName);
  return country?.phoneCode || '+1';
}
