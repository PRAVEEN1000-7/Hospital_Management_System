export const TITLE_OPTIONS = ['Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.', 'Prof.', 'Baby'];

export const GENDER_OPTIONS = ['Male', 'Female', 'Other'];

export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const RELATIONSHIP_OPTIONS = [
  'Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter',
  'Brother', 'Sister', 'Friend', 'Guardian', 'Other'
];

export const USER_ROLES = [
  'super_admin', 'admin', 'doctor', 'nurse', 'staff',
  'receptionist', 'pharmacist', 'cashier', 'inventory_manager'
];

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  doctor: 'Doctor',
  nurse: 'Nurse',
  staff: 'Staff',
  receptionist: 'Receptionist',
  pharmacist: 'Pharmacist',
  cashier: 'Cashier',
  inventory_manager: 'Inventory Manager',
};

export const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700',
  admin: 'bg-orange-100 text-orange-700',
  doctor: 'bg-blue-100 text-blue-700',
  nurse: 'bg-teal-100 text-teal-700',
  staff: 'bg-gray-100 text-gray-700',
  receptionist: 'bg-purple-100 text-purple-700',
  pharmacist: 'bg-green-100 text-green-700',
  cashier: 'bg-yellow-100 text-yellow-700',
  inventory_manager: 'bg-indigo-100 text-indigo-700',
};

export const ROLE_TEXT_COLORS: Record<string, string> = {
  super_admin: 'text-red-700',
  admin: 'text-orange-700',
  doctor: 'text-blue-700',
  nurse: 'text-teal-700',
  staff: 'text-gray-700',
  receptionist: 'text-purple-700',
  pharmacist: 'text-green-700',
  cashier: 'text-yellow-700',
  inventory_manager: 'text-indigo-700',
};

export interface CountryData {
  name: string;
  code: string;
  phoneCode: string;
  postalLabel: string;
  states?: string[];
}

