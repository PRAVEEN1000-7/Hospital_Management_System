import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import pharmacyService, {
  type PendingPrescription,
  type PrescriptionItemWithStock,
  type DispenseItemData,
} from '../../services/pharmacyService';
import type { Medicine, MedicineBatch } from '../../types/pharmacy';
import { formatDateOnly, formatDateTime } from '../../utils/calendarDate';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import { canEdit } from '../../config/modulePermissions';

type DispensingPrescriptionItem = PrescriptionItemWithStock;

interface DispensingPendingPrescription extends PendingPrescription {
  patient_blood_group?: string;
  diagnosis?: string;
  clinical_notes?: string;
  vitals_bp?: string;
  vitals_pulse?: string;
  vitals_temp?: string;
  vitals_weight?: string;
  vitals_spo2?: string;
  items: DispensingPrescriptionItem[];
}

interface DispensingItem extends DispensingPrescriptionItem {
  selectedBatchId?: string;
  dispensedQty: number;
  prescribedQty: number;
  remainingQty: number;
  skip: boolean;
  skipReason?: string;
  // Explicit pharmacist confirmation to dispense more than remainingQty —
  // required before the backend will accept a quantity above what was
  // prescribed; every such override is written to the audit log.
  overridePrescribedLimit?: boolean;
  // Pharmacist-adjusted rate for this line, overriding the selected batch's
  // stored selling_price — undefined means "use the batch price as-is".
  // The backend now honors this over the batch price (see
  // _allocate_batches_and_create_sale_items in dispensing_service.py).
  overrideUnitPrice?: number;
}

// A medicine (or cataloged non-medicine pharmacy item — Medicine.category
// "other"/"consumable") the pharmacist adds at dispense time that isn't on
// the prescription. Sent with prescription_item_id omitted so the backend
// skips prescribed-quantity validation entirely.
interface ExtraDispensingItem {
  clientId: string;
  medicine_id: string;
  medicine_name: string;
  generic_name?: string | null;
  dispense_unit: string;
  units_per_pack: number;
  available_batches: MedicineBatch[];
  selectedBatchId?: string;
  quantity: number;
}

const calculatePrescribedQuantity = (item: Pick<DispensingPrescriptionItem, 'frequency' | 'duration_value' | 'duration_unit' | 'quantity'>) => {
  if (typeof item.quantity === 'number' && item.quantity > 0) {
    return item.quantity;
  }

  if (!item.frequency || !item.duration_value || item.duration_value <= 0) {
    return 0;
  }

  const frequencyParts = item.frequency.match(/\d+(?:\.\d+)?/g);
  if (!frequencyParts?.length) {
    return 0;
  }

  const dailyUnits = frequencyParts.reduce((total, part) => total + Number(part), 0);
  if (dailyUnits <= 0) {
    return 0;
  }

  const normalizedUnit = (item.duration_unit || 'days').toLowerCase();
  let durationDays = item.duration_value;
  if (normalizedUnit === 'weeks') durationDays *= 7;
  if (normalizedUnit === 'months') durationDays *= 30;

  return Math.ceil(dailyUnits * durationDays);
};

// Previews how a requested quantity will actually be pulled from stock —
// mirrors the backend's FEFO allocation in dispensing_service.py's
// _allocate_and_dispense_batches (selected batch first, then remaining
// batches in expiry order) so the pharmacist can see the true batch
// breakdown *before* submitting, instead of believing everything comes from
// the one batch they picked while the backend silently splits it behind
// the scenes.
interface BatchAllocationPreview { batch: MedicineBatch; qty: number; }
function previewBatchSplit(
  qty: number,
  selectedBatchId: string | undefined,
  batches: MedicineBatch[],
): BatchAllocationPreview[] {
  if (qty <= 0 || !selectedBatchId) return [];
  const selected = batches.find((b) => b.id === selectedBatchId);
  if (!selected) return [];

  const allocations: BatchAllocationPreview[] = [];
  let remaining = qty;

  const fromSelected = Math.min(selected.quantity, remaining);
  if (fromSelected > 0) {
    allocations.push({ batch: selected, qty: fromSelected });
    remaining -= fromSelected;
  }

  if (remaining > 0) {
    // available_batches already arrives sorted by expiry_date ascending (FEFO)
    const others = batches.filter((b) => b.id !== selectedBatchId && b.quantity > 0);
    for (const b of others) {
      if (remaining <= 0) break;
      const alloc = Math.min(b.quantity, remaining);
      if (alloc <= 0) continue;
      allocations.push({ batch: b, qty: alloc });
      remaining -= alloc;
    }
  }

  return allocations;
}

// Daily dose count parsed from frequency (e.g. "1-0-1" or "2 times a day" → 2).
// Same parsing calculatePrescribedQuantity uses internally, exposed separately
// so the per-item card can show the day-wise split (price/unit, doses/day,
// how many days a given quantity covers) alongside the plain unit count.
const getDailyDoseCount = (frequency?: string | null): number => {
  if (!frequency) return 0;
  const parts = frequency.match(/\d+(?:\.\d+)?/g);
  if (!parts?.length) return 0;
  return parts.reduce((total, part) => total + Number(part), 0);
};

const getDisplayStatusLabel = (status: string) => {
  if (status === 'finalized') return 'pending';
  return status.replace('_', ' ');
};

const sanitizeClinicalNotes = (rawNotes?: string) => {
  if (!rawNotes) return '';
  const withoutDispensingAudit = rawNotes
    .replace(/\[Dispensing [^\]]+\]\s*/g, '\n')
    .replace(/(?:^|\s*\|\s*)Unable to dispense - all items skipped\.?/gi, '')
    .replace(/(?:^|\s*\|\s*)Skipped items:[^\n]*/gi, '');

  return withoutDispensingAudit
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
};

