import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import labService from '../../services/labService';
import invoiceService from '../../services/invoiceService';
import paymentService from '../../services/paymentService';
import type { LabOrder, LabOrderItem, LabResultFlag, LabQueueStatus } from '../../types/lab';
import type { PaymentMode } from '../../types/billing';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime } from '../../utils/calendarDate';

const STAFF_ROLES = ['super_admin', 'admin', 'lab_technician'];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const flagBadge: Record<string, string> = {
  normal: 'bg-emerald-50 text-emerald-700',
  high: 'bg-red-50 text-red-600',
  low: 'bg-amber-50 text-amber-700',
  abnormal: 'bg-orange-50 text-orange-700',
};

interface ParamDraft {
  name: string;
  value: string;
  unit: string;
  reference_range: string;
  flag: LabResultFlag | '';
  section: string;
}

const blankParam = (name = ''): ParamDraft => ({ name, value: '', unit: '', reference_range: '', flag: '', section: '' });

const draftFromItem = (item: LabOrderItem): ParamDraft[] => {
  if (item.parameters && item.parameters.length > 0) {
    return item.parameters
      .slice()
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((p) => ({
        name: p.name,
        value: p.value,
        unit: p.unit || '',
        reference_range: p.reference_range || '',
        flag: (p.flag as LabResultFlag) || '',
        section: p.section || '',
      }));
  }
  if (item.report_template && item.report_template.length > 0) {
    return item.report_template
      .slice()
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((t) => ({ name: t.name, value: '', unit: t.unit || '', reference_range: t.reference_range || '', flag: '', section: t.section || '' }));
  }
  if (item.result_value) {
    return [{
      name: item.test_name,
      value: item.result_value,
      unit: item.result_unit || '',
      reference_range: item.reference_range || '',
      flag: (item.result_flag as LabResultFlag) || '',
      section: '',
    }];
  }
  return [blankParam(item.test_name)];
};

// Returns, for each row index, the section heading to render above that row
// (or undefined if no heading belongs there) — a heading appears only when a
// row's non-empty section differs from the previous row's section, so tests
// with no sections at all render with no headings, unchanged from before.
const sectionHeadingFor = (rows: { section: string }[], idx: number): string | undefined => {
  const section = rows[idx].section?.trim();
  if (!section) return undefined;
  const prevSection = idx > 0 ? rows[idx - 1].section?.trim() : '';
  return section !== prevSection ? section : undefined;
};

