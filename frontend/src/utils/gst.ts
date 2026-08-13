/**
 * GST calculation — mirrors backend/app/services/gst_service.py exactly, so
 * the live preview shown while building a Purchase Order / GRN never
 * disagrees with what the backend actually persists once saved. The backend
 * is still the authority (it recomputes everything server-side rather than
 * trusting these numbers), this is purely for on-screen feedback.
 */

export type PlaceOfSupplyType = 'intra_state' | 'inter_state' | 'union_territory' | 'export';

// Union Territories WITHOUT their own legislature — CGST + UTGST applies
// when the place of supply is one of these. Delhi, Puducherry, Jammu &
// Kashmir and Ladakh, despite being UTs, have their own legislature and are
// treated like ordinary states (CGST + SGST) — NOT included here.
const UNION_TERRITORIES = new Set([
  'andaman and nicobar islands',
  'chandigarh',
  'dadra and nagar haveli and daman and diu',
  'lakshadweep',
]);

const INDIA_ALIASES = new Set(['india', 'in', 'ind']);

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGstin(gstin: string): boolean {
  return GSTIN_PATTERN.test((gstin || '').trim().toUpperCase());
}

export function isIndia(country?: string | null): boolean {
  return INDIA_ALIASES.has((country || '').trim().toLowerCase());
}

function isUnionTerritory(state?: string | null): boolean {
  return !!state && UNION_TERRITORIES.has(state.trim().toLowerCase());
}

export function determinePlaceOfSupply(
  hospitalState?: string | null,
  hospitalCountry?: string | null,
  supplierState?: string | null,
  supplierCountry?: string | null,
): PlaceOfSupplyType {
  if (!isIndia(hospitalCountry) || !isIndia(supplierCountry)) return 'export';

  const h = (hospitalState || '').trim().toLowerCase();
  const s = (supplierState || '').trim().toLowerCase();
  if (!h || !s) return 'inter_state';
  if (h !== s) return 'inter_state';
  return isUnionTerritory(hospitalState) ? 'union_territory' : 'intra_state';
}

// Round-half-up to 2 decimals, matching Python's Decimal(ROUND_HALF_UP) —
// plain JS Math.round already rounds halves up for positive numbers.
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface LineItemTax {
  base_amount: number;
  discount_amount: number;
  taxable_amount: number;
  gst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  ugst_amount: number;
  total_price: number;
}

export function computeLineItemTax(
  unitPrice: number,
  quantity: number,
  discountPercent: number,
  gstRate: number,
  placeOfSupplyType: PlaceOfSupplyType,
): LineItemTax {
  const baseAmount = round2(unitPrice * quantity);
  const discountAmount = round2(baseAmount * (discountPercent / 100));
  const taxableAmount = round2(baseAmount - discountAmount);

  const gstAmount = placeOfSupplyType === 'export' ? 0 : round2(taxableAmount * (gstRate / 100));

  let cgst = 0, sgst = 0, igst = 0, ugst = 0;
  if (placeOfSupplyType === 'inter_state') {
    igst = gstAmount;
  } else if (placeOfSupplyType === 'intra_state' || placeOfSupplyType === 'union_territory') {
    const half = round2(gstAmount / 2);
    const otherHalf = round2(gstAmount - half); // reconciles exactly by construction
    if (placeOfSupplyType === 'intra_state') { cgst = half; sgst = otherHalf; }
    else { cgst = half; ugst = otherHalf; }
  }

  const totalPrice = round2(taxableAmount + gstAmount);

  return {
    base_amount: baseAmount,
    discount_amount: discountAmount,
    taxable_amount: taxableAmount,
    gst_amount: gstAmount,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    ugst_amount: ugst,
    total_price: totalPrice,
  };
}

export function aggregateDocumentTotals(lines: LineItemTax[]): LineItemTax {
  const keys: (keyof LineItemTax)[] = [
    'base_amount', 'discount_amount', 'taxable_amount', 'gst_amount',
    'cgst_amount', 'sgst_amount', 'igst_amount', 'ugst_amount', 'total_price',
  ];
  const totals = {} as LineItemTax;
  for (const key of keys) {
    totals[key] = round2(lines.reduce((sum, l) => sum + l[key], 0));
  }
  return totals;
}

export const PLACE_OF_SUPPLY_LABELS: Record<PlaceOfSupplyType, string> = {
  intra_state: 'Intra-State (CGST + SGST)',
  inter_state: 'Inter-State (IGST)',
  union_territory: 'Union Territory (CGST + UGST)',
  export: 'Export (Zero-Rated)',
};
