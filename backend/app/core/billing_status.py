"""
Shared payment-status bucketing for BRD-001 ("Paid Status Enhancement").

`Invoice.status` already carries 7 values (draft/issued/partially_paid/paid/
overdue/cancelled/void) driven by 3 separate but consistent code paths
(invoice_service._update_invoice_status, invoice_service.issue_invoice,
payment_service._sync_invoice_after_payment) — those already auto-update
correctly on payment. This module derives the BRD's 3 client-facing states
from that existing field rather than adding a redundant column, so there is
exactly one source of truth.
"""
from typing import Optional

NOT_PAID = "not_paid"
PARTIALLY_PAID = "partially_paid"
PAID = "paid"

# Invoice.status values bucketed under each payment_status. cancelled/void are
# deliberately excluded (mapped to None) — they're moot for "did the patient
# pay", not "not paid" in the BRD's sense, and are excluded from
# payment-status filtering everywhere this is used.
_NOT_PAID_STATUSES = {"draft", "issued", "overdue"}
_PARTIALLY_PAID_STATUSES = {"partially_paid"}
_PAID_STATUSES = {"paid"}

PAYMENT_STATUS_TO_INVOICE_STATUSES = {
    NOT_PAID: _NOT_PAID_STATUSES,
    PARTIALLY_PAID: _PARTIALLY_PAID_STATUSES,
    PAID: _PAID_STATUSES,
}


def payment_status_bucket(invoice_status: str) -> Optional[str]:
    """Map an Invoice.status value to one of the 3 BRD-001 payment states,
    or None for cancelled/void (excluded from the payment-status model)."""
    if invoice_status in _NOT_PAID_STATUSES:
        return NOT_PAID
    if invoice_status in _PARTIALLY_PAID_STATUSES:
        return PARTIALLY_PAID
    if invoice_status in _PAID_STATUSES:
        return PAID
    return None


def invoice_statuses_for_payment_status(payment_status: str) -> set:
    """Reverse mapping — the set of Invoice.status values to filter by for a
    given payment_status query param. Empty set for an unrecognized value."""
    return PAYMENT_STATUS_TO_INVOICE_STATUSES.get(payment_status, set())
