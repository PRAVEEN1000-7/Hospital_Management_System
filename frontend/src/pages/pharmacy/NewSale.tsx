import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { Medicine, MedicineBatch, SaleItemCreate, SaleCreateData } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';
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

const NewSale: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batchMap, setBatchMap] = useState<Record<string, MedicineBatch[]>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [patientName, setPatientName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [prescriptionNumber, setPrescriptionNumber] = useState('');
  const [prescriptionDate, setPrescriptionDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Load medicine, add selected medicine to cart
  const [selectedMedicine, setSelectedMedicine] = useState('');

  useEffect(() => {
    pharmacyService.getMedicines(1, 500).then(r => setMedicines(r.data)).catch(() => {});
  }, []);

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

  const grandTotal = subtotal + taxTotal - discountAmount;

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
        patient_name: patientName || undefined,
        doctor_name: doctorName || undefined,
        prescription_number: prescriptionNumber || undefined,
        prescription_date: prescriptionDate || undefined,
        payment_method: paymentMethod,
        discount_amount: discountAmount,
        notes: notes || undefined,
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
              <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Walk-in if blank"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Doctor</label>
              <input value={doctorName} onChange={e => setDoctorName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Payment Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="insurance">Insurance</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Prescription No.</label>
              <input value={prescriptionNumber} onChange={e => setPrescriptionNumber(e.target.value)}
                placeholder="Rx reference number"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Prescription Date</label>
              <input type="date" value={prescriptionDate} onChange={e => setPrescriptionDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
            </div>
          </div>
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
                      <input type="number" min={1} max={item.available_qty} value={item.quantity}
                        onChange={e => updateCartItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-500 mb-0.5">Price</label>
                      <input type="number" min={0} step={0.01} value={item.unit_price}
                        onChange={e => updateCartItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs text-slate-500 mb-0.5">Disc%</label>
                      <input type="number" min={0} max={100} value={item.discount_percent || 0}
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
                <input type="number" min={0} step={0.01} value={discountAmount}
                  onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
                <span>Grand Total</span>
                <span className="text-primary">₹{grandTotal.toFixed(2)}</span>
              </div>
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
