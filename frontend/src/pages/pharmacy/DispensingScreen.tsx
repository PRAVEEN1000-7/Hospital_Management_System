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

  const role = user?.roles?.[0];
  const hasPharmacyAccess = ['pharmacist', 'admin', 'super_admin'].includes(role || '');

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
          const defaultDispenseQty = firstBatch ? Math.min(remainingQty, firstBatch.quantity || 0) : 0;
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
        };
      })
    );
  };

  // Update dispensed quantity with prescription limit validation
  const handleQuantityChange = (itemIndex: number, quantity: number) => {
    setDispensingItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIndex) return item;

        const maxQty = item.available_batches.find(
          (b) => b.id === item.selectedBatchId
        )?.quantity;
        
        // Ensure quantity doesn't exceed remaining prescribed quantity OR total available stock.
        const maxAllowed = Math.min(
          item.remainingQty,
          item.available_quantity || maxQty || 0
        );

        return {
          ...item,
          dispensedQty: Math.min(Math.max(0, quantity), maxAllowed),
        };
      })
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

  // Debounced medicine search for the "Add Item" control.
  useEffect(() => {
    if (!showExtraItemSearch || !extraItemSearch.trim()) {
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
                unit_price: Number(fallbackBatch?.selling_price || 0),
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
          unit_price: Number(batch.selling_price) || 0,
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

      showToast('success', result.message);

      // Navigate to billing page with dispensing details
      if (result.data && result.data.dispensing_id) {
        // Fetch full dispensing details for billing
        const dispensingDetails = await pharmacyService.getDispensingRecord(result.data.dispensing_id);
        
        // Navigate to billing page
        navigate(`/pharmacy/dispensing/${result.data.dispensing_id}/billing`, {
          state: {
            dispensingData: dispensingDetails,
          },
        });
      } else {
        // Fallback: navigate to pending prescriptions
        navigate('/pharmacy/pending-prescriptions');
      }
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
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800">Access Denied</h2>
          <p className="text-red-600 mt-2">Only pharmacists can access this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
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
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - Matches PrescriptionDetail layout */}
      <div className="flex justify-between items-start mb-6">
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
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/pharmacy/pending-prescriptions')}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back
          </button>
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
                    <div className="font-medium text-slate-900">{prescription.doctor_name}</div>
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

                    {/* Dispensing Controls */}
                    {!item.skip && !isOutOfStock && !item.is_dispensed && !isReadOnly && (
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        {/* Batch Selection */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
                            Select Batch
                          </label>
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
                              max={Math.min(item.available_quantity || 0, item.remainingQty)}
                              value={item.dispensedQty || ''}
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
                          {(() => {
                            const dailyDoseCount = getDailyDoseCount(item.frequency);
                            const unitPrice = selectedBatch?.selling_price || 0;
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
                        <button
                          onClick={() => handleSkipItem(index, false)}
                          className="text-sm text-emerald-600 hover:text-emerald-700 mt-2 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">undo</span>
                          Undo - Include this item
                        </button>
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
                          <p className="text-xs text-slate-500">₹{item.total_price.toFixed(2)}</p>
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
                        placeholder="Search medicine or pharmacy item by name..."
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
                          {extraItemResults.map((med) => (
                            <button
                              key={med.id}
                              type="button"
                              onClick={() => handleAddExtraItem(med)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex items-center justify-between gap-2"
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
                        const unitPrice = selectedBatch?.selling_price || 0;
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
                            <div className={`mb-3 p-3 rounded-lg flex items-center gap-2 ${
                              isOutOfStock ? 'bg-red-100 text-red-700' : selectedBatch ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
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
                                      value={item.quantity || ''}
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
