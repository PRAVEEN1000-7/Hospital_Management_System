import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import { patientService } from '../../services/patientService';
import prescriptionService from '../../services/prescriptionService';
import type { Medicine, MedicineBatch, SaleItemCreate, SaleCreateData } from '../../types/pharmacy';
import type { Patient } from '../../types/patient';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';

interface CartItem extends SaleItemCreate {
  medicine_name: string;
  available_qty: number;
  batch_number?: string;
  mfg_date?: string;
  expiry_date?: string;
  mrp?: number;
  supplier_name?: string;
}

// Mirrors DispensingScreen.tsx's calculation — some older prescription items
// only carry frequency + duration (no flat quantity), so the real prescribed
// count must be derived the same way here to know what's left to sell/dispense.
const calculatePrescribedQuantity = (item: {
  frequency?: string | null;
  duration_value?: number | null;
  duration_unit?: string | null;
  quantity?: number | null;
}) => {
  if (typeof item.quantity === 'number' && item.quantity > 0) return item.quantity;
  if (!item.frequency || !item.duration_value || item.duration_value <= 0) return 0;

  const frequencyParts = item.frequency.match(/\d+(?:\.\d+)?/g);
  if (!frequencyParts?.length) return 0;

  const dailyUnits = frequencyParts.reduce((total, part) => total + Number(part), 0);
  if (dailyUnits <= 0) return 0;

  const normalizedUnit = (item.duration_unit || 'days').toLowerCase();
  let durationDays = item.duration_value;
  if (normalizedUnit === 'weeks') durationDays *= 7;
  if (normalizedUnit === 'months') durationDays *= 30;

  return Math.ceil(dailyUnits * durationDays);
};

