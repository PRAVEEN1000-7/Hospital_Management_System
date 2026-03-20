import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import invoiceService from '../services/invoiceService';
import paymentService from '../services/paymentService';
import taxService from '../services/taxService';
import { patientService } from '../services/patientService';
import hospitalService from '../services/hospitalService';
import type { HospitalDetails } from '../services/hospitalService';
import type { Patient } from '../types/patient';
import type { TaxConfig, InvoiceType, InvoiceItemCreateData, InvoiceItemType, PaymentMode } from '../types/billing';

interface MedicineLookupResult {
  name: string;
  selling_price: number;
  tax_config_id?: string;
  total_stock_available: number;
  available_batches: Array<{
    id: string;
    batch_number: string;
    quantity_available: number;
    expiry_date: string;
    selling_price: number;
  }>;
}

interface LineItem {
  key: string;
  item_type: InvoiceItemType;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_config_id: string;
  batch_number: string;
  // computed
  taxRate: number;
  taxAmount: number;
  totalPrice: number;
  medicineLookup?: MedicineLookupResult;
}

const ITEM_TYPES: { value: InvoiceItemType; label: string }[] = [
  { value: 'registration', label: 'Registration Fee' },
  { value: 'consultation', label: 'Consultation Fee' },
  { value: 'medicine', label: 'Medicine' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'service', label: 'Service' },
  { value: 'optical_product', label: 'Optical Product' },
];

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'credit_card', label: 'Credit Card' },
];

const emptyLine = (type: InvoiceItemType = 'service'): LineItem => ({
  key: crypto.randomUUID(),
  item_type: type,
  description: '',
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  tax_config_id: '',
  batch_number: '',
  taxRate: 0,
  taxAmount: 0,
  totalPrice: 0,
});