export const COUNTRIES: CountryData[] = [
  {
    name: 'India', code: 'IN', phoneCode: '+91', postalLabel: 'PIN Code',
    states: [
      'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
      'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
      'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
      'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
      'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
      'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
      'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
    ]
  },
  {
    name: 'United States', code: 'US', phoneCode: '+1', postalLabel: 'ZIP Code',
    states: [
      'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
      'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia',
      'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
      'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
      'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
      'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
      'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
      'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
      'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
    ]
  },
  {
    name: 'United Kingdom', code: 'GB', phoneCode: '+44', postalLabel: 'Postcode',
    states: [
      'England', 'Scotland', 'Wales', 'Northern Ireland', 'London',
      'South East', 'South West', 'West Midlands', 'North West',
      'North East', 'East of England'
    ]
  },
  {
    name: 'Canada', code: 'CA', phoneCode: '+1', postalLabel: 'Postal Code',
    states: [
      'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
      'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia',
      'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'
    ]
  },
  {
    name: 'Australia', code: 'AU', phoneCode: '+61', postalLabel: 'Postcode',
    states: [
      'Australian Capital Territory', 'New South Wales', 'Northern Territory',
      'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia'
    ]
  },
  {
    name: 'United Arab Emirates', code: 'AE', phoneCode: '+971', postalLabel: 'Postal Code',
    states: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah']
  },
  {
    name: 'Saudi Arabia', code: 'SA', phoneCode: '+966', postalLabel: 'Postal Code',
    states: [
      'Riyadh', 'Makkah', 'Madinah', 'Eastern Province', 'Asir', 'Tabuk',
      'Hail', 'Northern Borders', 'Jazan', 'Najran', 'Al Bahah', 'Al Jawf', 'Qassim'
    ]
  },
  {
    name: 'Germany', code: 'DE', phoneCode: '+49', postalLabel: 'Postleitzahl',
    states: [
      'Baden-Württemberg', 'Bavaria', 'Berlin', 'Brandenburg', 'Bremen',
      'Hamburg', 'Hesse', 'Lower Saxony', 'Mecklenburg-Vorpommern',
      'North Rhine-Westphalia', 'Rhineland-Palatinate', 'Saarland',
      'Saxony', 'Saxony-Anhalt', 'Schleswig-Holstein', 'Thuringia'
    ]
  },
  {
    name: 'Malaysia', code: 'MY', phoneCode: '+60', postalLabel: 'Postcode',
    states: [
      'Johor', 'Kedah', 'Kelantan', 'Kuala Lumpur', 'Labuan', 'Malacca',
      'Negeri Sembilan', 'Pahang', 'Penang', 'Perak', 'Perlis', 'Putrajaya',
      'Sabah', 'Sarawak', 'Selangor', 'Terengganu'
    ]
  },
  {
    name: 'Nepal', code: 'NP', phoneCode: '+977', postalLabel: 'Postal Code',
    states: ['Province 1', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim']
  },
  {
    name: 'Sri Lanka', code: 'LK', phoneCode: '+94', postalLabel: 'Postal Code',
    states: ['Central', 'Eastern', 'North Central', 'Northern', 'North Western', 'Sabaragamuwa', 'Southern', 'Uva', 'Western']
  },
  {
    name: 'Bangladesh', code: 'BD', phoneCode: '+880', postalLabel: 'Postal Code',
    states: ['Barishal', 'Chattogram', 'Dhaka', 'Khulna', 'Mymensingh', 'Rajshahi', 'Rangpur', 'Sylhet']
  },
  {
    name: 'Pakistan', code: 'PK', phoneCode: '+92', postalLabel: 'Postal Code',
    states: ['Azad Kashmir', 'Balochistan', 'Gilgit-Baltistan', 'Islamabad', 'Khyber Pakhtunkhwa', 'Punjab', 'Sindh']
  },
  { name: 'Singapore', code: 'SG', phoneCode: '+65', postalLabel: 'Postal Code' },
  { name: 'Qatar', code: 'QA', phoneCode: '+974', postalLabel: 'Postal Code' },
  { name: 'Oman', code: 'OM', phoneCode: '+968', postalLabel: 'Postal Code' },
  { name: 'Kuwait', code: 'KW', phoneCode: '+965', postalLabel: 'Postal Code' },
  { name: 'Bahrain', code: 'BH', phoneCode: '+973', postalLabel: 'Postal Code' },
  { name: 'France', code: 'FR', phoneCode: '+33', postalLabel: 'Code Postal' },
  { name: 'Japan', code: 'JP', phoneCode: '+81', postalLabel: 'Postal Code' },
  { name: 'China', code: 'CN', phoneCode: '+86', postalLabel: 'Postal Code' },
  { name: 'South Korea', code: 'KR', phoneCode: '+82', postalLabel: 'Postal Code' },
  { name: 'Italy', code: 'IT', phoneCode: '+39', postalLabel: 'CAP' },
  { name: 'Spain', code: 'ES', phoneCode: '+34', postalLabel: 'Código Postal' },
  { name: 'Brazil', code: 'BR', phoneCode: '+55', postalLabel: 'CEP' },
  { name: 'Mexico', code: 'MX', phoneCode: '+52', postalLabel: 'Código Postal' },
  { name: 'South Africa', code: 'ZA', phoneCode: '+27', postalLabel: 'Postal Code' },
  { name: 'Nigeria', code: 'NG', phoneCode: '+234', postalLabel: 'Postal Code' },
  { name: 'Egypt', code: 'EG', phoneCode: '+20', postalLabel: 'Postal Code' },
  { name: 'Russia', code: 'RU', phoneCode: '+7', postalLabel: 'Postal Code' },
  { name: 'Indonesia', code: 'ID', phoneCode: '+62', postalLabel: 'Postal Code' },
  { name: 'Thailand', code: 'TH', phoneCode: '+66', postalLabel: 'Postal Code' },
  { name: 'Vietnam', code: 'VN', phoneCode: '+84', postalLabel: 'Postal Code' },
  { name: 'Philippines', code: 'PH', phoneCode: '+63', postalLabel: 'ZIP Code' },
  { name: 'Turkey', code: 'TR', phoneCode: '+90', postalLabel: 'Postal Code' },
  { name: 'New Zealand', code: 'NZ', phoneCode: '+64', postalLabel: 'Postcode' },
  { name: 'Afghanistan', code: 'AF', phoneCode: '+93', postalLabel: 'Postal Code' },
  { name: 'Iran', code: 'IR', phoneCode: '+98', postalLabel: 'Postal Code' },
  { name: 'Iraq', code: 'IQ', phoneCode: '+964', postalLabel: 'Postal Code' },
];

// Build a reverse map: state name → country name
export const STATE_COUNTRY_MAP: Record<string, string> = {};
COUNTRIES.forEach(country => {
  if (country.states) {
    country.states.forEach(state => {
      STATE_COUNTRY_MAP[state] = country.name;
    });
  }
});

export const getCountryByName = (name: string): CountryData | undefined =>
  COUNTRIES.find(c => c.name === name);

export const getPostalLabel = (countryName: string): string => {
  const country = getCountryByName(countryName);
  return country?.postalLabel || 'Postal Code';
};

export const getStatesForCountry = (countryName: string): string[] => {
  const country = getCountryByName(countryName);
  return country?.states || [];
};

export const getPhoneCode = (countryName: string): string => {
  const country = getCountryByName(countryName);
  return country?.phoneCode || '+91';
};

export const formatRole = (role: string): string => {
  return ROLE_LABELS[role] || role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};