const LabOrderDetail: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isStaff = Boolean(user?.roles?.some((r) => STAFF_ROLES.includes(r)));

  const [order, setOrder] = useState<LabOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ParamDraft[]>>({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [savingItem, setSavingItem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const data = await labService.getOrder(orderId);
      setOrder(data);
      setDrafts(Object.fromEntries(data.items.map((i) => [i.id, draftFromItem(i)])));
      setNotesDrafts(Object.fromEntries(data.items.map((i) => [i.id, i.result_notes || ''])));
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to load order');
      if (isStaff) navigate('/lab/queue'); else navigate(-1);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, showToast, navigate]);

  useEffect(() => { load(); }, [load]);

  const isPaid = order?.payment_status === 'paid';
  const isFinalized = order?.report_status === 'finalized';
  const allItemsCompleted = Boolean(order && order.items.length > 0 && order.items.every((i) => i.status === 'completed'));
  // Result entry is independent of payment — a lab tech can process a sample
  // and record its results whenever they're ready. Payment is only required,
  // together with every item being completed, to actually finalize the
  // report (see canFinalize / finalize_lab_report in lab_service.py).
  const canEditResults = isStaff && !isFinalized;
  const canFinalize = isStaff && !isFinalized && isPaid && allItemsCompleted;
  const total = Number(order?.total_amount || 0);

  const handleCollectPayment = async () => {
    if (!order || !orderId) return;
    setProcessing(true);
    try {
      // Same generic billing path as DispensingBilling.tsx: create → issue →
      // record payment, then sync the lab sale's denormalized status.
      const invoice = await invoiceService.create({
        patient_id: order.patient_id,
        invoice_type: 'lab',
        notes: `Lab order ${order.order_number}`,
        items: order.items.map((item, idx) => ({
          item_type: 'lab_test' as const,
          reference_id: item.lab_test_id,
          description: item.test_name,
          quantity: 1,
          unit_price: Number(item.price),
          display_order: idx,
        })),
      });
      await invoiceService.issue(invoice.id);
      await paymentService.record({
        invoice_id: invoice.id,
        patient_id: order.patient_id,
        amount: total,
        payment_mode: paymentMode,
        payment_reference: paymentRef.trim() || undefined,
      });
      try {
        await labService.markSalePaid(orderId, total, paymentMode);
      } catch {
        // Non-fatal — invoice/payment already succeeded.
      }
      showToast('success', 'Payment recorded');
      await load();
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to process payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleAdvanceQueue = async (status: LabQueueStatus) => {
    if (!orderId) return;
    try {
      await labService.updateQueueStatus(orderId, status);
      showToast('success', 'Queue status updated');
      await load();
    } catch {
      showToast('error', 'Failed to update queue status');
    }
  };

  const setParamField = (itemId: string, idx: number, patch: Partial<ParamDraft>) =>
    setDrafts((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    }));

  const addParamRow = (itemId: string) =>
    setDrafts((prev) => ({ ...prev, [itemId]: [...(prev[itemId] || []), blankParam()] }));

  const removeParamRow = (itemId: string, idx: number) =>
    setDrafts((prev) => ({ ...prev, [itemId]: (prev[itemId] || []).filter((_, i) => i !== idx) }));

  const handleSaveResult = async (item: LabOrderItem) => {
    if (!orderId) return;
    const rows = (drafts[item.id] || []).filter((r) => r.name.trim() && r.value.trim());
    if (rows.length === 0) {
      showToast('error', 'At least one parameter with a value is required');
      return;
    }
    setSavingItem(item.id);
    try {
      const updated = await labService.recordResult(orderId, item.id, {
        parameters: rows.map((r, idx) => ({
          name: r.name.trim(),
          value: r.value.trim(),
          unit: r.unit.trim() || undefined,
          reference_range: r.reference_range.trim() || undefined,
          flag: r.flag || undefined,
          sequence: idx,
          section: r.section.trim() || undefined,
        })),
        result_notes: notesDrafts[item.id]?.trim() || undefined,
      });
      setOrder(updated);
      setDrafts(Object.fromEntries(updated.items.map((i) => [i.id, draftFromItem(i)])));
      setNotesDrafts(Object.fromEntries(updated.items.map((i) => [i.id, i.result_notes || ''])));
      showToast('success', 'Result saved');
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to save result');
    } finally {
      setSavingItem(null);
    }
  };

  const handleFinalize = async () => {
    if (!orderId) return;
    if (!window.confirm('Finalize this report? Results will be locked and the report will become visible to the doctor.')) return;
    setFinalizing(true);
    try {
      const updated = await labService.finalizeReport(orderId);
      setOrder(updated);
      showToast('success', 'Report finalized');
    } catch (err: any) {
      showToast('error', err?.response?.data?.detail || 'Failed to finalize report');
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }
  if (!order) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Local print override — the global print stylesheet (index.css) hides
          the entire body by default and only reveals a designated print-area
          container (same pattern as DispensingBilling.tsx / InvoiceDetail.tsx). */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #lab-report-print-area, #lab-report-print-area * { visibility: visible !important; }
          #lab-report-print-area { position: absolute; inset: 0; padding: 24px; }
        }
      `}</style>

      {/* Header */}
      <div className="print:hidden">
        <nav className="flex text-sm text-slate-400 mb-1">
          <button onClick={() => (isStaff ? navigate('/lab/queue') : navigate(-1))} className="hover:text-primary">
            {isStaff ? 'Lab Queue' : 'Back'}
          </button>
          <span className="mx-2">/</span>
          <span className="text-slate-600">{order.order_number}</span>
        </nav>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Lab Order {order.order_number}</h1>
          <div className="flex gap-2">
            {isStaff && order.queue_status === 'waiting' && (
              <button onClick={() => handleAdvanceQueue('being_served')}
                className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100">
                Mark Being Served
              </button>
            )}
            {isStaff && order.queue_status === 'being_served' && (
              <button onClick={() => handleAdvanceQueue('collected')}
                className="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100">
                Mark Sample Collected
              </button>
            )}
            <button onClick={() => window.print()}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">print</span>
              Print Report
            </button>
          </div>
        </div>
      </div>

      <div id="lab-report-print-area" className="space-y-6">
        {isFinalized && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <span className="material-symbols-outlined text-lg">verified</span>
            Report finalized{order.finalized_by_name ? ` by ${order.finalized_by_name}` : ''}
            {order.finalized_at ? ` on ${formatDateTime(order.finalized_at)}` : ''}.
          </div>
        )}

        {/* Patient / meta */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Patient</div>
              <div className="font-medium text-slate-900">{order.patient_name || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Doctor</div>
              <div className="font-medium text-slate-900">{order.doctor_name || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Token</div>
              <div className="font-medium text-slate-900">{order.queue_token ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Ordered</div>
              <div className="font-medium text-slate-900">{formatDateTime(order.created_at)}</div>
            </div>
          </div>
          {order.notes && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Notes</div>
              <p className="text-sm text-slate-700">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Results</h2>
            {canFinalize && (
              <button onClick={handleFinalize} disabled={finalizing}
                className="print:hidden px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">task_alt</span>
                {finalizing ? 'Finalizing...' : 'Finalize Report'}
              </button>
            )}
          </div>
          {isStaff && !isFinalized && !allItemsCompleted && (
            <p className="text-sm text-slate-500 mb-4 print:hidden">Enter every test's results to enable Finalize Report.</p>
          )}
          {isStaff && !isFinalized && allItemsCompleted && !isPaid && (
            <p className="text-sm text-slate-500 mb-4 print:hidden">Collect payment above to enable Finalize Report.</p>
          )}
          <div className="space-y-4">
            {order.items.map((item) => {
              const rows = drafts[item.id] || draftFromItem(item);
              const done = item.status === 'completed';
              const editable = canEditResults;
              return (
                <div key={item.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium text-slate-900">{item.test_name}</div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {done ? 'Completed' : 'Pending'}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-100">
                          <th className="py-1.5 pr-2 font-medium">Parameter</th>
                          <th className="py-1.5 pr-2 font-medium">Value</th>
                          <th className="py-1.5 pr-2 font-medium">Unit</th>
                          <th className="py-1.5 pr-2 font-medium">Reference Range</th>
                          <th className="py-1.5 pr-2 font-medium">Flag</th>
                          {editable && <th className="py-1.5 print:hidden"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, idx) => {
                          const heading = sectionHeadingFor(rows, idx);
                          const headingRow = heading && (
                            <tr key={`${idx}-section`}>
                              <td colSpan={editable ? 6 : 5} className="pt-3 pb-1 text-xs text-slate-500 uppercase font-semibold">
                                {heading}
                              </td>
                            </tr>
                          );
                          return (
                          <React.Fragment key={idx}>
                            {headingRow}
                            {editable ? (
                            <tr className="border-b border-slate-50">
                              <td className="py-1.5 pr-2">
                                <input value={row.name} onChange={(e) => setParamField(item.id, idx, { name: e.target.value })}
                                  placeholder="Parameter"
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                              </td>
                              <td className="py-1.5 pr-2">
                                <input value={row.value} onChange={(e) => setParamField(item.id, idx, { value: e.target.value })}
                                  placeholder="Value"
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                              </td>
                              <td className="py-1.5 pr-2">
                                <input value={row.unit} onChange={(e) => setParamField(item.id, idx, { unit: e.target.value })}
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                              </td>
                              <td className="py-1.5 pr-2">
                                <input value={row.reference_range} onChange={(e) => setParamField(item.id, idx, { reference_range: e.target.value })}
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                              </td>
                              <td className="py-1.5 pr-2">
                                <select value={row.flag} onChange={(e) => setParamField(item.id, idx, { flag: e.target.value as LabResultFlag | '' })}
                                  className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                                  <option value="">—</option>
                                  <option value="normal">Normal</option>
                                  <option value="high">High</option>
                                  <option value="low">Low</option>
                                  <option value="abnormal">Abnormal</option>
                                </select>
                              </td>
                              <td className="py-1.5 print:hidden">
                                <button type="button" onClick={() => removeParamRow(item.id, idx)}
                                  className="text-slate-400 hover:text-red-600" title="Remove parameter">
                                  <span className="material-symbols-outlined text-base">close</span>
                                </button>
                              </td>
                            </tr>
                            ) : (
                              row.name && (
                              <tr className="border-b border-slate-50">
                                <td className="py-1.5 pr-2 text-slate-800">{row.name}</td>
                                <td className="py-1.5 pr-2 text-slate-900 font-medium">{row.value || '—'}</td>
                                <td className="py-1.5 pr-2 text-slate-500">{row.unit || '—'}</td>
                                <td className="py-1.5 pr-2 text-slate-500">{row.reference_range || '—'}</td>
                                <td className="py-1.5 pr-2">
                                  {row.flag ? (
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${flagBadge[row.flag] || 'bg-slate-100 text-slate-600'}`}>
                                      {row.flag}
                                    </span>
                                  ) : '—'}
                                </td>
                              </tr>
                              )
                            )}
                          </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {editable && (
                    <button type="button" onClick={() => addParamRow(item.id)}
                      className="print:hidden mt-2 text-xs font-medium text-primary hover:underline flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">add</span> Add Parameter
                    </button>
                  )}

                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                    {editable ? (
                      <input value={notesDrafts[item.id] || ''} onChange={(e) => setNotesDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    ) : (
                      <p className="text-sm text-slate-700">{item.result_notes || '—'}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <div className="text-xs text-slate-400">
                      {done && item.resulted_at ? `Resulted ${formatDateTime(item.resulted_at)}` : ''}
                    </div>
                    {editable && (
                      <button onClick={() => handleSaveResult(item)} disabled={savingItem === item.id}
                        className="print:hidden px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                        {savingItem === item.id ? 'Saving...' : done ? 'Update Result' : 'Save Result'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Billing */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 print:hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Billing</h2>
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
              isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}>
              {order.payment_status || 'pending'}
            </span>
          </div>

          <table className="w-full mb-4">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100">
                <th className="py-2">Test</th>
                <th className="py-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="border-b border-slate-50">
                  <td className="py-2 text-sm text-slate-900">{i.test_name}</td>
                  <td className="py-2 text-sm text-slate-900 text-right">₹{fmt(Number(i.price))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-2 text-sm font-bold text-slate-900">Total</td>
                <td className="py-2 text-sm font-bold text-slate-900 text-right">₹{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>

          {isPaid ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-4 py-3">
              <span className="material-symbols-outlined text-lg">check_circle</span>
              Payment collected.
            </div>
          ) : isStaff ? (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {(['cash', 'upi', 'debit_card', 'credit_card'] as PaymentMode[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => setPaymentMode(mode)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      paymentMode === mode ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40'
                    }`}>
                    {mode === 'cash' ? 'Cash' : mode === 'upi' ? 'UPI' : mode === 'debit_card' ? 'Debit Card' : 'Credit Card'}
                  </button>
                ))}
              </div>
              {paymentMode !== 'cash' && (
                <input type="text" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder={paymentMode === 'upi' ? 'UPI transaction ID' : 'Card / reference number'}
                  className="w-full max-w-xs mb-3 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              )}
              <button onClick={handleCollectPayment} disabled={processing || total <= 0}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">payment</span>
                {processing ? 'Processing...' : `Collect ₹${fmt(total)}`}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
              <span className="material-symbols-outlined text-lg">schedule</span>
              Payment pending.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LabOrderDetail;