const computeLine = (line: LineItem, taxes: TaxConfig[]): LineItem => {
  const gross = line.quantity * line.unit_price;
  const discountAmt = (gross * line.discount_percent) / 100;
  const taxable = gross - discountAmt;
  const taxCfg = taxes.find(t => t.id === line.tax_config_id);
  const taxRate = taxCfg ? Number(taxCfg.rate_percentage) : 0;
  const taxAmount = (taxable * taxRate) / 100;
  const totalPrice = taxable + taxAmount;
  return { ...line, taxRate, taxAmount, totalPrice };
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const InvoiceCreate: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  // Patient
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showPatientDrop, setShowPatientDrop] = useState(false);

  // Meta
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('opd');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [headerDiscount, setHeaderDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const appointmentId = searchParams.get('appointment_id') || '';

  // Line items
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  // Taxes
  const [taxes, setTaxes] = useState<TaxConfig[]>([]);

  // Invoice type → item type mapping
  const [itemTypeMapping, setItemTypeMapping] = useState<Record<string, InvoiceItemType[]>>({
    opd: ['consultation', 'service', 'procedure', 'registration'] as InvoiceItemType[],
    pharmacy: ['medicine'] as InvoiceItemType[],
    optical: ['optical_product', 'service'] as InvoiceItemType[],
    combined: ['consultation', 'medicine', 'optical_product', 'service', 'procedure', 'registration'] as InvoiceItemType[],
  });

  // UI
  const [saving, setSaving] = useState(false);
  const [medicineLoadingIdx, setMedicineLoadingIdx] = useState<number | null>(null);

  // Hospital info (display only)
  const [hospital, setHospital] = useState<HospitalDetails | null>(null);

  // Instant payment
  const [payNow, setPayNow] = useState(false);

  const [payMode, setPayMode] = useState<PaymentMode>('cash');
  const [cashReceived, setCashReceived] = useState(0);
  const [payReference, setPayReference] = useState('');

  // Pre-fill patient if passed via query param
  useEffect(() => {
    const pid = searchParams.get('patient_id');
    if (pid) {
      patientService.getPatient(pid).then(p => setSelectedPatient(p)).catch(() => {});
    }
  }, [searchParams]);

  // Load hospital info
  useEffect(() => {
    hospitalService.getHospitalDetails().then(h => setHospital(h)).catch(() => {});
  }, []);

  // Load active taxes
  useEffect(() => {
    taxService.list(1, 50, true).then(res => setTaxes(res.items)).catch(() => {});
  }, []);

  // Load invoice item type mapping from backend
  useEffect(() => {
    invoiceService.getItemTypeMapping()
      .then(mapping => setItemTypeMapping(mapping))
      .catch(() => {
        // Use defaults if fetch fails
        setItemTypeMapping({
          opd: ['consultation', 'service', 'procedure', 'registration'] as InvoiceItemType[],
          pharmacy: ['medicine'] as InvoiceItemType[],
          optical: ['optical_product', 'service'] as InvoiceItemType[],
          combined: ['consultation', 'medicine', 'optical_product', 'service', 'procedure', 'registration'] as InvoiceItemType[],
        });
      });
  }, []);

  // Search patients (debounced)
  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 2) { setPatientResults([]); return; }
    try {
      const res = await patientService.getPatients(1, 6, q);
      setPatientResults(res.data);
    } catch { setPatientResults([]); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchPatients(patientSearch), 280);
    return () => clearTimeout(t);
  }, [patientSearch, searchPatients]);

  const selectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setPatientSearch('');
    setPatientResults([]);
    setShowPatientDrop(false);
  };

  // Get allowed item types for current invoice type
  const getAllowedItemTypes = (): { value: InvoiceItemType; label: string }[] => {
    const allowedValues = itemTypeMapping[invoiceType] || [];
    return ITEM_TYPES.filter(t => allowedValues.includes(t.value));
  };

  // Lookup medicine from inventory and auto-populate line item
  const handleMedicineLookup = async (idx: number, medicineId: string) => {
    if (!medicineId.trim()) {
      showToast('error', 'Please enter or select a medicine ID/name');
      return;
    }
    setMedicineLoadingIdx(idx);
    try {
      const medicineData = await invoiceService.getMedicineDetails(medicineId);
      
      // STEP 2: Auto-populate line item with medicine details + batch info
      updateLine(idx, {
        description: medicineData.name,
        unit_price: medicineData.selling_price,
        tax_config_id: medicineData.tax_config ? medicineData.tax_config.id : '',
        batch_number: medicineData.available_batches[0]?.batch_number || '',  // Pre-select first batch (FEFO)
        medicineLookup: {
          name: medicineData.name,
          selling_price: medicineData.selling_price,
          tax_config_id: medicineData.tax_config?.id,
          total_stock_available: medicineData.total_stock_available,
          available_batches: medicineData.available_batches,
        },
      });
      
      // Show stock info to user
      const stockMsg = medicineData.total_stock_available > 0
        ? `Stock: ${medicineData.total_stock_available} units (${medicineData.batch_count} batch${medicineData.batch_count === 1 ? '' : 'es'})`
        : 'No stock available';
      showToast('success', `${medicineData.name} loaded. ${stockMsg}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', msg || 'Failed to lookup medicine');
    } finally {
      setMedicineLoadingIdx(null);
    }
  };

  // When invoice type changes, validate/fix line items
  const handleInvoiceTypeChange = (newType: InvoiceType) => {
    setInvoiceType(newType);
    const allowedValues = itemTypeMapping[newType] || [];
    // Reset any line items with invalid types to the first allowed type
    setLines(prev => prev.map(line => {
      if (!allowedValues.includes(line.item_type)) {
        return { ...line, item_type: (allowedValues[0] || 'service') as InvoiceItemType };
      }
      return line;
    }));
  };

  const validateMedicineQuantity = (line: LineItem): string | null => {
    if (line.item_type !== 'medicine') {
      return null;
    }
    if (!line.medicineLookup) {
      return null;
    }

    const requested = line.quantity;
    const available = line.medicineLookup.total_stock_available;
    if (requested > available) {
      return `Insufficient stock: requested ${requested} units, only ${available} available`;
    }

    if (line.batch_number) {
      const batch = line.medicineLookup.available_batches.find(b => b.batch_number === line.batch_number);
      if (batch && requested > batch.quantity_available) {
        return `Batch ${line.batch_number} has insufficient stock: requested ${requested} units, only ${batch.quantity_available} available`;
      }
    }

    return null;
  };

  // Line item helpers
  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLines(prev => {
      const updated = [...prev];
      const merged = { ...updated[idx], ...patch };
      const computed = computeLine(merged, taxes);

      if (patch.quantity !== undefined) {
        const error = validateMedicineQuantity(computed);
        if (error) {
          showToast('warning', error);
        }
      }

      updated[idx] = computed;
      return updated;
    });
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  // Totals
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price - (l.quantity * l.unit_price * l.discount_percent) / 100, 0);
  const totalTax = lines.reduce((s, l) => s + l.taxAmount, 0);
  const grandTotal = lines.reduce((s, l) => s + l.totalPrice, 0) - headerDiscount;

  const changeToReturn = payMode === 'cash'
    ? Math.max(0, cashReceived - Math.max(0, grandTotal))
    : 0;

  const buildPayload = () => ({
    patient_id: selectedPatient!.id,
    appointment_id: appointmentId || undefined,
    invoice_type: invoiceType,
    invoice_date: invoiceDate,
    due_date: dueDate || undefined,
    discount_amount: headerDiscount || undefined,
    discount_reason: discountReason || undefined,
    notes: notes || undefined,
    items: lines.map((l, i): InvoiceItemCreateData => ({
      item_type: l.item_type,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_percent: l.discount_percent || undefined,
      tax_config_id: l.tax_config_id || undefined,
      batch_number: l.batch_number || undefined,
      display_order: i,
    })),
  });

  const handleSaveDraft = async () => {
    if (!selectedPatient) { showToast('error', 'Please select a patient'); return; }
    if (lines.some(l => !l.description.trim())) { showToast('error', 'All line items must have a description'); return; }
    setSaving(true);
    try {
      const inv = await invoiceService.create(buildPayload());
      showToast('success', 'Invoice saved as draft');
      navigate(`/billing/invoices/${inv.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', msg || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleIssue = async () => {
    if (!selectedPatient) { showToast('error', 'Please select a patient'); return; }
    if (lines.some(l => !l.description.trim())) { showToast('error', 'All line items must have a description'); return; }
    const netTotal = Math.max(0, grandTotal);
    if (payNow && netTotal <= 0) { showToast('error', 'Invoice total must be greater than zero to collect payment'); return; }
    if (payNow && payMode === 'cash' && cashReceived <= 0) { showToast('error', 'Please enter the cash amount received from the patient'); return; }
    setSaving(true);
    try {
      const inv = await invoiceService.create(buildPayload());
      await invoiceService.issue(inv.id);
      if (payNow) {
        // For cash: record exactly what was received (up to the invoice total)
        // — if cashReceived >= total, record the full total and return change
        // — if cashReceived < total, record as partial payment
        // For non-cash (UPI/card/etc.): record the full invoice total
        const actualPayAmount = payMode === 'cash'
          ? (cashReceived >= netTotal ? netTotal : cashReceived)
          : netTotal;
        await paymentService.record({
          invoice_id: inv.id,
          patient_id: inv.patient_id,
          amount: actualPayAmount,
          payment_mode: payMode,
          payment_date: invoiceDate,
          payment_reference: payReference || undefined,
          notes: payMode === 'cash' && cashReceived > 0
            ? `Cash received: ₹${fmt(cashReceived)}, Change: ₹${fmt(changeToReturn)}`
            : undefined,
        });
      }
      showToast('success', payNow ? 'Invoice issued & payment recorded' : 'Invoice issued successfully');
      navigate(`/billing/invoices/${inv.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', msg || 'Failed to issue invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/billing/invoices')}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Invoice</h1>
          <p className="text-sm text-slate-500">Create a new billing invoice for a patient</p>
        </div>
      </div>

      {/* ── Hospital Info Bar ── */}
      {hospital && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 mb-6 flex items-center gap-4">
          <span className="material-symbols-outlined text-primary text-[24px]">local_hospital</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{hospital.name}</p>
            <p className="text-xs text-slate-500 truncate">
              {[hospital.address_line_1, hospital.city, hospital.state_province]
                .filter(Boolean).join(', ')}
              {hospital.phone ? ` · ☎ ${hospital.phone}` : ''}
            </p>
          </div>
          {(hospital.registration_number || hospital.tax_id) && (
            <div className="text-right shrink-0">
              {hospital.registration_number && (
                <p className="text-xs text-slate-500">Reg: {hospital.registration_number}</p>
              )}
              {hospital.tax_id && (
                <p className="text-xs text-slate-500">GSTIN: {hospital.tax_id}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Form ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Patient Selection */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Patient</h2>
            {selectedPatient ? (
              <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {selectedPatient.first_name} {selectedPatient.last_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {selectedPatient.patient_reference_number} · {selectedPatient.phone_number}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-slate-400 hover:text-red-500 font-medium"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-[18px]">search</span>
                <input
                  type="text"
                  placeholder="Search by name, phone, or Patient ID…"
                  value={patientSearch}
                  onChange={e => { setPatientSearch(e.target.value); setShowPatientDrop(true); }}
                  onFocus={() => setShowPatientDrop(true)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {showPatientDrop && patientResults.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {patientResults.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectPatient(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm"
                      >
                        <span className="font-medium">{p.first_name} {p.last_name}</span>
                        <span className="ml-2 text-slate-400 text-xs">{p.patient_reference_number} · {p.phone_number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Invoice Meta */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Invoice Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Invoice Type *</label>
                <select
                  value={invoiceType}
                  onChange={e => handleInvoiceTypeChange(e.target.value as InvoiceType)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="opd">OPD</option>
                  <option value="pharmacy">Pharmacy</option>
                  <option value="optical">Optical</option>
                  <option value="combined">Combined</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Invoice Date *</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes (internal)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Internal notes, special instructions…"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Line Items</h2>
              <button
                onClick={addLine}
                className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Add Item
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div key={line.key} className="grid grid-cols-12 gap-2 items-start bg-slate-50 rounded-lg p-3">
                  {/* Description (col 1–4) */}
                  <div className="col-span-12 sm:col-span-4">
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Description *</label>
                    <div className="flex gap-1 items-end">
                      <input
                        type="text"
                        placeholder={line.item_type === 'medicine' ? 'Medicine name or ID' : 'Item description'}
                        value={line.description}
                        onChange={e => updateLine(idx, { description: e.target.value })}
                        className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
                      />
                      {/* Medicine lookup button */}
                      {line.item_type === 'medicine' && (
                        <button
                          type="button"
                          onClick={() => handleMedicineLookup(idx, line.description)}
                          disabled={medicineLoadingIdx === idx || !line.description.trim()}
                          className="px-2 py-1.5 bg-primary/10 hover:bg-primary/20 disabled:bg-slate-100 text-primary disabled:text-slate-400 text-xs font-medium rounded transition-colors whitespace-nowrap"
                          title="Lookup medicine from inventory"
                        >
                          {medicineLoadingIdx === idx ? 'Loading...' : 'Lookup'}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Batch # — medicine only */}
                  {line.item_type === 'medicine' && (
                    <div className="col-span-12 sm:col-span-2">
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Batch</label>
                      {line.medicineLookup && line.medicineLookup.available_batches.length > 0 ? (
                        <select
                          value={line.batch_number}
                          onChange={e => updateLine(idx, { batch_number: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
                        >
                          <option value="">Select Batch...</option>
                          {line.medicineLookup.available_batches.map((b) => (
                            <option key={b.id} value={b.batch_number}>
                              {b.batch_number} ({b.quantity_available} units, exp: {b.expiry_date})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="Batch # (or lookup medicine)"
                          value={line.batch_number}
                          onChange={e => updateLine(idx, { batch_number: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
                        />
                      )}
                    </div>
                  )}
                  {/* Type (col 5–6) */}
                  <div className="col-span-6 sm:col-span-2">
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Type</label>
                    <select
                      value={line.item_type}
                      onChange={e => updateLine(idx, { item_type: e.target.value as InvoiceItemType })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
                    >
                      {getAllowedItemTypes().map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {/* Qty (col 7) */}
                  <div className="col-span-3 sm:col-span-1">
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Qty</label>
                    <input
                      type="number"
                      min={0.01} step="0.01"
                    value={line.quantity || ''}
                      onChange={e => updateLine(idx, { quantity: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                    {/* Qty (col 7) — with stock warning for medicine */}
                    <div className="col-span-3 sm:col-span-1">
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">
                        Qty
                        {line.item_type === 'medicine' && validateMedicineQuantity(line) && (
                          <span className="ml-1 text-orange-500 font-bold">⚠</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min={0.01} step="0.01"
                        value={line.quantity || ''}
                        onChange={e => updateLine(idx, { quantity: parseFloat(e.target.value) || 0 })}
                        className={`w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 bg-white text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                          validateMedicineQuantity(line) ? 'border-orange-300 focus:ring-orange-500/30' : 'border-slate-200 focus:ring-primary/30'
                        }`}
                      />
                      {validateMedicineQuantity(line) && (
                        <p className="text-[9px] text-orange-600 mt-0.5">{validateMedicineQuantity(line)}</p>
                      )}
                    </div>
                  {/* Unit Price (col 8) */}
                  <div className="col-span-3 sm:col-span-1">
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      {line.item_type === 'medicine' ? 'MRP' : 'Price'}
                    </label>
                    <input
                      type="number"
                      min={0} step="0.01"
                    value={line.unit_price || ''}
                      onChange={e => updateLine(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                  {/* Discount % (col 9) */}
                  <div className="col-span-3 sm:col-span-1">
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Disc%</label>
                    <input
                      type="number"
                      min={0} max={100} step="0.01"
                    value={line.discount_percent || ''}
                      onChange={e => updateLine(idx, { discount_percent: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                  {/* Tax Config (col 10–11) */}
                  <div className="col-span-6 sm:col-span-2">
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Tax</label>
                    <select
                      value={line.tax_config_id}
                      onChange={e => updateLine(idx, { tax_config_id: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
                    >
                      <option value="">None</option>
                      {taxes.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({Number(t.rate_percentage)}%)</option>
                      ))}
                    </select>
                  </div>
                  {/* Total + Remove (col 12) */}
                  <div className="col-span-6 sm:col-span-1 flex flex-col items-end">
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Total</label>
                    <p className="text-xs font-bold text-slate-800 mt-1.5">₹{fmt(line.totalPrice)}</p>
                    {lines.length > 1 && (
                      <button
                        onClick={() => removeLine(idx)}
                        className="mt-1 text-red-400 hover:text-red-600"
                        title="Remove item"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Summary ── */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Invoice Summary</h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>₹{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax</span>
                <span>₹{fmt(totalTax)}</span>
              </div>
              {headerDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>−₹{fmt(headerDiscount)}</span>
                </div>
              )}
              <div className="border-t border-slate-100 pt-2 flex justify-between font-bold text-slate-900 text-base">
                <span>Grand Total</span>
                <span>₹{fmt(Math.max(0, grandTotal))}</span>
              </div>
            </div>

            {/* Header Discount */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <label className="block text-xs font-medium text-slate-600 mb-1">Additional Discount (₹)</label>
              <input
                type="number"
                min={0} step="0.01"
                value={headerDiscount || ''}
                onChange={e => setHeaderDiscount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              {headerDiscount > 0 && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Discount Reason</label>
                  <input
                    type="text"
                    placeholder="e.g., Senior citizen, Staff discount"
                    value={discountReason}
                    onChange={e => setDiscountReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              )}
            </div>

            {/* Pay Now Section */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={payNow}
                  onChange={e => setPayNow(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-sm font-medium text-slate-700">Collect Payment Now</span>
              </label>

              {payNow && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Payment Mode</label>
                    <select
                      value={payMode}
                      onChange={e => { setPayMode(e.target.value as PaymentMode); setCashReceived(0); }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {PAYMENT_MODES.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  {payMode !== 'cash' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Reference / Transaction ID</label>
                      <input
                        type="text"
                        placeholder="UPI ref, card last 4, etc."
                        value={payReference}
                        onChange={e => setPayReference(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  )}
                  {payMode === 'cash' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Cash Received (₹)</label>
                        <input
                          type="number"
                          min={0} step="0.01"
                          value={cashReceived || ''}
                          onChange={e => setCashReceived(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      {cashReceived > 0 && (
                        <div className="flex justify-between text-sm font-semibold rounded-lg px-3 py-2 bg-green-50 border border-green-200 text-green-800">
                          <span>Balance to Patient</span>
                          <span>₹{fmt(changeToReturn)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 space-y-2">
              <button
                onClick={handleIssue}
                disabled={saving}
                className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-[0.98]"
              >
                {saving ? 'Processing…' : 'Create & Issue Invoice'}
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200 disabled:opacity-60 transition-all"
              >
                Save as Draft
              </button>
              <button
                onClick={() => navigate('/billing/invoices')}
                className="w-full py-2 text-slate-500 text-sm hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceCreate;
