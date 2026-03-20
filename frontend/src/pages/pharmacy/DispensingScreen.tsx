import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import pharmacyService, {
  type PendingPrescription,
  type PrescriptionItemWithStock,
  type DispenseItemData,
} from '../../services/pharmacyService';
import type { MedicineBatch } from '../../types/pharmacy';

interface DispensingPrescriptionItem extends PrescriptionItemWithStock {
  duration_value?: number;
  duration_unit?: string;
}

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
          const hasStock = item.available_batches && item.available_batches.length > 0;
          const isOutOfStock = item.available_quantity === 0;
          const firstBatch = hasStock ? item.available_batches[0] : undefined;
          const defaultDispenseQty = firstBatch ? Math.min(remainingQty, firstBatch.quantity || 0) : 0;
          const isAlreadyFulfilled = item.is_dispensed || remainingQty <= 0;
          
          return {
            ...item,
            quantity: prescribedQuantity,
            prescribedQty: prescribedQuantity,
            remainingQty,
            selectedBatchId: firstBatch?.id,
            dispensedQty: hasStock ? defaultDispenseQty : 0,
            skip: isAlreadyFulfilled || !hasStock || isOutOfStock,
            skipReason: isAlreadyFulfilled
              ? 'already_dispensed'
              : (!hasStock || isOutOfStock ? 'out_of_stock' : undefined),
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

  // Calculate totals
  const calculateTotals = () => {
    let subtotal = 0;
    let itemsToDispense = 0;
    let itemsSkipped = 0;

    dispensingItems.forEach((item) => {
      if (item.skip) {
        itemsSkipped++;
        return;
      }

      if (item.dispensedQty <= 0) {
        return;
      }

      const batch = item.available_batches.find((b) => b.id === item.selectedBatchId);
      const price = batch?.selling_price || 0;

      subtotal += item.dispensedQty * price;
      itemsToDispense++;
    });

    return { subtotal, itemsToDispense, itemsSkipped };
  };

  const totals = calculateTotals();
  const isReadOnly = searchParams.get('mode') === 'view' || prescription?.status === 'dispensed';
  const canSubmit =
    totals.itemsToDispense > 0 ||
    dispensingItems.every((item) => item.skip || item.is_dispensed || item.remainingQty <= 0);

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

    if (!prescription) return;

    setSaving(true);
    try {
      // Prepare items for dispensing
      const itemsToDispense: DispenseItemData[] = [];

      const skipSummary = dispensingItems
        .filter((item) => item.skip && !item.is_dispensed)
        .map((item) => `${item.medicine_name}: ${item.skipReason || 'skipped'}`)
        .join('; ');
      const combinedNotes = [
        skipSummary ? `Skipped items: ${skipSummary}` : '',
        notes,
      ].filter(Boolean).join(' | ');

      dispensingItems.forEach((item) => {
        if (item.skip || item.dispensedQty <= 0) return;

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

      // All-skipped case: record inability to dispense and mark prescription closed
      if (itemsToDispense.length === 0 && allSkipped) {
        const allSkippedNotes = [
          'Unable to dispense - all items skipped.',
          combinedNotes,
        ].filter(Boolean).join(' | ');
        await pharmacyService.dispensePrescription(prescriptionId!, [], allSkippedNotes);
        showToast('success', 'Prescription closed — all items skipped and recorded.');
        navigate('/pharmacy/pending-prescriptions');
        return;
      }

      // Call dispensing API
      const result = await pharmacyService.dispensePrescription(
        prescriptionId!,
        itemsToDispense,
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
    partially_dispensed: 'bg-orange-100 text-orange-700 border-orange-300',
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
              {prescription.status.replace('_', ' ')}
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
                    <div className="font-medium text-slate-900">Dr. {prescription.doctor_name}</div>
                    {prescription.doctor_specialization && (
                      <div className="text-xs text-slate-500">{prescription.doctor_specialization}</div>
                    )}
                  </div>
                } 
              />
              <InfoRow 
                icon="event" 
                label="Date" 
                value={new Date(prescription.created_at).toLocaleString()} 
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
                {prescription.clinical_notes && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Clinical Notes</div>
                    <div className="text-sm text-slate-900">{prescription.clinical_notes}</div>
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
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-900 text-lg">
                            {item.medicine_name}
                          </span>
                          {item.is_dispensed && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                              Already Dispensed
                            </span>
                          )}
                        </div>
                        {item.generic_name && (
                          <div className="text-sm text-slate-500">
                            Generic: {item.generic_name}
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">medication</span>
                            Dosage: {item.dosage}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            {item.frequency}
                          </span>
                          {item.duration_value && (
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">today</span>
                              {item.duration_value} {item.duration_unit}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Prescribed Quantity Badge */}
                      <div className="text-right bg-slate-100 rounded-lg px-3 py-2">
                        <div className="text-xs text-slate-500 uppercase font-semibold">Prescribed</div>
                        <div className="text-xl font-bold text-slate-900">{prescribedQuantity}</div>
                        <div className="text-xs text-slate-500">units</div>
                        <div className="text-xs text-slate-500 mt-0.5">Remaining: {item.remainingQty}</div>
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
                                  Exp: {new Date(selectedBatch.expiry_date).toLocaleDateString()}
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
                                {batch.batch_number} | Exp: {new Date(batch.expiry_date).toLocaleDateString()} | Stock: {batch.quantity}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Quantity Input */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
                            Dispense Quantity
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={Math.min(item.available_quantity || 0, item.remainingQty)}
                            value={item.dispensedQty}
                            onChange={(e) =>
                              handleQuantityChange(index, parseInt(e.target.value) || 0)
                            }
                            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all font-semibold"
                          />
                          {selectedBatch && item.dispensedQty > (selectedBatch.quantity || 0) && (
                            <div className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">sync_alt</span>
                              Remaining quantity will be auto-allocated from additional batches in this dispense.
                            </div>
                          )}
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
                  <div className="text-xs text-slate-500 uppercase font-semibold">Total Amount</div>
                  <div className="text-2xl font-bold text-slate-900">₹{totals.subtotal.toFixed(2)}</div>
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
                        Confirm Dispense
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