const NewSale: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { isEyeHospitalFeatureEnabled } = useAuth();

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batchMap, setBatchMap] = useState<Record<string, MedicineBatch[]>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [patientName, setPatientName] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientDrop, setShowPatientDrop] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [prescriptionNumber, setPrescriptionNumber] = useState('');
  const [prescriptionDate, setPrescriptionDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [amountTendered, setAmountTendered] = useState(0);
  const [consultationFee, setConsultationFee] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [rxLookupStatus, setRxLookupStatus] = useState<'idle' | 'loading' | 'found' | 'not_found'>('idle');
  const [linkedPrescriptionId, setLinkedPrescriptionId] = useState<string | null>(null);

  // Load medicine, add selected medicine to cart
  const [selectedMedicine, setSelectedMedicine] = useState('');

  useEffect(() => {
    pharmacyService.getMedicines(1, 500).then(r => setMedicines(r.data)).catch(() => {});
  }, []);

  // Search existing patients by name/phone/reference number (debounced).
  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 2) { setPatientResults([]); return; }
    try {
      const res = await patientService.getPatients(1, 6, q);
      setPatientResults(res.data);
    } catch { setPatientResults([]); }
  }, []);

  useEffect(() => {
    if (selectedPatient) return;
    const t = setTimeout(() => searchPatients(patientName), 280);
    return () => clearTimeout(t);
  }, [patientName, selectedPatient, searchPatients]);

  const selectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setPatientName(`${p.first_name} ${p.last_name}`.trim());
    setPatientResults([]);
    setShowPatientDrop(false);
  };

  const clearSelectedPatient = () => {
    setSelectedPatient(null);
    setPatientName('');
    setPatientResults([]);
  };

  const loadBatches = async (medicineId: string) => {
    if (batchMap[medicineId]) return batchMap[medicineId];
    try {
      const batches = await pharmacyService.getBatches(medicineId);
      setBatchMap(prev => ({ ...prev, [medicineId]: batches }));
      return batches;
    } catch {
      return [];
    }
  };

  // Look up an existing patient's old prescription by number (debounced) and
  // auto-fill patient/doctor/date, plus pre-load its still-owed items into the cart.
  useEffect(() => {
    const number = prescriptionNumber.trim();
    if (number.length < 3) {
      setRxLookupStatus('idle');
      setLinkedPrescriptionId(null);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      setRxLookupStatus('loading');
      try {
        const res = await prescriptionService.getPrescriptions(1, 5, { search: number });
        const match = res.data.find(rx => rx.prescription_number.toLowerCase() === number.toLowerCase());
        if (!match) {
          if (!cancelled) { setRxLookupStatus('not_found'); setLinkedPrescriptionId(null); }
          return;
        }
        if (match.id === linkedPrescriptionId) {
          if (!cancelled) setRxLookupStatus('found');
          return;
        }

        const rx = await prescriptionService.getPrescription(match.id);
        if (cancelled) return;

        setLinkedPrescriptionId(rx.id);
        setRxLookupStatus('found');
        setDoctorName(rx.doctor_name || '');
        setPrescriptionDate(rx.created_at ? rx.created_at.slice(0, 10) : '');

        if (rx.patient_id) {
          try {
            const patient = await patientService.getPatient(rx.patient_id);
            if (!cancelled) selectPatient(patient);
          } catch { /* patient lookup is best-effort */ }
        }

        if (cart.length === 0) {
          const newItems: CartItem[] = [];
          for (const item of rx.items) {
            if (!item.medicine_id || item.is_dispensed) continue;
            const prescribedQty = calculatePrescribedQuantity(item);
            const remainingQty = Math.max(0, prescribedQty - (item.dispensed_quantity || 0));
            if (remainingQty <= 0) continue;

            const med = medicines.find(m => m.id === item.medicine_id);
            const batches = await loadBatches(item.medicine_id);
            const validBatches = batches.filter(b => b.quantity > 0 && new Date(b.expiry_date) > new Date());
            const batch = validBatches[0];

            newItems.push({
              medicine_id: item.medicine_id,
              medicine_name: med ? `${med.name} ${med.strength || ''}`.trim() : item.medicine_name,
              batch_id: batch?.id,
              quantity: batch ? Math.min(remainingQty, batch.quantity) : remainingQty,
              unit_price: batch?.selling_price || 0,
              discount_percent: 0,
              tax_percent: batch?.tax_percent || 0,
              dosage_instructions: [item.dosage, item.frequency].filter(Boolean).join(' - ') || undefined,
              duration_days: item.duration_value || undefined,
              available_qty: batch?.quantity || 0,
              batch_number: batch?.batch_number,
              mfg_date: batch?.mfg_date || undefined,
              expiry_date: batch?.expiry_date,
              mrp: batch?.mrp ?? undefined,
              supplier_name: batch?.supplier_name || undefined,
            });
          }
          if (newItems.length > 0 && !cancelled) {
            setCart(prev => [...prev, ...newItems]);
            toast.success(`Loaded ${newItems.length} item(s) from prescription ${rx.prescription_number}`);
          }
        }
      } catch {
        if (!cancelled) { setRxLookupStatus('not_found'); setLinkedPrescriptionId(null); }
      }
    }, 500);

    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescriptionNumber]);

  const addToCart = async () => {
    if (!selectedMedicine) return;
    const med = medicines.find(m => m.id === selectedMedicine);
    if (!med) return;

    const batches = await loadBatches(selectedMedicine);
    const validBatches = batches.filter(b => b.quantity > 0 && new Date(b.expiry_date) > new Date());
    const batch = validBatches[0];

    setCart(prev => [...prev, {
      medicine_id: med.id,
      medicine_name: `${med.name} ${med.strength || ''}`.trim(),
      batch_id: batch?.id,
      quantity: 1,
      unit_price: batch?.selling_price || 0,
      discount_percent: 0,
      tax_percent: batch?.tax_percent || 0,
      available_qty: batch?.quantity || 0,
      batch_number: batch?.batch_number,
      mfg_date: batch?.mfg_date || undefined,
      expiry_date: batch?.expiry_date,
      mrp: batch?.mrp ?? undefined,
      supplier_name: batch?.supplier_name || undefined,
    }]);
    setSelectedMedicine('');
  };

  const updateCartItem = (idx: number, field: string, value: string | number) => {
    setCart(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      // If batch changes, update price and available qty
      if (field === 'batch_id') {
        const batches = batchMap[it.medicine_id] || [];
        const newBatch = batches.find(b => b.id === value);
        if (newBatch) {
          updated.unit_price = newBatch.selling_price;
          updated.available_qty = newBatch.quantity;
          updated.tax_percent = newBatch.tax_percent;
          updated.batch_number = newBatch.batch_number;
          updated.mfg_date = newBatch.mfg_date || undefined;
          updated.expiry_date = newBatch.expiry_date;
          updated.mrp = newBatch.mrp ?? undefined;
          updated.supplier_name = newBatch.supplier_name || undefined;
        }
      }
      return updated;
    }));
  };

  const removeCartItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  const subtotal = cart.reduce((s, it) => {
    const base = it.quantity * it.unit_price;
    const disc = base * (it.discount_percent || 0) / 100;
    return s + (base - disc);
  }, 0);

  const taxTotal = cart.reduce((s, it) => {
    const base = it.quantity * it.unit_price;
    const disc = base * (it.discount_percent || 0) / 100;
    const afterDisc = base - disc;
    return s + afterDisc * (it.tax_percent || 0) / 100;
  }, 0);

  const grandTotal = subtotal + taxTotal - discountAmount + (isEyeHospitalFeatureEnabled ? consultationFee : 0);
  // Positive = change to hand back to the patient; negative = still owed.
  const changeOrDue = amountTendered - grandTotal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) { toast.error('Add at least one item'); return; }

    for (const item of cart) {
      if (item.quantity > item.available_qty) {
        toast.error(`Insufficient stock for ${item.medicine_name}`);
        return;
      }
    }

    setSaving(true);
    try {
      await pharmacyService.createSale({
        patient_id: selectedPatient?.id || undefined,
        patient_name: patientName || undefined,
        doctor_name: doctorName || undefined,
        prescription_number: prescriptionNumber || undefined,
        prescription_date: prescriptionDate || undefined,
        discount_amount: discountAmount,
        notes: notes || undefined,
        ...(isEyeHospitalFeatureEnabled
          ? { payment_method: paymentMethod, amount_tendered: amountTendered, consultation_fee: consultationFee }
          : {}),
        items: cart.map(({ medicine_id, batch_id, quantity, unit_price, discount_percent, tax_percent, dosage_instructions, duration_days }) => ({
          medicine_id, batch_id: batch_id || undefined, quantity, unit_price,
          discount_percent: discount_percent || undefined, tax_percent: tax_percent || undefined,
          dosage_instructions: dosage_instructions || undefined,
          duration_days: duration_days || undefined,
        })),
      });
      toast.success('Sale completed');
      navigate('/pharmacy/sales');
    } catch {
      toast.error('Failed to complete sale');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-screen-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-2xl font-bold text-slate-900">New Sale</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Patient Info */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Patient Name</label>
              {selectedPatient ? (
                <div className="flex items-center justify-between px-3 py-2 border border-primary/30 bg-primary/5 rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {selectedPatient.first_name} {selectedPatient.last_name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {selectedPatient.patient_reference_number} · {selectedPatient.phone_number}
                    </p>
                  </div>
                  <button type="button" onClick={clearSelectedPatient}
                    className="text-xs text-slate-400 hover:text-red-500 font-medium ml-2 shrink-0">
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input value={patientName}
                    onChange={e => { setPatientName(e.target.value); setShowPatientDrop(true); }}
                    onFocus={() => setShowPatientDrop(true)}
                    onBlur={() => setTimeout(() => setShowPatientDrop(false), 150)}
                    placeholder="Search existing patient or type walk-in name"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                  {showPatientDrop && patientResults.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {patientResults.map(p => (
                        <button key={p.id} type="button" onMouseDown={() => selectPatient(p)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm">
                          <span className="font-medium">{p.first_name} {p.last_name}</span>
                          <span className="ml-2 text-slate-400 text-xs">{p.patient_reference_number} · {p.phone_number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Doctor</label>
              <input value={doctorName} onChange={e => setDoctorName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
            {isEyeHospitalFeatureEnabled && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="insurance">Insurance</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Prescription No.</label>
              <input value={prescriptionNumber} onChange={e => setPrescriptionNumber(e.target.value)}
                placeholder="Enter old Rx number to auto-fill patient & items"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              {rxLookupStatus === 'loading' && (
                <p className="text-[11px] text-slate-400 mt-1">Looking up prescription…</p>
              )}
              {rxLookupStatus === 'found' && (
                <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">check_circle</span>
                  Prescription found — patient, doctor & items loaded
                </p>
              )}
              {rxLookupStatus === 'not_found' && (
                <p className="text-[11px] text-amber-600 mt-1">No matching prescription — will be saved as a reference note only.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Prescription Date</label>
              <input type="date" value={prescriptionDate} onChange={e => setPrescriptionDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
          </div>
          {isEyeHospitalFeatureEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Consultation Fee</label>
                <input type="number" min={0} step={0.01} value={consultationFee || ''}
                  onChange={e => setConsultationFee(parseFloat(e.target.value) || 0)}
                  placeholder="Flows to bill as first line item"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              </div>
            </div>
          )}
        </div>

        {/* Add Item */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Items</h2>

          <div className="flex gap-2">
            <select value={selectedMedicine} onChange={e => setSelectedMedicine(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
              <option value="">Select medicine to add...</option>
              {medicines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.strength ? `(${m.strength})` : ''} — Stock: {m.total_stock ?? 'N/A'}
                </option>
              ))}
            </select>
            <button type="button" onClick={addToCart} disabled={!selectedMedicine}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
              Add
            </button>
          </div>

          {cart.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No items added yet</p>
          ) : (
            <div className="space-y-2">
              {cart.map((item, idx) => {
                const batches = (batchMap[item.medicine_id] || []).filter(b => b.quantity > 0);
                const lineTotal = item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100);
                return (
                  <div key={idx} className="p-3 bg-slate-50 rounded-lg space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <label className="block text-xs text-slate-500 mb-0.5">Medicine</label>
                      <p className="text-sm font-medium text-slate-900 truncate">{item.medicine_name}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-500 mb-0.5">Batch</label>
                      <select value={item.batch_id || ''} onChange={e => updateCartItem(idx, 'batch_id', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
                        <option value="">Auto</option>
                        {batches.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.batch_number} (Exp: {format(new Date(b.expiry_date), 'MMM yy')}, Qty: {b.quantity})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs text-slate-500 mb-0.5">Qty</label>
                      <input type="number" min={1} max={item.available_qty} value={item.quantity || ''}
                        onChange={e => updateCartItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-500 mb-0.5">Price</label>
                      <input type="number" min={0} step={0.01} value={item.unit_price || ''}
                        onChange={e => updateCartItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs text-slate-500 mb-0.5">Disc%</label>
                      <input type="number" min={0} max={100} value={item.discount_percent || ''}
                        onChange={e => updateCartItem(idx, 'discount_percent', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                    </div>
                    <div className="col-span-2 text-right">
                      <label className="block text-xs text-slate-500 mb-0.5">Line Total</label>
                      <p className="text-sm font-medium text-slate-900">₹{lineTotal.toFixed(2)}</p>
                    </div>
                    <div className="col-span-1 text-right">
                      <button type="button" onClick={() => removeCartItem(idx)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded">
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                    </div>
                    </div>
                    {/* Prescription Details Row */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 border-t border-slate-200 pt-2">
                      {item.batch_number && <span><strong className="text-slate-600">Batch:</strong> {item.batch_number}</span>}
                      {item.mfg_date && <span><strong className="text-slate-600">Mfg:</strong> {format(new Date(item.mfg_date), 'dd MMM yyyy')}</span>}
                      {item.expiry_date && <span><strong className="text-slate-600">Exp:</strong> {format(new Date(item.expiry_date), 'dd MMM yyyy')}</span>}
                      {item.mrp != null && <span><strong className="text-slate-600">MRP:</strong> ₹{Number(item.mrp).toFixed(2)}</span>}
                      {item.supplier_name && <span><strong className="text-slate-600">Supplier:</strong> {item.supplier_name}</span>}
                    </div>
                    {/* Dosage Row */}
                    <div className="grid grid-cols-12 gap-2 items-end border-t border-slate-200 pt-2">
                      <div className="col-span-8">
                        <label className="block text-xs text-slate-500 mb-0.5">Dosage Instructions</label>
                        <input value={item.dosage_instructions || ''} placeholder="e.g. 1 tab twice daily after meals"
                          onChange={e => updateCartItem(idx, 'dosage_instructions', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                      </div>
                      <div className="col-span-4">
                        <label className="block text-xs text-slate-500 mb-0.5">Duration (Days)</label>
                        <input type="number" min={1} value={item.duration_days || ''} placeholder="e.g. 7"
                          onChange={e => updateCartItem(idx, 'duration_days', parseInt(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary resize-none" />
            </div>
            <div className="space-y-2 text-right">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-700">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Tax</span>
                <span className="font-medium text-slate-700">₹{taxTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-slate-500">Discount</span>
                <input type="number" min={0} step={0.01} value={discountAmount || ''}
                  onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              </div>
              {isEyeHospitalFeatureEnabled && consultationFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Consultation Fee</span>
                  <span className="font-medium text-slate-700">₹{consultationFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
                <span>Grand Total</span>
                <span className="text-primary">₹{grandTotal.toFixed(2)}</span>
              </div>
              {isEyeHospitalFeatureEnabled && (
                <>
                  <div className="flex justify-between text-sm items-center pt-2 border-t border-slate-200">
                    <span className="text-slate-500">{paymentMethod === 'cash' ? 'Cash' : paymentMethod === 'upi' ? 'UPI' : paymentMethod === 'bank_transfer' ? 'Bank Transfer' : 'Amount'} Received</span>
                    <input type="number" min={0} step={0.01} value={amountTendered || ''}
                      onChange={e => setAmountTendered(parseFloat(e.target.value) || 0)}
                      className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span className={changeOrDue >= 0 ? 'text-slate-500' : 'text-red-500'}>{changeOrDue >= 0 ? 'Balance Returned' : 'Amount Due'}</span>
                    <span className={changeOrDue >= 0 ? 'text-emerald-600' : 'text-red-600'}>₹{Math.abs(changeOrDue).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving || cart.length === 0}
            className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Processing...' : 'Complete Sale'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewSale;
