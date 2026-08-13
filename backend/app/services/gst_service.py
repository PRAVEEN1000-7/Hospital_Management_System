"""
GST calculation engine — Purchase Orders only. GRN deliberately does not use
this — it stays a plain quantity/unit_price/total_price receipt record.

Implements the BRD's GST rules end to end:
- Place-of-supply determination (intra-state / inter-state / Union Territory /
  export) by comparing the hospital's own state/country against the
  supplier's.
- Per-line-item tax calculation: Base Amount -> Discount -> Taxable Amount ->
  GST -> Total, with CGST/SGST/IGST/UGST split strictly exclusive by place of
  supply — an intra-state line never has IGST, an inter-state line never has
  CGST/SGST, etc.
- 2-decimal-place rounding throughout, with the GST components always
  reconciling exactly to the computed GST total (no silent rounding drift
  between the parts and the whole).
- Multi-rate aggregation: a PO with items at different GST rates (e.g. 12%
  and 18%) still rolls up into ONE header row per document.
- GSTIN format validation, and tax-rate validation against the standard,
  hardcoded Indian GST slabs (STANDARD_GST_RATES below) — not a per-hospital
  configuration screen. See STANDARD_GST_RATES for why.
"""
import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

# Union Territories WITHOUT their own legislature — CGST + UTGST applies when
# the place of supply is one of these (real Indian GST rule). Delhi,
# Puducherry, Jammu & Kashmir and Ladakh, despite being UTs, have their own
# legislature and are treated like ordinary states (CGST + SGST) — NOT
# included here.
UNION_TERRITORIES = {
    "andaman and nicobar islands",
    "chandigarh",
    "dadra and nagar haveli and daman and diu",
    "lakshadweep",
}

INDIA_COUNTRY_ALIASES = {"india", "in", "ind"}

# Standard 15-character Indian GSTIN: 2-digit state code, 10-character PAN,
# 1-digit entity number, 'Z' by default, 1-character checksum.
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")

VALID_GST_REGISTRATION_STATUSES = {"registered", "unregistered"}
_TWO_PLACES = Decimal("0.01")

# Standard Indian GST rate slabs — fixed by the GST Council, not something
# each hospital configures, so they're always valid regardless of whether
# the hospital has any tax_configurations rows set up. This is the fix for
# a production/local discrepancy: the PO GST dropdown previously depended
# entirely on a hospital having configured tax_configurations, so a hospital
# with none (e.g. a fresh production DB never seeded, unlike the local dev
# DB) saw an empty dropdown with nothing but 0% to pick. Hardcoding these
# here means the dropdown and validation always work, with no setup step,
# in every environment.
STANDARD_GST_RATES: frozenset[Decimal] = frozenset(
    Decimal(r) for r in ("0", "5", "12", "18", "28")
)


def validate_gstin(gstin: str) -> bool:
    """15-character Indian GSTIN format check."""
    return bool(GSTIN_PATTERN.match((gstin or "").strip().upper()))


def is_india(country: Optional[str]) -> bool:
    return (country or "").strip().lower() in INDIA_COUNTRY_ALIASES


def is_union_territory(state: Optional[str]) -> bool:
    return bool(state) and state.strip().lower() in UNION_TERRITORIES


def determine_place_of_supply(
    hospital_state: Optional[str],
    hospital_country: Optional[str],
    supplier_state: Optional[str],
    supplier_country: Optional[str],
) -> str:
    """Place of supply for a PURCHASE (goods delivered TO the hospital):
    compares the supplier's origin state against the hospital's own
    delivery state. Returns one of 'intra_state' | 'inter_state' |
    'union_territory' | 'export'.

    - Either party outside India: 'export' (zero-rated per the BRD — this
      deliberately does not model import/reverse-charge IGST, which is a
      separate, more involved regime the BRD doesn't ask for).
    - Same state, and that state is a Union Territory without its own
      legislature: 'union_territory' (CGST + UTGST).
    - Same state otherwise: 'intra_state' (CGST + SGST).
    - Different states: 'inter_state' (IGST).
    - Either state is missing/unknown: 'inter_state' — the single-component
      (IGST-only) case is the safer default when place of supply can't be
      confirmed, rather than silently assuming same-state.
    """
    if not is_india(hospital_country) or not is_india(supplier_country):
        return "export"

    h_state = (hospital_state or "").strip().lower()
    s_state = (supplier_state or "").strip().lower()
    if not h_state or not s_state:
        return "inter_state"

    if h_state != s_state:
        return "inter_state"

    return "union_territory" if is_union_territory(hospital_state) else "intra_state"


def _round2(value: Decimal) -> Decimal:
    return value.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def compute_line_item_tax(
    unit_price: Decimal,
    quantity: Decimal,
    discount_percent: Decimal,
    gst_rate: Decimal,
    place_of_supply_type: str,
) -> dict:
    """Base Amount -> Discount -> Taxable Amount -> GST -> Total, split into
    CGST/SGST/IGST/UGST strictly by place_of_supply_type. Every amount is
    rounded to 2 decimal places; the GST components are derived FROM the
    rounded gst_amount (not independently rounded), so they always sum
    exactly to it — no silent 1-paisa drift between the parts and the whole.
    """
    unit_price = Decimal(unit_price)
    quantity = Decimal(quantity)
    discount_percent = Decimal(discount_percent)
    gst_rate = Decimal(gst_rate)

    base_amount = _round2(unit_price * quantity)
    discount_amount = _round2(base_amount * (discount_percent / Decimal(100)))
    taxable_amount = _round2(base_amount - discount_amount)

    if place_of_supply_type == "export":
        gst_amount = Decimal("0.00")  # zero-rated
    else:
        gst_amount = _round2(taxable_amount * (gst_rate / Decimal(100)))

    cgst = sgst = igst = ugst = Decimal("0.00")
    if place_of_supply_type == "inter_state":
        igst = gst_amount
    elif place_of_supply_type in ("intra_state", "union_territory"):
        half = _round2(gst_amount / 2)
        other_half = gst_amount - half  # reconciles exactly by construction
        if place_of_supply_type == "intra_state":
            cgst, sgst = half, other_half
        else:
            cgst, ugst = half, other_half
    # place_of_supply_type == "export": all four stay 0.00 (zero-rated)

    total_price = _round2(taxable_amount + gst_amount)

    return {
        "base_amount": base_amount,
        "discount_amount": discount_amount,
        "taxable_amount": taxable_amount,
        "gst_amount": gst_amount,
        "cgst_amount": cgst,
        "sgst_amount": sgst,
        "igst_amount": igst,
        "ugst_amount": ugst,
        "total_price": total_price,
    }


def validate_tax_rate_against_slabs(gst_rate: Decimal) -> bool:
    """GST% must be one of the standard, hardcoded statutory slabs — see
    STANDARD_GST_RATES above. No per-hospital configuration screen."""
    return Decimal(gst_rate) in STANDARD_GST_RATES


_AGGREGATE_KEYS = (
    "base_amount", "discount_amount", "taxable_amount", "gst_amount",
    "cgst_amount", "sgst_amount", "igst_amount", "ugst_amount", "total_price",
)


def aggregate_document_totals(line_results: list[dict]) -> dict:
    """Sum per-line GST calculations into the SINGLE header row a Purchase
    Order shows — even when line items used different GST rates (e.g. 12% and
    18% items on the same order), the document has exactly one subtotal/
    discount/taxable/CGST/SGST/IGST/UGST/total, not one row per rate."""
    return {
        key: sum((Decimal(r[key]) for r in line_results), Decimal("0.00"))
        for key in _AGGREGATE_KEYS
    }
