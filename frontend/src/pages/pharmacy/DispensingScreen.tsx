import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import pharmacyService, {
  type PendingPrescription,
  type PrescriptionItemWithStock,
  type DispenseItemData,
} from '../../services/pharmacyService';
import type { MedicineBatch } from '../../types/pharmacy';

interface DispensingItem extends PrescriptionItemWithStock {
  selectedBatchId?: string;
  dispensedQty: number;
  skip: boolean;
  skipReason?: string;
}

const DispensingScreen: React.FC = () => {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [prescription, setPrescription] = useState<PendingPrescription | null>(null);
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
        const rx = await pharmacyService.getPrescriptionForDispensing(prescriptionId);
        setPrescription(rx);

        // Initialize dispensing items
        const items: DispensingItem[] = rx.items.map((item) => ({
          ...item,
          selectedBatchId: item.available_batches[0]?.id,
          dispensedQty: item.quantity, // Default to prescribed quantity
          skip: false,
        }));
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
        // Adjust quantity if it exceeds batch stock
        const newQty = Math.min(item.dispensedQty, selectedBatch?.quantity || 0);

        return {
          ...item,
          selectedBatchId: batchId,
          dispensedQty: newQty,
        };
      })
    );
  };

  // Update dispensed quantity
  const handleQuantityChange = (itemIndex: number, quantity: number) => {
    setDispensingItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIndex) return item;

        const maxQty = item.available_batches.find(
          (b) => b.id === item.selectedBatchId
        )?.quantity;

        return {
          ...item,
          dispensedQty: Math.min(Math.max(0, quantity), maxQty || 0),
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
    let itemsPartial = 0;

    dispensingItems.forEach((item) => {
      if (item.skip) {
        itemsSkipped++;
        return;
      }

      const batch = item.available_batches.find((b) => b.id === item.selectedBatchId);
      const price = batch?.selling_price || 0;

      subtotal += item.dispensedQty * price;
      itemsToDispense++;

      if (item.dispensedQty < item.quantity) {
        itemsPartial++;
      }
    });

    return { subtotal, itemsToDispense, itemsSkipped, itemsPartial };
  };

  const totals = calculateTotals();

  // Handle dispensing submission
  const handleDispense = async () => {
    if (totals.itemsToDispense === 0) {
      showToast('error', 'At least one item must be dispensed');
      return;
    }

    if (!prescription) return;

    setSaving(true);
    try {
      // Prepare items for dispensing
      const itemsToDispense: DispenseItemData[] = [];

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

      if (itemsToDispense.length === 0) {
        showToast('error', 'No valid items to dispense');
        setSaving(false);
        return;
      }

      // Call dispensing API
      const result = await pharmacyService.dispensePrescription(
        prescriptionId!,
        itemsToDispense,
        notes || undefined
      );

      showToast('success', result.message);

      // Navigate based on status
      if (result.data.status === 'dispensed') {
        // Fully dispensed - show success and navigate
        navigate('/pharmacy/pending-prescriptions', {
          state: { dispensingComplete: true, dispensingNumber: result.data.dispensing_number },
        });
      } else {
        // Partially dispensed - stay on page or go back
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/pharmacy/pending-prescriptions')}
          className="text-slate-400 hover:text-slate-600"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dispensing</h1>
          <p className="text-sm text-slate-500">{prescription.prescription_number}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Patient & Prescription Info */}
        <div className="lg:col-span-1 space-y-4">
          {/* Patient Info Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
              Patient Information
            </h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-500">Name:</span>
                <span className="ml-2 font-medium text-slate-900">
                  {prescription.patient_name}
                </span>
              </div>
              {prescription.patient_reference_number && (
                <div>
                  <span className="text-slate-500">Patient ID:</span>
                  <span className="ml-2 text-slate-900">
                    {prescription.patient_reference_number}
                  </span>
                </div>
              )}
              {prescription.patient_age && (
                <div>
                  <span className="text-slate-500">Age/Sex:</span>
                  <span className="ml-2 text-slate-900">
                    {prescription.patient_age}y / {prescription.patient_gender}
                  </span>
                </div>
              )}
              {prescription.patient_phone && (
                <div>
                  <span className="text-slate-500">Phone:</span>
                  <span className="ml-2 text-slate-900">{prescription.patient_phone}</span>
                </div>
              )}
              {prescription.patient_blood_group && (
                <div>
                  <span className="text-slate-500">Blood Group:</span>
                  <span className="ml-2 font-medium text-red-600">
                    {prescription.patient_blood_group}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Prescription Info Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
              Prescription Details
            </h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-500">Doctor:</span>
                <div className="ml-2 font-medium text-slate-900">
                  Dr. {prescription.doctor_name}
                </div>
                {prescription.doctor_specialization && (
                  <div className="ml-2 text-slate-500 text-xs">
                    {prescription.doctor_specialization}
                  </div>
                )}
              </div>
              <div>
                <span className="text-slate-500">Date:</span>
                <span className="ml-2 text-slate-900">
                  {new Date(prescription.created_at).toLocaleString()}
                </span>
              </div>
              {prescription.diagnosis && (
                <div>
                  <span className="text-slate-500">Diagnosis:</span>
                  <div className="ml-2 text-slate-900">{prescription.diagnosis}</div>
                </div>
              )}
              {prescription.clinical_notes && (
                <div>
                  <span className="text-slate-500">Notes:</span>
                  <div className="ml-2 text-slate-900 text-xs">
                    {prescription.clinical_notes}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Vitals Card (if available) */}
          {(prescription.vitals_bp || prescription.vitals_pulse || prescription.vitals_weight) && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
                Vitals
              </h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {prescription.vitals_bp && (
                  <div>
                    <span className="text-slate-500">BP:</span>
                    <span className="ml-2 text-slate-900">{prescription.vitals_bp}</span>
                  </div>
                )}
                {prescription.vitals_pulse && (
                  <div>
                    <span className="text-slate-500">Pulse:</span>
                    <span className="ml-2 text-slate-900">{prescription.vitals_pulse}</span>
                  </div>
                )}
                {prescription.vitals_temp && (
                  <div>
                    <span className="text-slate-500">Temp:</span>
                    <span className="ml-2 text-slate-900">{prescription.vitals_temp}</span>
                  </div>
                )}
                {prescription.vitals_weight && (
                  <div>
                    <span className="text-slate-500">Weight:</span>
                    <span className="ml-2 text-slate-900">{prescription.vitals_weight}</span>
                  </div>
                )}
                {prescription.vitals_spo2 && (
                  <div>
                    <span className="text-slate-500">SpO2:</span>
                    <span className="ml-2 text-slate-900">{prescription.vitals_spo2}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Medicines to Dispense */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Medicines to Dispense
            </h2>

            <div className="space-y-4">
              {dispensingItems.map((item, index) => {
                const selectedBatch = item.available_batches.find(
                  (b) => b.id === item.selectedBatchId
                );
                const isPartial = item.dispensedQty < item.quantity;
                const isOutOfStock = item.available_quantity === 0;

                return (
                  <div
                    key={item.id}
                    className={`border rounded-lg p-4 ${
                      item.skip
                        ? 'bg-slate-50 border-slate-200'
                        : isOutOfStock
                        ? 'bg-red-50 border-red-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Medicine Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">
                          {item.medicine_name}
                        </div>
                        {item.generic_name && (
                          <div className="text-sm text-slate-500">
                            Generic: {item.generic_name}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 mt-1">
                          Dosage: {item.dosage} | Frequency: {item.frequency}
                          {item.duration_value && (
                            <span> | Duration: {item.duration_value} {item.duration_unit}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-500">Prescribed</div>
                        <div className="text-lg font-semibold text-slate-900">
                          {item.quantity}
                        </div>
                      </div>
                    </div>

                    {/* Stock Status */}
                    {!item.skip && (
                      <div className="mb-3">
                        {isOutOfStock ? (
                          <div className="flex items-center gap-2 text-red-600 text-sm">
                            <span className="material-symbols-outlined text-base">
                              error
                            </span>
                            <span>❌ Out of Stock</span>
                          </div>
                        ) : selectedBatch ? (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="material-symbols-outlined text-green-600">
                              check_circle
                            </span>
                            <span className="text-slate-600">
                              Available: {selectedBatch.quantity} units
                            </span>
                            {selectedBatch.expiry_date && (
                              <span className="text-slate-400 text-xs">
                                | Exp: {new Date(selectedBatch.expiry_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Dispensing Controls */}
                    {!item.skip && !isOutOfStock && (
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {/* Batch Selection */}
                        <div>
                          <label className="block text-xs font-medium text-slate-500 uppercase mb-1">
                            Select Batch
                          </label>
                          <select
                            value={item.selectedBatchId || ''}
                            onChange={(e) => handleBatchChange(index, e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
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
                          <label className="block text-xs font-medium text-slate-500 uppercase mb-1">
                            Dispense Qty
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={selectedBatch?.quantity || 0}
                            value={item.dispensedQty}
                            onChange={(e) =>
                              handleQuantityChange(index, parseInt(e.target.value) || 0)
                            }
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
                          />
                          {isPartial && (
                            <div className="text-xs text-orange-600 mt-1">
                              ⚠️ Partial: {item.quantity - item.dispensedQty} units short
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Skip Item */}
                    {!item.skip && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSkipItem(index, true)}
                          className="text-sm text-slate-500 hover:text-red-600 transition-colors"
                        >
                          Skip this item
                        </button>
                        {item.allow_substitution && (
                          <span className="text-xs text-slate-400 ml-2">
                            | ☑ Substitution allowed
                          </span>
                        )}
                      </div>
                    )}

                    {/* Skip Reason (when skipped) */}
                    {item.skip && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">
                          Skip Reason
                        </label>
                        <select
                          value={item.skipReason || ''}
                          onChange={(e) => handleSkipReasonChange(index, e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
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
                          className="text-sm text-primary hover:text-primary/90 mt-2"
                        >
                          Undo - Include this item
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Notes */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Dispensing Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this dispensing..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
              />
            </div>

            {/* Summary & Actions */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-600">
                  <span>
                    Dispensing <strong className="text-slate-900">{totals.itemsToDispense}</strong> of{' '}
                    <strong className="text-slate-900">{dispensingItems.length}</strong> items
                  </span>
                  {totals.itemsSkipped > 0 && (
                    <span className="ml-3 text-orange-600">
                      | {totals.itemsSkipped} skipped
                    </span>
                  )}
                  {totals.itemsPartial > 0 && (
                    <span className="ml-3 text-orange-600">
                      | {totals.itemsPartial} partial
                    </span>
                  )}
                </div>
                <div className="text-xl font-bold text-slate-900">
                  Total: ₹{totals.subtotal.toFixed(2)}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/pharmacy/pending-prescriptions')}
                  disabled={saving}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDispense}
                  disabled={saving || totals.itemsToDispense === 0}
                  className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-sm animate-spin">
                        progress_activity
                      </span>
                      Processing...
                    </span>
                  ) : (
                    `Dispense ${
                      totals.itemsPartial > 0
                        ? `(${totals.itemsPartial} partial)`
                        : ''
                    }`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DispensingScreen;