const DispensingScreen: React.FC = () => {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [prescription, setPrescription] = useState<DispensingPendingPrescription | null>(null);
  const [dispensingItems, setDispensingItems] = useState<DispensingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');

  // Extra items — medicines or cataloged non-medicine pharmacy items the
  // pharmacist adds at dispense time, not on the original prescription.
  const [extraItems, setExtraItems] = useState<ExtraDispensingItem[]>([]);
  const [extraItemSearch, setExtraItemSearch] = useState('');
  const [extraItemResults, setExtraItemResults] = useState<Medicine[]>([]);
  const [showExtraItemSearch, setShowExtraItemSearch] = useState(false);

  // Dispensing is a mutating action — the route itself is already gated to
  // edit-level pharmacy access (allowedRoles('pharmacy','edit') in App.tsx),
  // so this mirrors that with canEdit() instead of a hardcoded role list,
  // keeping it correct if a hospital admin grants pharmacy edit to a role
  // beyond pharmacist/admin.
  const hasPharmacyAccess = canEdit('pharmacy', user?.roles);

  // Load prescription details
  useEffect(() => {
    if (!prescriptionId || !hasPharmacyAccess) return;

    const loadPrescription = async () => {
      try {
        const rx = await pharmacyService.getPrescriptionForDispensing(prescriptionId) as DispensingPendingPrescription;
        setPrescription(rx);

        // Initialize dispensing items - handle empty batches gracefully
        const items: DispensingItem[] = rx.items.map((item) => {
          const prescribedQuantity = calculatePrescribedQuantity(item);
          const alreadyDispensed = Number(item.dispensed_quantity || 0);
          const remainingQty = Math.max(0, prescribedQuantity - alreadyDispensed);
          const notLinked = !item.medicine_id;
          const hasStock = !notLinked && item.available_batches && item.available_batches.length > 0;
          const isOutOfStock = !notLinked && item.available_quantity === 0;
          const firstBatch = hasStock ? item.available_batches[0] : undefined;
          // Capped by TOTAL stock across all batches, not just the auto-selected
          // (soonest-expiring) one — e.g. prescribed 1000, soon-expiring batch
          // only has 500: this must default to 1000 (not silently 500) so the
          // existing FEFO batch-split preview/allocation kicks in immediately
          // and the pharmacist isn't left thinking only 500 could be dispensed.
          const defaultDispenseQty = firstBatch ? Math.min(remainingQty, item.available_quantity || 0) : 0;
          const isAlreadyFulfilled = item.is_dispensed || remainingQty <= 0;

          let skipReason: string | undefined;
          if (isAlreadyFulfilled) skipReason = 'already_dispensed';
          else if (notLinked) skipReason = 'not_in_formulary';
          else if (!hasStock || isOutOfStock) skipReason = 'out_of_stock';

          return {
            ...item,
            quantity: prescribedQuantity,
            prescribedQty: prescribedQuantity,
            remainingQty,
            selectedBatchId: firstBatch?.id,
            dispensedQty: hasStock ? defaultDispenseQty : 0,
            skip: isAlreadyFulfilled || notLinked || !hasStock || isOutOfStock,
            skipReason,
          };
        });
        setDispensingItems(items);
      } catch (err: any) {
        showToast(
          'error',
          err?.response?.data?.detail || 'Failed to load prescription'
        );
        navigate('/pharmacy/pending-prescriptions');
      } finally {
        setLoading(false);
      }
    };

    loadPrescription();
  }, [prescriptionId, hasPharmacyAccess, showToast, navigate]);

  // Update batch selection when available batches change
  const handleBatchChange = (itemIndex: number, batchId: string) => {
    setDispensingItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIndex) return item;

        const selectedBatch = item.available_batches.find((b) => b.id === batchId);
        // Keep quantity limited to remaining prescribed quantity; backend can split across batches.
        const newQty = Math.min(item.dispensedQty, item.remainingQty);

        return {
          ...item,
          selectedBatchId: batchId,
          dispensedQty: newQty,
          // A different batch can carry a different price — drop any manual
          // rate override so the newly selected batch's own price shows,
          // rather than silently carrying over a rate meant for the old one.
          overrideUnitPrice: undefined,
        };
      })
    );
  };

  // Update dispensed quantity. Capped only by physical stock — the
  // prescribed/remaining quantity is no longer a hard ceiling here; a
  // pharmacist can go above it, but must explicitly confirm via
  // overridePrescribedLimit (see the warning banner below) before the
  // backend will accept it. Resetting the override flag whenever the
  // quantity drops back to within the normal range avoids silently sending
  // a stale confirmation the pharmacist never meant for the new value.
  const handleQuantityChange = (itemIndex: number, quantity: number) => {
    setDispensingItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIndex) return item;

        const maxQty = item.available_batches.find(
          (b) => b.id === item.selectedBatchId
        )?.quantity;
        const maxStock = item.available_quantity || maxQty || 0;
        const nextQty = Math.min(Math.max(0, quantity), maxStock);

        return {
          ...item,
          dispensedQty: nextQty,
          overridePrescribedLimit: nextQty > item.remainingQty ? item.overridePrescribedLimit : false,
        };
      })
    );
  };

  const handleOverrideToggle = (itemIndex: number, value: boolean) => {
    setDispensingItems((prev) =>
      prev.map((item, idx) => (idx === itemIndex ? { ...item, overridePrescribedLimit: value } : item))
    );
  };

  const handleUnitPriceChange = (itemIndex: number, value: number | undefined) => {
    setDispensingItems((prev) =>
      prev.map((item, idx) => (idx === itemIndex ? { ...item, overrideUnitPrice: value } : item))
    );
  };

  // Toggle skip item
  const handleSkipItem = (itemIndex: number, skip: boolean) => {
    setDispensingItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIndex) return item;
        return { ...item, skip, skipReason: skip ? item.skipReason || '' : undefined };
      })
    );
  };

  // Update skip reason
  const handleSkipReasonChange = (itemIndex: number, reason: string) => {
    setDispensingItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIndex) return item;
        return { ...item, skipReason: reason };
      })
    );
  };

  // Debounced medicine search for the "Add Item" control. An empty query
  // still resolves (first page of the formulary), so opening the box shows
  // something to browse immediately instead of nothing until typed.
  useEffect(() => {
    if (!showExtraItemSearch) {
      setExtraItemResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await pharmacyService.getMedicines(1, 10, extraItemSearch.trim(), '', true);
        if (!cancelled) setExtraItemResults(res.data || []);
      } catch {
        if (!cancelled) setExtraItemResults([]);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [extraItemSearch, showExtraItemSearch]);

  const handleAddExtraItem = async (medicine: Medicine) => {
    try {
      const batches = await pharmacyService.getAvailableBatches(medicine.id, 1);
      const validBatches = batches.filter((b) => b.quantity > 0 && new Date(b.expiry_date) > new Date());
      const firstBatch = validBatches[0];
      setExtraItems((prev) => [...prev, {
        clientId: `${medicine.id}-${Date.now()}`,
        medicine_id: medicine.id,
        medicine_name: `${medicine.name} ${medicine.strength || ''}`.trim(),
        generic_name: medicine.generic_name,
        dispense_unit: medicine.unit_of_measure || 'unit',
        units_per_pack: medicine.units_per_pack || 1,
        available_batches: validBatches,
        selectedBatchId: firstBatch?.id,
        quantity: firstBatch ? 1 : 0,
      }]);
    } catch {
      showToast('error', `Failed to load batches for ${medicine.name}`);
    }
    setExtraItemSearch('');
    setExtraItemResults([]);
    setShowExtraItemSearch(false);
  };

  const extraItemNav = useListKeyboardNav(extraItemResults, handleAddExtraItem);

  const handleExtraItemBatchChange = (clientId: string, batchId: string) => {
    setExtraItems((prev) => prev.map((item) => item.clientId === clientId ? { ...item, selectedBatchId: batchId } : item));
  };

  const handleExtraItemQuantityChange = (clientId: string, quantity: number) => {
    setExtraItems((prev) => prev.map((item) => {
      if (item.clientId !== clientId) return item;
      const batch = item.available_batches.find((b) => b.id === item.selectedBatchId);
      const maxQty = batch?.quantity ?? 0;
      return { ...item, quantity: Math.min(Math.max(0, quantity), maxQty) };
    }));
  };

  const handleRemoveExtraItem = (clientId: string) => {
    setExtraItems((prev) => prev.filter((item) => item.clientId !== clientId));
  };

  // Manual "Add Batch" — lets the pharmacist create a brand-new batch right
  // here (e.g. stock just arrived and hasn't been entered as a batch yet)
  // instead of only ever picking among whatever batches already existed when
  // the screen loaded. Works for both prescribed items and extra items.
  const [addBatchTarget, setAddBatchTarget] = useState<
    { kind: 'prescribed'; index: number; medicineId: string; medicineName: string }
    | { kind: 'extra'; clientId: string; medicineId: string; medicineName: string }
    | null
  >(null);
  const [addBatchForm, setAddBatchForm] = useState({
    batch_number: '', mfg_date: '', expiry_date: '', quantity: 0,
    purchase_price: 0, selling_price: 0,
  });
  const [savingBatch, setSavingBatch] = useState(false);

  const openAddBatchModal = (target: typeof addBatchTarget) => {
    setAddBatchTarget(target);
    setAddBatchForm({ batch_number: '', mfg_date: '', expiry_date: '', quantity: 0, purchase_price: 0, selling_price: 0 });
  };

  const handleCreateBatch = async () => {
    if (!addBatchTarget) return;
    if (!addBatchForm.batch_number.trim()) { showToast('error', 'Batch number is required'); return; }
    if (!addBatchForm.expiry_date) { showToast('error', 'Expiry date is required'); return; }
    if (addBatchForm.quantity <= 0) { showToast('error', 'Quantity must be greater than 0'); return; }
    if (addBatchForm.purchase_price < 0 || addBatchForm.selling_price < 0) { showToast('error', 'Prices cannot be negative'); return; }

    setSavingBatch(true);
    try {
      const newBatch = await pharmacyService.createBatch({
        medicine_id: addBatchTarget.medicineId,
        batch_number: addBatchForm.batch_number.trim(),
        mfg_date: addBatchForm.mfg_date || undefined,
        expiry_date: addBatchForm.expiry_date,
        quantity: addBatchForm.quantity,
        purchase_price: addBatchForm.purchase_price,
        selling_price: addBatchForm.selling_price,
      });

      if (addBatchTarget.kind === 'prescribed') {
        const targetIndex = addBatchTarget.index;
        setDispensingItems((prev) => prev.map((item, idx) => {
          if (idx !== targetIndex) return item;
          const updatedBatches = [...item.available_batches, newBatch].sort(
            (a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
          );
          return {
            ...item,
            available_batches: updatedBatches,
            available_quantity: (item.available_quantity || 0) + newBatch.quantity,
            selectedBatchId: newBatch.id,
            // The item may have been auto-skipped for lack of stock — now that
            // a batch exists, bring it back into the dispensable list.
            skip: false,
            skipReason: undefined,
            dispensedQty: Math.min(item.remainingQty, newBatch.quantity),
          };
        }));
      } else {
        const targetClientId = addBatchTarget.clientId;
        setExtraItems((prev) => prev.map((item) => {
          if (item.clientId !== targetClientId) return item;
          const updatedBatches = [...item.available_batches, newBatch].sort(
            (a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
          );
          return {
            ...item,
            available_batches: updatedBatches,
            selectedBatchId: newBatch.id,
            quantity: item.quantity > 0 ? item.quantity : 1,
          };
        }));
      }

      showToast('success', `Batch ${newBatch.batch_number} added`);
      setAddBatchTarget(null);
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to add batch');
    } finally {
      setSavingBatch(false);
    }
  };

  // Extra items ready to submit — has a batch selected and a positive quantity.
  const extraItemsPayload: DispenseItemData[] = extraItems
    .filter((item) => item.quantity > 0 && item.selectedBatchId)
    .map((item) => {
      const batch = item.available_batches.find((b) => b.id === item.selectedBatchId);
      return {
        medicine_id: item.medicine_id,
        batch_id: item.selectedBatchId!,
        quantity: item.quantity,
        unit_price: Number(batch?.selling_price || 0),
      };
    });
  const extraItemsCost = extraItemsPayload.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);

  // Determine read-only mode early (before useEffect that uses it)
  const isReadOnly = searchParams.get('mode') === 'view' || (prescription?.status === 'dispensed');
  const clinicalNotesForDisplay = sanitizeClinicalNotes(prescription?.clinical_notes);

  // Calculate totals from backend preview
  const [previewData, setPreviewData] = useState<{
    currentSubtotal: number;
    overallDispensedValue: number;
    itemsToDispense: number;
    itemsSkipped: number;
    totalAmount: number;
  } | null>(null);

  // Fetch preview totals from backend when items change
  useEffect(() => {
    // Don't fetch preview if loading, read-only, or no items
    if (!prescriptionId || isReadOnly || !dispensingItems.length) {
      setPreviewData(null);
      return;
    }

    const fetchPreview = async () => {
      try {
        // Build items array for preview API
        const itemsForPreview = [
          ...dispensingItems
            .filter((item) => !item.skip && !item.is_dispensed && item.dispensedQty > 0 && item.remainingQty > 0 && item.medicine_id !== null)
            .map((item) => {
              const selectedBatch = item.available_batches.find((b) => b.id === item.selectedBatchId);
              const fallbackBatch = selectedBatch || item.available_batches[0];
              return {
                prescription_item_id: item.id,
                medicine_id: item.medicine_id!,
                batch_id: item.selectedBatchId || '',
                quantity: item.dispensedQty,
                unit_price: item.overrideUnitPrice ?? Number(fallbackBatch?.selling_price || 0),
              };
            }),
          ...extraItemsPayload,
        ];

        if (itemsForPreview.length === 0) {
          // All items skipped or already dispensed
          setPreviewData({
            currentSubtotal: 0,
            overallDispensedValue: 0,
            itemsToDispense: 0,
            itemsSkipped: dispensingItems.filter((item) => item.skip && !item.is_dispensed && item.remainingQty > 0).length,
            totalAmount: 0,
          });
          return;
        }

        const result = await pharmacyService.previewDispensingTotals(prescriptionId, itemsForPreview);
        
        // Calculate overall dispensed value (including already dispensed)
        let overallDispensedValue = 0;
        dispensingItems.forEach((item) => {
          const selectedBatch = item.available_batches.find((b) => b.id === item.selectedBatchId);
          const fallbackBatch = selectedBatch || item.available_batches[0];
          const price = fallbackBatch?.selling_price || 0;
          overallDispensedValue += (item.dispensed_quantity || 0) * price;
        });

        setPreviewData({
          currentSubtotal: Number(result?.data?.subtotal || 0),
          overallDispensedValue: overallDispensedValue + Number(result?.data?.subtotal || 0),
          itemsToDispense: Number(result?.data?.items_dispensed || 0),
          itemsSkipped: Number(result?.data?.items_skipped || 0),
          totalAmount: Number(result?.data?.total_amount || 0),
        });
      } catch (err: any) {
        console.error('Failed to fetch preview totals:', err);
        // Fallback to local calculation if preview fails
        setPreviewData(null);
      }
    };

    // Debounce the preview fetch
    const timeoutId = setTimeout(fetchPreview, 300);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispensingItems, extraItems, prescriptionId, isReadOnly]);

  // Use backend preview data if available, otherwise fallback to local calculation
  const totals = previewData || (() => {
    let currentSubtotal = 0;
    let overallDispensedValue = 0;
    let itemsToDispense = 0;
    let itemsSkipped = 0;

    dispensingItems.forEach((item) => {
      const selectedBatch = item.available_batches.find((b) => b.id === item.selectedBatchId);
      const fallbackBatch = selectedBatch || item.available_batches[0];
      const price = fallbackBatch?.selling_price || 0;

      // Includes already-dispensed quantity so pharmacists can see total dispensed value.
      overallDispensedValue += (item.dispensed_quantity || 0) * price;

      if (item.skip && !item.is_dispensed && item.remainingQty > 0) {
        itemsSkipped++;
        return;
      }

      if (item.dispensedQty <= 0) {
        return;
      }

      currentSubtotal += item.dispensedQty * price;
      overallDispensedValue += item.dispensedQty * price;
      itemsToDispense++;
    });

    currentSubtotal += extraItemsCost;
    overallDispensedValue += extraItemsCost;
    itemsToDispense += extraItemsPayload.length;

    return { currentSubtotal, overallDispensedValue, itemsToDispense, itemsSkipped };
  })();
  const currentTransactionTotal = Number((totals as any).currentSubtotal ?? (totals as any).subtotal ?? 0);
  const overallDispensedTotal = Number((totals as any).overallDispensedValue ?? 0);
  const canSubmit =
    totals.itemsToDispense > 0 ||
    extraItemsPayload.length > 0 ||
    dispensingItems.every((item) => item.skip || item.is_dispensed || item.remainingQty <= 0);
  const isSkipOnlySubmit = !isReadOnly && canSubmit && totals.itemsToDispense === 0 && extraItemsPayload.length === 0;

  // Handle dispensing submission
  const handleDispense = async () => {
    if (isReadOnly) {
      showToast('info', 'This prescription is in view mode and cannot be dispensed again.');
      return;
    }

    const unresolvedOutOfStock = dispensingItems.filter(
      (item) => item.available_quantity === 0 && !item.skip && !item.is_dispensed && item.remainingQty > 0
    );
    if (unresolvedOutOfStock.length > 0) {
      showToast(
        'error',
        `Out of stock items must be skipped or resolved before dispensing (${unresolvedOutOfStock.length} item${unresolvedOutOfStock.length > 1 ? 's' : ''}).`
      );
      return;
    }

    const skippedWithoutReason = dispensingItems.filter(
      (item) => item.skip && !item.is_dispensed && !(item.skipReason && item.skipReason.trim())
    );
    if (skippedWithoutReason.length > 0) {
      showToast('error', 'Please select a skip reason for all skipped items.');
      return;
    }

    const allSkipped = dispensingItems.every(
      (item) => item.skip || item.is_dispensed || item.remainingQty <= 0
    );

    if (totals.itemsToDispense === 0 && !allSkipped) {
      showToast('error', 'At least one item must be dispensed, or skip all items with reasons to close this prescription.');
      return;
    }

    // Any open line left with 0 quantity and not explicitly skipped is silently
    // dropped from the request below (neither dispensed nor recorded as skipped),
    // which leaves that line — and therefore the whole prescription — stuck on
    // "pending" forever with no indication why. Block submission until every
    // open line is resolved one way or the other.
    const unresolvedItems = dispensingItems.filter(
      (item) => !item.is_dispensed && item.remainingQty > 0 && !item.skip && item.dispensedQty <= 0
    );
    if (unresolvedItems.length > 0) {
      showToast(
        'error',
        `Enter a quantity or mark as skipped for: ${unresolvedItems.map((i) => i.medicine_name).join(', ')}`
      );
      return;
    }

    const unconfirmedOverrides = dispensingItems.filter(
      (item) => !item.skip && item.dispensedQty > item.remainingQty && !item.overridePrescribedLimit
    );
    if (unconfirmedOverrides.length > 0) {
      showToast(
        'error',
        `Confirm dispensing more than prescribed for: ${unconfirmedOverrides.map((i) => i.medicine_name).join(', ')}`
      );
      return;
    }

    if (!prescription) return;

    setSaving(true);
    try {
      // Prepare items for dispensing
      const itemsToDispense: DispenseItemData[] = [];
      const skippedItems = dispensingItems
        .filter((item) => item.skip && !item.is_dispensed && item.remainingQty > 0)
        .map((item) => ({
          prescription_item_id: item.id,
          reason: item.skipReason || 'skipped',
        }));

      const skipSummary = dispensingItems
        .filter((item) => item.skip && !item.is_dispensed)
        .map((item) => `${item.medicine_name}: ${item.skipReason || 'skipped'}`)
        .join('; ');
      const combinedNotes = [
        skipSummary ? `Skipped items: ${skipSummary}` : '',
        notes,
      ].filter(Boolean).join(' | ');

      dispensingItems.forEach((item) => {
        if (item.skip || item.dispensedQty <= 0 || !item.medicine_id) return;

        const batch = item.available_batches.find(
          (b) => b.id === item.selectedBatchId
        );

        if (!batch) {
          showToast('error', `No batch selected for ${item.medicine_name}`);
          return;
        }

        itemsToDispense.push({
          prescription_item_id: item.id,
          medicine_id: item.medicine_id,
          batch_id: item.selectedBatchId!,
          quantity: item.dispensedQty,
          unit_price: item.overrideUnitPrice ?? (Number(batch.selling_price) || 0),
          override_prescribed_limit: item.dispensedQty > item.remainingQty ? true : undefined,
        });
      });

      itemsToDispense.push(...extraItemsPayload);

      // All-skipped case: record inability to dispense and mark prescription closed
      // (only when there are truly no extra items either — extras alone should
      // still go through the normal dispense path below).
      if (itemsToDispense.length === 0 && allSkipped) {
        const allSkippedNotes = [
          'Unable to dispense - all items skipped.',
          combinedNotes,
        ].filter(Boolean).join(' | ');
        await pharmacyService.dispensePrescription(prescriptionId!, [], skippedItems, allSkippedNotes);
        showToast('success', 'Prescription closed — all items skipped and recorded.');
        navigate('/pharmacy/pending-prescriptions');
        return;
      }

      // Call dispensing API
      const result = await pharmacyService.dispensePrescription(
        prescriptionId!,
        itemsToDispense,
        skippedItems,
        combinedNotes || undefined
      );

      // A stock race on one item (another sale/dispense consumed the batch
      // between this screen loading and Confirm being clicked) no longer
      // aborts the whole dispense — the backend still commits every other
      // item and reports the miss back here as a popup only, so it never
      // blocks dispensing the rest of the prescription.
      const failedItems = result.data?.failed_items || [];
      showToast(failedItems.length > 0 ? 'warning' : 'success', result.message);

      // Dispensing is now a standalone action — it no longer forces the user
      // into a one-shot billing page. Payment for the resulting sale (created
      // pending, see dispense_prescription) is collected any time afterward
      // from the persistent Sales worklist (SalesList.tsx "Receive Payment"),
      // so a refresh/network drop right after dispensing no longer strands
      // the sale on an unreachable payment screen.
      navigate('/pharmacy/pending-prescriptions');
    } catch (err: any) {
      showToast(
        'error',
        err?.response?.data?.detail || 'Failed to dispense prescription'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!hasPharmacyAccess) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800">Access Denied</h2>
          <p className="text-red-600 mt-2">You don't have access to edit this.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300 animate-spin">
            progress_activity
          </span>
          <p className="text-slate-500 mt-4">Loading prescription...</p>
        </div>
      </div>
    );
  }

  if (!prescription) {
    return null;
  }

  const statusColor: Record<string, string> = {
    finalized: 'bg-blue-100 text-blue-700 border-blue-300',
    dispensed: 'bg-green-100 text-green-700 border-green-300',
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - Matches PrescriptionDetail layout */}
      <div className="flex items-start gap-3 mb-6">
        <button
          onClick={() => navigate('/pharmacy/pending-prescriptions')}
          title="Back to Pending Prescriptions"
          className="p-2 -ml-2 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
        </button>
        <div>
          <nav className="flex text-sm text-slate-400 mb-1">
            <button onClick={() => navigate('/pharmacy/pending-prescriptions')} className="hover:text-primary">
              Pending Prescriptions
            </button>
            <span className="mx-2">/</span>
            <span className="text-slate-600">Dispensing</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            {isReadOnly ? 'View Dispensing' : 'Dispense'} {prescription.prescription_number}
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
              statusColor[prescription.status] || 'bg-slate-100 text-slate-700'
            }`}>
              {getDisplayStatusLabel(prescription.status)}
            </span>
          </h1>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Patient & Prescription Info (1/3 width) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          {/* Patient Info Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-primary/80 px-4 py-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-base">person</span>
                Patient Information
              </h2>
            </div>
            <div className="p-4 space-y-3">
              <InfoRow 
                icon="badge" 
                label="Name" 
                value={
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{prescription.patient_name}</span>
                    {prescription.patient_reference_number && (
                      <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                        {prescription.patient_reference_number}
                      </span>
                    )}
                  </div>
                } 
              />
              {(prescription.patient_age != null || prescription.patient_gender) && (
                <InfoRow 
                  icon="cake" 
                  label="Age / Sex" 
                  value={`${prescription.patient_age ?? '-'}y / ${prescription.patient_gender || '-'}`} 
                />
              )}
              {prescription.patient_phone && (
                <InfoRow icon="phone" label="Phone" value={prescription.patient_phone} />
              )}
              {prescription.patient_blood_group && (
                <InfoRow 
                  icon="bloodtype" 
                  label="Blood Group" 
                  value={<span className="font-bold text-red-600">{prescription.patient_blood_group}</span>} 
                />
              )}
            </div>
          </div>

          {/* Doctor Info Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-base">medical_services</span>
                Prescribing Doctor
              </h2>
            </div>
            <div className="p-4 space-y-3">
              <InfoRow 
                icon="person" 
                label="Doctor" 
                value={
                  <div>
                    <div className="font-medium text-slate-900">{prescription.doctor_name || 'No doctor assigned'}</div>
                    {prescription.doctor_specialization && (
                      <div className="text-xs text-slate-500">{prescription.doctor_specialization}</div>
                    )}
                  </div>
                } 
              />
              <InfoRow 
                icon="event" 
                label="Date" 
                value={formatDateTime(prescription.created_at)}
              />
            </div>
          </div>

          {/* Clinical Info Card */}
          {(prescription.diagnosis || prescription.clinical_notes || prescription.vitals_bp) && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">clinical_notes</span>
                  Clinical Information
                </h2>
              </div>
              <div className="p-4 space-y-3">
                {prescription.diagnosis && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Diagnosis</div>
                    <div className="text-sm text-slate-900">{prescription.diagnosis}</div>
                  </div>
                )}
                {clinicalNotesForDisplay && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Clinical Notes</div>
                    <div className="text-sm text-slate-900 whitespace-pre-line break-words">{clinicalNotesForDisplay}</div>
                  </div>
                )}
                {/* Vitals Grid */}
                {(prescription.vitals_bp || prescription.vitals_pulse || prescription.vitals_weight) && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase font-semibold mb-2">Vitals</div>
                    <div className="grid grid-cols-2 gap-2">
                      {prescription.vitals_bp && (
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className="text-xs text-slate-500">BP</div>
                          <div className="text-sm font-semibold text-slate-900">{prescription.vitals_bp}</div>
                        </div>
                      )}
                      {prescription.vitals_pulse && (
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className="text-xs text-slate-500">Pulse</div>
                          <div className="text-sm font-semibold text-slate-900">{prescription.vitals_pulse}</div>
                        </div>
                      )}
                      {prescription.vitals_temp && (
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className="text-xs text-slate-500">Temp</div>
                          <div className="text-sm font-semibold text-slate-900">{prescription.vitals_temp}</div>
                        </div>
                      )}
                      {prescription.vitals_weight && (
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className="text-xs text-slate-500">Weight</div>
                          <div className="text-sm font-semibold text-slate-900">{prescription.vitals_weight}</div>
                        </div>
                      )}
                      {prescription.vitals_spo2 && (
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <div className="text-xs text-slate-500">SpO2</div>
                          <div className="text-sm font-semibold text-slate-900">{prescription.vitals_spo2}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Medicines to Dispense (2/3 width) */}
        <div className="lg:col-span-8 xl:col-span-9">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-xl">medication</span>
                Medicines to Dispense
              </h2>
              <p className="text-emerald-100 text-sm mt-1">
                {dispensingItems.length} items prescribed | {totals.itemsToDispense} items selected to dispense
                {totals.itemsSkipped > 0 && <span className="ml-2">| {totals.itemsSkipped} skipped</span>}
              </p>
            </div>

            {/* Consultation fee status — informational only, never blocks dispensing */}
            {prescription.consultation_fee_collected === false && (
              <div className="mx-6 mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="material-symbols-outlined text-amber-600 text-lg flex-shrink-0">info</span>
                <p className="text-sm text-amber-800">
                  Consultation fee not yet collected for this patient — dispensing can still proceed.
                </p>
              </div>
            )}

            {/* Medicine Items List */}
            <div className="p-6 space-y-4">
              {dispensingItems.map((item, index) => {
                const selectedBatch = item.available_batches.find(
                  (b) => b.id === item.selectedBatchId
                );
                const prescribedQuantity = item.prescribedQty;
                const isOutOfStock = item.available_quantity === 0;

                return (
                  <div
                    key={item.id}
                    className={`border-2 rounded-xl p-4 transition-all ${
                      item.skip
                        ? 'bg-slate-50 border-slate-200'
                        : isOutOfStock
                        ? 'bg-red-50 border-red-200'
                        : 'bg-white border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    {/* Medicine Header */}
                    <div className="mb-3">
                      <div className="md:grid md:grid-cols-12 md:gap-4 md:items-start">
                        <div className="md:col-span-7 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-slate-900 text-lg truncate">
                              {item.medicine_name}
                            </span>
                            {item.eye_side && (
                              <span
                                title="Eye Hospital Drug Prescription — which eye this item is for"
                                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-bold"
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>visibility</span>
                                {item.eye_side === 'Both' ? 'LE + RE' : item.eye_side}
                              </span>
                            )}
                            {item.is_dispensed && (
                              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                Already Dispensed
                              </span>
                            )}
                          </div>
                          {item.generic_name && (
                            <div className="text-sm text-slate-500 truncate">
                              Generic: {item.generic_name}
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-2 flex-wrap">
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">medication</span>
                              Dosage: {item.dosage}
                            </span>
                            {item.frequency && (
                              <span className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">schedule</span>
                                {item.frequency}
                              </span>
                            )}
                            {item.duration_value && (
                              <span className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">today</span>
                                {item.duration_value} {item.duration_unit}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quantity Snapshot */}
                        <div className="md:col-span-5 mt-3 md:mt-0">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-slate-100 rounded-lg px-3 py-2 text-center">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Prescribed</div>
                              <div className="text-xl font-bold text-slate-900 leading-tight">{prescribedQuantity}</div>
                              <div className="text-[11px] text-slate-500">{item.dispense_unit || 'units'}</div>
                            </div>
                            <div className="bg-slate-100 rounded-lg px-3 py-2 text-center">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Dispensed</div>
                              <div className="text-xl font-bold text-slate-900 leading-tight">{Number(item.dispensed_quantity || 0)}</div>
                              <div className="text-[11px] text-slate-500">{item.dispense_unit || 'units'}</div>
                            </div>
                            <div className="bg-slate-100 rounded-lg px-3 py-2 text-center">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Remaining</div>
                              <div className={`text-xl font-bold leading-tight ${item.remainingQty > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{item.remainingQty}</div>
                              <div className="text-[11px] text-slate-500">{item.dispense_unit || 'units'}</div>
                            </div>
                            {item.units_per_pack && item.units_per_pack > 1 && item.remainingQty > 0 && (
                              <div className="col-span-3 mt-1.5 text-[11px] text-amber-800 text-center bg-amber-50/50 rounded border border-amber-100 py-1 font-medium">
                                Needs: <span className="font-bold">{Math.floor(item.remainingQty / item.units_per_pack)} strips</span> + <span className="font-bold">{item.remainingQty % item.units_per_pack} loose</span> (Pack: {item.units_per_pack})
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stock Status Alert */}
                    {!item.skip && (
                      <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
                        isOutOfStock
                          ? 'bg-red-100 text-red-700'
                          : selectedBatch
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        <span className="material-symbols-outlined text-lg">
                          {isOutOfStock ? 'error' : selectedBatch ? 'check_circle' : 'warning'}
                        </span>
                        <div className="text-sm">
                          {isOutOfStock ? (
                            <span className="font-semibold">❌ Out of Stock</span>
                          ) : selectedBatch ? (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>
                                <span className="font-semibold">Need now:</span> {item.remainingQty} units
                              </span>
                              <span>
                                <span className="font-semibold">Selected batch:</span> {selectedBatch.quantity} units
                              </span>
                              <span>
                                <span className="font-semibold">Total available:</span> {item.available_quantity} units
                              </span>
                              {selectedBatch.expiry_date && (
                                <span className="text-xs">
                                  Exp: {formatDateOnly(selectedBatch.expiry_date)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="font-semibold">⚠️ No stock available</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Batch split warning — the selected batch alone can't cover the
                        entered quantity, so the backend will auto-pull the rest from
                        other batches (soonest-expiring first). Show that breakdown
                        instead of letting the pharmacist believe it all comes from
                        the batch they picked. */}
                    {!item.skip && selectedBatch && item.dispensedQty > selectedBatch.quantity && (() => {
                      const allocations = previewBatchSplit(item.dispensedQty, item.selectedBatchId, item.available_batches);
                      const extra = allocations.slice(1);
                      if (extra.length === 0) return null;
                      return (
                        <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
                          <div className="flex items-center gap-2 font-semibold mb-1">
                            <span className="material-symbols-outlined text-lg">call_split</span>
                            Selected batch only has {selectedBatch.quantity} — the rest will be pulled from other batches
                          </div>
                          <ul className="pl-6 list-disc space-y-0.5">
                            <li>{allocations[0].qty} units from {allocations[0].batch.batch_number} (exp {formatDateOnly(allocations[0].batch.expiry_date)})</li>
                            {extra.map(a => (
                              <li key={a.batch.id}>{a.qty} units from {a.batch.batch_number} (exp {formatDateOnly(a.batch.expiry_date)})</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}

                    {/* Dispensing Controls */}
                    {!item.skip && !isOutOfStock && !item.is_dispensed && !isReadOnly && (
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        {/* Batch Selection */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-slate-600 uppercase">
                              Select Batch
                            </label>
                            <button
                              type="button"
                              onClick={() => openAddBatchModal({
                                kind: 'prescribed', index, medicineId: item.medicine_id!, medicineName: item.medicine_name,
                              })}
                              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add_circle</span>
                              Add Batch
                            </button>
                          </div>
                          <select
                            value={item.selectedBatchId || ''}
                            onChange={(e) => handleBatchChange(index, e.target.value)}
                            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                            disabled={item.available_batches.length === 0}
                          >
                            {item.available_batches.map((batch) => (
                              <option key={batch.id} value={batch.id}>
                                {batch.batch_number} | Exp: {formatDateOnly(batch.expiry_date)} | Stock: {batch.quantity}
                              </option>
                            ))}
                          </select>
                          {/* Rate — defaults to the selected batch's stored selling
                              price, but the pharmacist can raise or lower it for
                              this dispense (e.g. a discount, or a price correction);
                              the backend now honors this over the batch price. */}
                          <div className="mt-2">
                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
                              Rate (₹)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.overrideUnitPrice ?? (Number(selectedBatch?.selling_price) || '')}
                              placeholder="0.00"
                              onChange={(e) => {
                                const raw = e.target.value;
                                handleUnitPriceChange(index, raw === '' ? undefined : Math.max(0, parseFloat(raw) || 0));
                              }}
                              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                            />
                          </div>
                        </div>

                        {/* Quantity Input */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5 flex justify-between items-center">
                            <span>Dispense Quantity</span>
                            {item.units_per_pack && item.units_per_pack > 1 && (
                              <span className="text-[10px] text-slate-400 font-normal normal-case">Pack size: {item.units_per_pack}</span>
                            )}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="0"
                              max={item.available_quantity || undefined}
                              value={item.dispensedQty || ''} placeholder="0"
                              onChange={(e) =>
                                handleQuantityChange(index, parseInt(e.target.value) || 0)
                              }
                              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all font-semibold"
                            />
                            {item.units_per_pack && item.units_per_pack > 1 && (
                              <div className="flex gap-1">
                                {Math.floor(item.remainingQty / item.units_per_pack) > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const strips = Math.floor(item.remainingQty / (item.units_per_pack || 1));
                                      const qty = strips * (item.units_per_pack || 1);
                                      handleQuantityChange(index, qty);
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                                  >
                                    {Math.floor(item.remainingQty / item.units_per_pack)} Strips
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleQuantityChange(index, item.remainingQty)}
                                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                                >
                                  All
                                </button>
                              </div>
                            )}
                          </div>
                          {item.units_per_pack && item.units_per_pack > 1 && item.dispensedQty > 0 && (
                            <div className="text-[11px] text-emerald-800 mt-1.5 font-medium flex items-center gap-1 bg-emerald-50/50 rounded border border-emerald-100/50 px-2 py-0.5 w-fit">
                              <span className="material-symbols-outlined text-[13px] text-emerald-600">inventory_2</span>
                              <span>
                                Dispensing: <span className="font-bold">{Math.floor(item.dispensedQty / item.units_per_pack)} strips</span>
                                {item.dispensedQty % item.units_per_pack > 0 && (
                                  <> + <span className="font-bold">{item.dispensedQty % item.units_per_pack} loose</span></>
                                )}
                              </span>
                            </div>
                          )}
                          {selectedBatch && item.dispensedQty > (selectedBatch.quantity || 0) && (
                            <div className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">sync_alt</span>
                              Remaining quantity will be auto-allocated from additional batches in this dispense.
                            </div>
                          )}
                          {item.dispensedQty > item.remainingQty && (
                            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <div className="flex items-start gap-2 text-sm text-amber-800">
                                <span className="material-symbols-outlined text-amber-600 text-lg flex-shrink-0">warning</span>
                                <p>
                                  This dispenses <strong>{item.dispensedQty - item.remainingQty} more unit{item.dispensedQty - item.remainingQty !== 1 ? 's' : ''}</strong> than
                                  prescribed (prescribed {item.prescribedQty}, remaining {item.remainingQty}). This will be recorded in the audit log.
                                </p>
                              </div>
                              <label className="flex items-center gap-2 mt-2 text-xs font-semibold text-amber-800 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.overridePrescribedLimit === true}
                                  onChange={(e) => handleOverrideToggle(index, e.target.checked)}
                                  className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-2 focus:ring-amber-300"
                                />
                                Confirm dispensing more than prescribed
                              </label>
                            </div>
                          )}
                          {(() => {
                            const dailyDoseCount = getDailyDoseCount(item.frequency);
                            // selling_price arrives as a string (Decimal serialized by the
                            // API) despite the MedicineBatch type claiming number — Number()
                            // it here since unitPrice.toFixed() below needs a real number.
                            // Reflects the pharmacist's rate override when set, same value
                            // that will actually be billed (see the submit payload below).
                            const unitPrice = item.overrideUnitPrice ?? (Number(selectedBatch?.selling_price) || 0);
                            if (!dailyDoseCount || !unitPrice || item.dispensedQty <= 0) return null;
                            const totalDays = prescribedQuantity / dailyDoseCount;
                            const daysCoveredNow = item.dispensedQty / dailyDoseCount;
                            const lineTotal = item.dispensedQty * unitPrice;
                            const fullyCovered = daysCoveredNow >= totalDays;
                            const fmtDays = (d: number) => (Number.isInteger(d) ? d : d.toFixed(1));
                            const unitLabel = item.dispense_unit || 'unit';
                            return (
                              <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                <div className="grid grid-cols-4 gap-2">
                                  <div className="text-center">
                                    <div className="text-[9px] text-blue-500 uppercase font-bold tracking-wide">Unit Price</div>
                                    <div className="text-sm font-bold text-blue-900 leading-tight">₹{unitPrice.toFixed(2)}</div>
                                    <div className="text-[9px] text-blue-400">per {unitLabel}</div>
                                  </div>
                                  <div className="text-center border-l border-blue-100">
                                    <div className="text-[9px] text-blue-500 uppercase font-bold tracking-wide">Dose/Day</div>
                                    <div className="text-sm font-bold text-blue-900 leading-tight">{dailyDoseCount}</div>
                                    <div className="text-[9px] text-blue-400">{unitLabel}(s) daily</div>
                                  </div>
                                  <div className="text-center border-l border-blue-100">
                                    <div className="text-[9px] text-blue-500 uppercase font-bold tracking-wide">Days Covered</div>
                                    <div className={`text-sm font-bold leading-tight ${fullyCovered ? 'text-emerald-700' : 'text-amber-700'}`}>
                                      {fmtDays(daysCoveredNow)} <span className="text-blue-400 font-normal">/ {fmtDays(totalDays)}</span>
                                    </div>
                                    <div className="text-[9px] text-blue-400">{fullyCovered ? 'full course' : 'partial'}</div>
                                  </div>
                                  <div className="text-center border-l border-blue-100">
                                    <div className="text-[9px] text-blue-500 uppercase font-bold tracking-wide">Line Total</div>
                                    <div className="text-sm font-bold text-emerald-700 leading-tight">₹{lineTotal.toFixed(2)}</div>
                                    <div className="text-[9px] text-blue-400">for {item.dispensedQty} {unitLabel}(s)</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Skip/Actions */}
                    {!item.skip && !item.is_dispensed && item.remainingQty > 0 && !isReadOnly && (
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200">
                        <button
                          onClick={() => handleSkipItem(index, true)}
                          className="text-sm text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">remove_circle</span>
                          Skip this item
                        </button>
                        {item.allow_substitution && (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">swap_horiz</span>
                            Substitution allowed
                          </span>
                        )}
                      </div>
                    )}

                    {/* Skip Reason (when skipped) */}
                    {item.skip && !item.is_dispensed && !isReadOnly && (
                      <div className="mt-4 p-3 bg-slate-100 rounded-lg">
                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
                          Skip Reason
                        </label>
                        <select
                          value={item.skipReason || ''}
                          onChange={(e) => handleSkipReasonChange(index, e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">Select reason...</option>
                          <option value="out_of_stock">Out of stock</option>
                          {/* Auto-skip reason set when this line's medicine isn't linked to the
                              pharmacy catalog at all — without this option the <select> silently
                              shows "Select reason..." even though a reason is already set, making
                              it look like the pharmacist forgot to pick one. */}
                          <option value="not_in_formulary">Not linked to pharmacy formulary</option>
                          <option value="patient_refused">Patient refused</option>
                          <option value="doctor_approved_alternative">Doctor approved alternative</option>
                          <option value="expired_batch">Expired batch</option>
                          <option value="other">Other</option>
                        </select>
                        <div className="flex items-center gap-4 mt-2">
                          <button
                            onClick={() => handleSkipItem(index, false)}
                            className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">undo</span>
                            Undo - Include this item
                          </button>
                          {/* Most useful right here — this is exactly where "no batch
                              exists yet" (out_of_stock) leaves the pharmacist stuck with
                              no way to select one at all. */}
                          {item.medicine_id && (
                            <button
                              onClick={() => openAddBatchModal({
                                kind: 'prescribed', index, medicineId: item.medicine_id!, medicineName: item.medicine_name,
                              })}
                              className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-sm">add_circle</span>
                              Add Batch
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Already Dispensed Badge */}
                    {item.is_dispensed && (
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                        <span className="material-symbols-outlined text-green-600">check_circle</span>
                        <span className="text-sm text-green-700 font-medium">
                          Already dispensed: {item.dispensed_quantity} units
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Already-dispensed extra items — added by the pharmacist during a
                previous (or this) dispensing session, not tied to any
                prescription line. Read-only; shown whenever any exist, in
                both view mode and while dispensing further items. */}
            {!!prescription.extra_items?.length && (
              <div className="px-6 pb-2">
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Extra Items Dispensed</h3>
                  <div className="space-y-2">
                    {prescription.extra_items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{item.medicine_name}</p>
                          {item.batch_number && (
                            <p className="text-xs text-slate-500">Batch: {item.batch_number}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-slate-900">{item.quantity} units</p>
                          <p className="text-xs text-slate-500">₹{Number(item.total_price).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Extra Items — medicines or cataloged non-medicine pharmacy items
                not on the original prescription, added by the pharmacist here. */}
            {!isReadOnly && (
              <div className="px-6 pb-2">
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-700">Extra Items</h3>
                    {!showExtraItemSearch && (
                      <button
                        type="button"
                        onClick={() => setShowExtraItemSearch(true)}
                        className="text-sm text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">add_circle</span>
                        Add Item
                      </button>
                    )}
                  </div>

                  {showExtraItemSearch && (
                    <div className="relative mb-3">
                      <input
                        autoFocus
                        value={extraItemSearch}
                        onChange={(e) => setExtraItemSearch(e.target.value)}
                        onKeyDown={extraItemNav.onKeyDown}
                        placeholder="Search by name, or browse below..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      />
                      <button
                        type="button"
                        onClick={() => { setShowExtraItemSearch(false); setExtraItemSearch(''); setExtraItemResults([]); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                      {extraItemResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {!extraItemSearch.trim() && (
                            <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">Browse items</p>
                          )}
                          {extraItemResults.map((med, idx) => (
                            <button
                              key={med.id}
                              type="button"
                              onClick={() => handleAddExtraItem(med)}
                              onMouseEnter={() => extraItemNav.setActiveIndex(idx)}
                              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                                idx === extraItemNav.activeIndex ? 'bg-emerald-50' : 'hover:bg-emerald-50'
                              }`}
                            >
                              <span>
                                <span className="font-medium text-slate-900">{med.name}</span>
                                {med.strength && <span className="text-slate-500"> {med.strength}</span>}
                              </span>
                              {med.category && <span className="text-xs text-slate-400">{med.category}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {extraItems.length > 0 && (
                    <div className="space-y-3">
                      {extraItems.map((item) => {
                        const selectedBatch = item.available_batches.find((b) => b.id === item.selectedBatchId);
                        const totalAvailable = item.available_batches.reduce((s, b) => s + (b.quantity || 0), 0);
                        const isOutOfStock = totalAvailable === 0;
                        // selling_price arrives as a string (Decimal serialized by the API)
                        // despite the MedicineBatch type claiming number — Number() it here
                        // since unitPrice.toFixed() below needs a real number.
                        const unitPrice = Number(selectedBatch?.selling_price) || 0;
                        const lineTotal = item.quantity * unitPrice;

                        return (
                          <div
                            key={item.clientId}
                            className={`border-2 rounded-xl p-4 transition-all ${
                              isOutOfStock ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200 hover:border-emerald-300'
                            }`}
                          >
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-900 text-base truncate">{item.medicine_name}</span>
                                  <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-bold uppercase tracking-wide">
                                    Extra Item
                                  </span>
                                </div>
                                {item.generic_name && (
                                  <div className="text-xs text-slate-500 mt-0.5">Generic: {item.generic_name}</div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveExtraItem(item.clientId)}
                                className="text-slate-400 hover:text-red-600 p-1 shrink-0"
                                title="Remove"
                              >
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </div>

                            {/* Stock Status Alert */}
                            <div className={`mb-3 p-3 rounded-lg flex items-center justify-between gap-2 ${
                              isOutOfStock ? 'bg-red-100 text-red-700' : selectedBatch ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">
                                  {isOutOfStock ? 'error' : selectedBatch ? 'check_circle' : 'warning'}
                                </span>
                                <div className="text-sm">
                                  {isOutOfStock ? (
                                    <span className="font-semibold">❌ Out of Stock</span>
                                  ) : selectedBatch ? (
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                      <span><span className="font-semibold">Selected batch:</span> {selectedBatch.quantity} units</span>
                                      <span><span className="font-semibold">Total available:</span> {totalAvailable} units</span>
                                      {selectedBatch.expiry_date && (
                                        <span className="text-xs">Exp: {formatDateOnly(selectedBatch.expiry_date)}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-semibold">⚠️ No stock available</span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openAddBatchModal({
                                  kind: 'extra', clientId: item.clientId, medicineId: item.medicine_id, medicineName: item.medicine_name,
                                })}
                                className="shrink-0 text-[11px] font-semibold underline hover:no-underline flex items-center gap-0.5"
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add_circle</span>
                                Add Batch
                              </button>
                            </div>

                            {/* Batch split warning — same reasoning as the prescribed-item
                                card above: don't let the pharmacist believe this all comes
                                from the selected batch when the backend will actually pull
                                the shortfall from other (soonest-expiring) batches. */}
                            {selectedBatch && item.quantity > selectedBatch.quantity && (() => {
                              const allocations = previewBatchSplit(item.quantity, item.selectedBatchId, item.available_batches);
                              const extra = allocations.slice(1);
                              if (extra.length === 0) return null;
                              return (
                                <div className="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
                                  <div className="flex items-center gap-2 font-semibold mb-1">
                                    <span className="material-symbols-outlined text-lg">call_split</span>
                                    Selected batch only has {selectedBatch.quantity} — the rest will be pulled from other batches
                                  </div>
                                  <ul className="pl-6 list-disc space-y-0.5">
                                    <li>{allocations[0].qty} units from {allocations[0].batch.batch_number} (exp {formatDateOnly(allocations[0].batch.expiry_date)})</li>
                                    {extra.map(a => (
                                      <li key={a.batch.id}>{a.qty} units from {a.batch.batch_number} (exp {formatDateOnly(a.batch.expiry_date)})</li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })()}

                            {/* Batch + Quantity controls */}
                            {!isOutOfStock && (
                              <div className="grid grid-cols-2 gap-4 mb-3">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Select Batch</label>
                                  <select
                                    value={item.selectedBatchId || ''}
                                    onChange={(e) => handleExtraItemBatchChange(item.clientId, e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                                  >
                                    {item.available_batches.map((batch) => (
                                      <option key={batch.id} value={batch.id}>
                                        {batch.batch_number} | Exp: {formatDateOnly(batch.expiry_date)} | Stock: {batch.quantity}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5 flex justify-between items-center">
                                    <span>Dispense Quantity</span>
                                    {item.units_per_pack > 1 && (
                                      <span className="text-[10px] text-slate-400 font-normal normal-case">Pack size: {item.units_per_pack}</span>
                                    )}
                                  </label>
                                  <div className="flex gap-2">
                                    <input
                                      type="number"
                                      min="0"
                                      max={selectedBatch?.quantity || 0}
                                      value={item.quantity || ''} placeholder="0"
                                      onChange={(e) => handleExtraItemQuantityChange(item.clientId, parseInt(e.target.value) || 0)}
                                      className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all font-semibold"
                                    />
                                    {item.units_per_pack > 1 && (
                                      <div className="flex gap-1">
                                        {Math.floor((selectedBatch?.quantity || 0) / item.units_per_pack) > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const strips = Math.floor((selectedBatch?.quantity || 0) / item.units_per_pack);
                                              handleExtraItemQuantityChange(item.clientId, strips * item.units_per_pack);
                                            }}
                                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                                          >
                                            {Math.floor((selectedBatch?.quantity || 0) / item.units_per_pack)} Strips
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleExtraItemQuantityChange(item.clientId, selectedBatch?.quantity || 0)}
                                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                                        >
                                          All
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {item.units_per_pack > 1 && item.quantity > 0 && (
                                    <div className="text-[11px] text-emerald-800 mt-1.5 font-medium flex items-center gap-1 bg-emerald-50/50 rounded border border-emerald-100/50 px-2 py-0.5 w-fit">
                                      <span className="material-symbols-outlined text-[13px] text-emerald-600">inventory_2</span>
                                      <span>
                                        Dispensing: <span className="font-bold">{Math.floor(item.quantity / item.units_per_pack)} strips</span>
                                        {item.quantity % item.units_per_pack > 0 && (
                                          <> + <span className="font-bold">{item.quantity % item.units_per_pack} loose</span></>
                                        )}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Price breakdown — same visual style as prescribed items, minus
                                Dose/Day and Days Covered since an extra item has no prescribed
                                frequency/duration to measure coverage against. */}
                            {unitPrice > 0 && item.quantity > 0 && (
                              <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="text-center">
                                    <div className="text-[9px] text-blue-500 uppercase font-bold tracking-wide">Unit Price</div>
                                    <div className="text-sm font-bold text-blue-900 leading-tight">₹{unitPrice.toFixed(2)}</div>
                                    <div className="text-[9px] text-blue-400">per {item.dispense_unit}</div>
                                  </div>
                                  <div className="text-center border-l border-blue-100">
                                    <div className="text-[9px] text-blue-500 uppercase font-bold tracking-wide">Quantity</div>
                                    <div className="text-sm font-bold text-blue-900 leading-tight">{item.quantity}</div>
                                    <div className="text-[9px] text-blue-400">{item.dispense_unit}(s)</div>
                                  </div>
                                  <div className="text-center border-l border-blue-100">
                                    <div className="text-[9px] text-blue-500 uppercase font-bold tracking-wide">Line Total</div>
                                    <div className="text-sm font-bold text-emerald-700 leading-tight">₹{lineTotal.toFixed(2)}</div>
                                    <div className="text-[9px] text-blue-400">extra item</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Notes Section */}
            <div className="px-6 pb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Dispensing Notes <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this dispensing (e.g., patient counseling provided, special instructions)..."
                rows={2}
                readOnly={Boolean(isReadOnly)}
                className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
              />
            </div>

            {/* Footer - Summary & Actions */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-700">
                  <span>
                    Dispensing <strong className="text-emerald-600">{totals.itemsToDispense}</strong> of{' '}
                    <strong className="text-slate-900">{dispensingItems.length}</strong> items
                  </span>
                  {totals.itemsSkipped > 0 && (
                    <span className="ml-3 text-orange-600 flex items-center gap-1 inline-flex">
                      <span className="material-symbols-outlined text-sm">remove_circle</span>
                      {totals.itemsSkipped} skipped
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 uppercase font-semibold">Current Transaction</div>
                  <div className="text-2xl font-bold text-slate-900">₹{currentTransactionTotal.toFixed(2)}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Overall Dispensed: ₹{overallDispensedTotal.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/pharmacy/pending-prescriptions')}
                  disabled={saving}
                  className="flex-1 px-6 py-3 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {isReadOnly ? 'Back to Queue' : 'Cancel'}
                </button>
                {!isReadOnly && (
                  <button
                    onClick={handleDispense}
                    disabled={saving || !canSubmit}
                    className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200"
                  >
                    {saving ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-sm animate-spin">
                          progress_activity
                        </span>
                        Processing...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        {isSkipOnlySubmit ? 'Close & Record Skips' : 'Confirm Dispense'}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Batch Modal */}
      {addBatchTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setAddBatchTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600">add_box</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add Batch</h3>
                <p className="text-xs text-slate-500">New stock batch for <strong>{addBatchTarget.medicineName}</strong></p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Batch Number *</label>
                <input
                  value={addBatchForm.batch_number}
                  onChange={(e) => setAddBatchForm((prev) => ({ ...prev, batch_number: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Mfg Date</label>
                  <input
                    type="date"
                    value={addBatchForm.mfg_date}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setAddBatchForm((prev) => ({ ...prev, mfg_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    value={addBatchForm.expiry_date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setAddBatchForm((prev) => ({ ...prev, expiry_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Quantity *</label>
                <input
                  type="number"
                  min={1}
                  value={addBatchForm.quantity || ''} placeholder="0"
                  onChange={(e) => setAddBatchForm((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Purchase Price *</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={addBatchForm.purchase_price || ''} placeholder="0.00"
                    onChange={(e) => setAddBatchForm((prev) => ({ ...prev, purchase_price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Selling Price *</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={addBatchForm.selling_price || ''} placeholder="0.00"
                    onChange={(e) => setAddBatchForm((prev) => ({ ...prev, selling_price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setAddBatchTarget(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button
                onClick={handleCreateBatch}
                disabled={savingBatch}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
              >
                {savingBatch ? 'Adding...' : 'Add Batch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper component
const InfoRow: React.FC<{ icon: string; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3">
    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-sm">{icon}</span>
    </div>
    <div className="flex-1">
      <div className="text-xs text-slate-500 font-semibold uppercase">{label}</div>
      <div className="text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  </div>
);

export default DispensingScreen;
