# View → Print/Download pattern

This is the app-wide convention for how a table row's Print/Download actions are exposed: a row
never triggers a direct print or download. Instead, its Actions column has a single **View**
action, and Print/Download live at the top-right of whatever that View opens.

## Reference implementation

`frontend/src/pages/pharmacy/SalesList.tsx` — the canonical example:
- State: `viewingSale`, `viewHtml`, `viewLoading`, `viewIframeRef` (`useRef<HTMLIFrameElement>`).
- `openViewInvoice(sale)`: fetches the document HTML via the existing
  `pharmacyService.getSalePdfHtml(id)` and opens the modal.
- Modal: header with title + **Print** (`viewIframeRef.current?.contentWindow?.print()`) and
  **Download** (`htmlStringToPdf(viewHtml, filename)`, from `utils/pdf.ts`) buttons top-right,
  plus a close button; body is `<iframe srcDoc={viewHtml} className="h-full w-full border-0" />`
  filling a `min-h-0 flex-1` container. `min-h-0`/`h-full` (not a fixed `vh` height inside an
  `overflow-auto` wrapper) matters — the earlier version nested two scrollbars.

## Changed (2026-08-17)

- **`RefundList.tsx`** — the "Receipt" button (`window.open`+`print()`, no Download) became
  **View** → the full modal pattern above, using `refundService.getPdfHtml(refundId)`.
- **`MyAppointments.tsx`** — the card list's single "Print/Download" icon (`window.open`+`write`,
  no actual print/download call) became **View** → the full modal pattern, using
  `appointmentService.getAppointmentPdfUrl(id)` (returns an HTML string despite its name).
- **`inventory/GRNsPage.tsx`** / **`inventory/PurchaseOrdersPage.tsx`** — these already had a
  richer structured "View" modal (order info, item table, GST breakdown for POs) with its own
  workflow buttons (Verify/Accept/Reject for GRNs). That modal content is untouched; Print and
  Download buttons were added to its header, fetching `getGRNPdfHtml`/`getPurchaseOrderPdfHtml`
  when the modal opens and printing via an off-screen iframe (`fixed -left-[9999px]`, not
  `display:none` — some browsers won't print a hidden iframe). The standalone Download icon that
  used to sit next to View in the Actions column was removed — its logic moved into the modal.
- **`optical/OpticalPrescriptions.tsx`** / **`PrescriptionList.tsx`** (both its Optical Rx and
  General Rx sub-tables) — these already had a real **View** that navigates to a full detail page
  (`OpticalPrescriptionDetail.tsx` / `PrescriptionDetail.tsx`), and that detail page's own header
  already has Print/Download. The inline Print/Download buttons duplicated in the list row were
  simply deleted — View alone is enough.

## Deliberately unchanged

Some list pages navigate to a detail page instead of opening a modal, and were left exactly as
they are, on purpose:

- **`lab/LabOrderDetail.tsx`** (from `lab/LabBilling.tsx`) — hosts lab result entry and report
  finalization.
- **`InvoiceDetail.tsx`** (from `InvoiceList.tsx`) — hosts Issue/Record Payment/Void and the full
  refund approve/reject/process lifecycle.
- **`PrescriptionDetail.tsx`** (from `PrescriptionList.tsx`'s General Rx table) — hosts
  Edit/Finalize/Delete.
- **`OpticalPrescriptionDetail.tsx`** (from `optical/OpticalPrescriptions.tsx` and
  `PrescriptionList.tsx`'s Optical Rx table) — hosts the "New Sale" entry point into dispensing.

`LabBilling.tsx` and `InvoiceList.tsx` already only had a plain "View" in their Actions column
(no inline print/download to begin with) — nothing needed to change there.

Also out of scope, by explicit decision: the nested prescription-print-inside-an-already-open
modal in `AppointmentManagement.tsx` (a different, smaller shape — print already lives inside an
open view), and `pharmacy/DispensingBilling.tsx` (a checkout workflow screen, not a list).

## Rule of thumb for new pages

- If "View" would only ever show a passive preview (nothing to click that changes state), use the
  modal pattern above.
- If the destination is a real workflow screen — anything that records a payment, changes a
  status, finalizes a record, or otherwise mutates something — keep it as page navigation, and put
  Print/Download in that page's own header instead of trying to fit the workflow into a modal.
