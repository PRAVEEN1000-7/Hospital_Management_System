import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import patientService from '../../services/patientService';
import type { OpticalProduct, OpticalBatch, OpticalSaleItemCreate, OpticalPrescription } from '../../types/optical';
import type { Patient } from '../../types/patient';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import SearchableSelect, { type SuggestionOption } from '../../components/common/SearchableSelect';

const RX_REQUIRED_CATEGORIES = ['lens', 'contact_lens'];

// Renders a 0 amount/percent field as an empty box with a "0" placeholder
// hint instead of a literal "0" value — so clicking in starts from blank
// rather than requiring the user to delete a leading zero first.
const zeroAsEmpty = (n: number): number | string => (n === 0 ? '' : n);

interface CartItem extends OpticalSaleItemCreate {
  product_name: string;
  category: string;
  available_qty: number;
  batch_number?: string;
  expiry_date?: string | null;
}

const NewOpticalSale: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const [products, setProducts] = useState<OpticalProduct[]>([]);
  const [batchMap, setBatchMap] = useState<Record<string, OpticalBatch[]>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [productLabel, setProductLabel] = useState('');
  const productSuggestions: SuggestionOption[] = products.map(p => ({
    id: p.id,
    label: `${p.name}${p.brand ? ` (${p.brand})` : ''}`,
    sublabel: `Stock: ${p.total_stock ?? 'N/A'}`,
    metadata: { id: p.id },
  }));
  const handleProductSelect = (value: string, metadata?: Record<string, unknown>) => {
    setProductLabel(value);
    setSelectedProduct(metadata?.id ? (metadata.id as string) : '');
  };

  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientId, setPatientId] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  // Lets the dropdown open on focus, before any typing — otherwise the only
  // way to pick a patient is to already know something to search for.
  const [patientFocused, setPatientFocused] = useState(false);
  const selectPatient = (p: Patient) => { setPatientId(p.id); setSelectedPatient(p); setPatientSearch(''); setPatientFocused(false); };
  const patientNav = useListKeyboardNav(patients, selectPatient);

  const [prescriptions, setPrescriptions] = useState<OpticalPrescription[]>([]);
  const [prescriptionId, setPrescriptionId] = useState('');

  const [discountAmount, setDiscountAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [amountTendered, setAmountTendered] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    opticalService.getProducts(1, 500).then(r => setProducts(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (patientId || !patientFocused) { setPatients([]); return; }
    const timeoutId = window.setTimeout(() => {
      // Empty search still resolves — most-recently-registered patients —
      // so the dropdown has something to pick from as soon as it's opened,
      // not only once the user has started typing.
      patientService.getPatients(1, 10, patientSearch.trim()).then(r => setPatients(r.data)).catch(() => setPatients([]));
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [patientSearch, patientId, patientFocused]);

  useEffect(() => {
    if (!patientId) { setPrescriptions([]); setPrescriptionId(''); return; }
    opticalService.getPrescriptions(1, 20, patientId).then(r => setPrescriptions(r.data)).catch(() => setPrescriptions([]));
  }, [patientId]);

  // Arrived via "Dispense" from an Optical Prescription — pre-fill the patient
  // and that exact prescription so staff don't have to look either up again.
  useEffect(() => {
    const linkedPrescriptionId = searchParams.get('prescription_id');
    if (!linkedPrescriptionId) return;
    opticalService.getPrescription(linkedPrescriptionId)
      .then(async (rx) => {
        const patient = await patientService.getPatient(rx.patient_id);
        setSelectedPatient(patient);
        setPatientId(rx.patient_id);
        setPrescriptionId(rx.id);
      })
      .catch(() => toast.error('Could not load the linked eye prescription'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requiresPrescription = cart.some(item => RX_REQUIRED_CATEGORIES.includes(item.category));

  const loadBatches = async (productId: string) => {
    if (batchMap[productId]) return batchMap[productId];
    try {
      const batches = await opticalService.getBatches(productId);
      setBatchMap(prev => ({ ...prev, [productId]: batches }));
      return batches;
    } catch {
      return [];
    }
  };

  const addToCart = async () => {
    if (!selectedProduct) return;
    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    const batches = await loadBatches(selectedProduct);
    const validBatches = batches.filter(b => b.quantity > 0 && (!b.expiry_date || new Date(b.expiry_date) > new Date()));
    const batch = validBatches[0];

    setCart(prev => [...prev, {
      product_id: product.id,
      product_name: `${product.name}${product.brand ? ` (${product.brand})` : ''}`,
      category: product.category,
      batch_id: batch?.id,
      quantity: 1,
      unit_price: Number(batch?.selling_price ?? product.selling_price ?? 0),
      discount_percent: 0,
      tax_percent: 0,
      available_qty: batch?.quantity || 0,
      batch_number: batch?.batch_number,
      expiry_date: batch?.expiry_date,
    }]);
    setSelectedProduct('');
    setProductLabel('');
  };

  const quickAddByCategory = async (category: string) => {
    const product = products.find(p => p.category === category && (p.total_stock ?? 0) > 0);
    if (!product) {
      toast.error(`No available ${category} products in stock`);
      return;
    }

    const batches = await loadBatches(product.id);
    const validBatches = batches.filter(b => b.quantity > 0 && (!b.expiry_date || new Date(b.expiry_date) > new Date()));
    const batch = validBatches[0];

    if (!batch) {
      toast.error(`No available stock for ${product.name}`);
      return;
    }

    setCart(prev => [...prev, {
      product_id: product.id,
      product_name: `${product.name}${product.brand ? ` (${product.brand})` : ''}`,
      category: product.category,
      batch_id: batch?.id,
      quantity: 1,
      unit_price: Number(batch?.selling_price ?? product.selling_price ?? 0),
      discount_percent: 0,
      tax_percent: 0,
      available_qty: batch?.quantity || 0,
      batch_number: batch?.batch_number,
      expiry_date: batch?.expiry_date,
    }]);
  };

  const updateCartItem = (idx: number, field: string, value: string | number) => {
    setCart(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      if (field === 'batch_id') {
        const batches = batchMap[it.product_id] || [];
        const newBatch = batches.find(b => b.id === value);
        if (newBatch) {
          updated.unit_price = newBatch.selling_price;
          updated.available_qty = newBatch.quantity;
          updated.batch_number = newBatch.batch_number;
          updated.expiry_date = newBatch.expiry_date;
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
  // Positive = still owed (advance + amount received fall short of total); negative = change due back.
  const remainingDue = grandTotal - advanceAmount - amountTendered;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) { toast.error('Select a patient'); return; }
    if (cart.length === 0) { toast.error('Add at least one item'); return; }

    for (const item of cart) {
      if (item.quantity > item.available_qty) {
        toast.error(`Insufficient stock for ${item.product_name}`);
        return;
      }
    }

    if (requiresPrescription && !prescriptionId) {
      toast.error('An eye prescription is required for lens / contact lens items in this sale');
      return;
    }

    setSaving(true);
    try {
      await opticalService.createSale({
        patient_id: patientId,
        prescription_id: prescriptionId || undefined,
        discount_amount: discountAmount,
        payment_method: paymentMethod,
        advance_amount: advanceAmount,
        amount_tendered: amountTendered,
        notes: notes || undefined,
        items: cart.map(({ product_id, batch_id, quantity, unit_price, discount_percent, tax_percent }) => ({
          product_id, batch_id: batch_id || undefined, quantity, unit_price,
          discount_percent: discount_percent || undefined, tax_percent: tax_percent || undefined,
        })),
      });
      toast.success('Sale completed');
      navigate('/optical/sales');
    } catch (err: any) {
      // The backend raises specific, actionable reasons for a failed sale
      // (insufficient stock, expired batch, prescription already dispensed,
      // etc.) — showing a generic message here hid exactly why it failed.
      toast.error(err?.response?.data?.detail || 'Failed to complete sale');
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
        <h1 className="text-2xl font-bold text-slate-900">New Optical Sale</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Patient & Prescription */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Patient *</label>
              <input
                value={selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : patientSearch}
                onChange={(e) => { setPatientSearch(e.target.value); setPatientId(''); setSelectedPatient(null); }}
                onKeyDown={patientNav.onKeyDown}
                onFocus={() => setPatientFocused(true)}
                onBlur={() => window.setTimeout(() => setPatientFocused(false), 150)}
                placeholder="Search, or click to browse recent patients"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary"
              />
              {patientFocused && !patientId && patients.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {!patientSearch.trim() && (
                    <p className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">Recent patients</p>
                  )}
                  {patients.map((p, idx) => (
                    <button key={p.id} type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectPatient(p)}
                      onMouseEnter={() => patientNav.setActiveIndex(idx)}
                      className={`w-full text-left px-3 py-2 text-sm ${idx === patientNav.activeIndex ? 'bg-primary/10' : 'hover:bg-slate-50'}`}>
                      {p.first_name} {p.last_name} <span className="text-slate-400 text-xs">({p.patient_reference_number})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Eye Prescription {requiresPrescription && <span className="text-red-500">*</span>}
              </label>
              <select value={prescriptionId} onChange={e => setPrescriptionId(e.target.value)}
                disabled={!patientId}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary disabled:bg-slate-50">
                <option value="">{patientId ? 'None / Not required' : 'Select a patient first'}</option>
                {prescriptions.map(rx => (
                  <option key={rx.id} value={rx.id}>{rx.prescription_number} ({format(new Date(rx.created_at), 'dd MMM yyyy')})</option>
                ))}
              </select>
              {requiresPrescription && (
                <p className="mt-1 text-xs text-red-500">Required — this sale includes a lens or contact lens item.</p>
              )}
            </div>
          </div>
        </div>

        {/* Add Item */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Items</h2>

          {/* Quick Add Buttons */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => quickAddByCategory('frame')}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              + Add Frame
            </button>
            <button type="button" onClick={() => quickAddByCategory('lens')}
              className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700">
              + Add Lens
            </button>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <SearchableSelect
                value={productLabel}
                onChange={handleProductSelect}
                suggestions={productSuggestions}
                placeholder="Search product..."
                allowManualEntry={false}
              />
            </div>
            <button type="button" onClick={addToCart} disabled={!selectedProduct}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
              Add
            </button>
          </div>

          {cart.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No items added yet</p>
          ) : (
            <div className="space-y-2">
              {cart.map((item, idx) => {
                const batches = (batchMap[item.product_id] || []).filter(b => b.quantity > 0);
                const lineTotal = item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100);
                return (
                  <div key={idx} className="p-3 bg-slate-50 rounded-lg space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        <label className="block text-xs text-slate-500 mb-0.5">Product</label>
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {item.product_name}
                          {RX_REQUIRED_CATEGORIES.includes(item.category) && (
                            <span className="ml-1 text-[10px] font-semibold text-red-500 align-top">Rx</span>
                          )}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-500 mb-0.5">Batch</label>
                        <select value={item.batch_id || ''} onChange={e => updateCartItem(idx, 'batch_id', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary">
                          <option value="">Auto</option>
                          {batches.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.batch_number} ({b.expiry_date ? `Exp: ${format(new Date(b.expiry_date), 'MMM yy')}, ` : ''}Qty: {b.quantity})
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
                        <input type="number" min={0} max={100} value={zeroAsEmpty(item.discount_percent || 0)} placeholder="0"
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
                    {(item.batch_number || item.expiry_date) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 border-t border-slate-200 pt-2">
                        {item.batch_number && <span><strong className="text-slate-600">Batch:</strong> {item.batch_number}</span>}
                        {item.expiry_date && <span><strong className="text-slate-600">Exp:</strong> {format(new Date(item.expiry_date), 'dd MMM yyyy')}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-primary resize-none" />
              </div>
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
                <input type="number" min={0} step={0.01} value={zeroAsEmpty(discountAmount)} placeholder="0"
                  onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
                <span>Grand Total</span>
                <span className="text-primary">₹{grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm items-center pt-2 border-t border-slate-200">
                <span className="text-slate-500">Advance Paid</span>
                <input type="number" min={0} step={0.01} value={zeroAsEmpty(advanceAmount)} placeholder="0"
                  onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-slate-500">Amount Received Now</span>
                <input type="number" min={0} step={0.01} value={zeroAsEmpty(amountTendered)} placeholder="0"
                  onChange={e => setAmountTendered(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:border-primary" />
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className={remainingDue > 0 ? 'text-red-500' : 'text-slate-500'}>{remainingDue > 0 ? 'Remaining Amount' : 'Change Due'}</span>
                <span className={remainingDue > 0 ? 'text-red-600' : 'text-emerald-600'}>₹{Math.abs(remainingDue).toFixed(2)}</span>
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

export default NewOpticalSale;
