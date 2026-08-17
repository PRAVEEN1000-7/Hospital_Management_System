import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { PurchaseOrder, Supplier } from '../../types/inventory';
import DateRangeFilter from '../../components/common/DateRangeFilter';
import { formatDateOnly } from '../../utils/calendarDate';
import { htmlStringToPdf } from '../../utils/pdf';
import { canEdit } from '../../config/modulePermissions';
import { PLACE_OF_SUPPLY_LABELS } from '../../utils/gst';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-50 text-blue-700',
  approved: 'bg-emerald-50 text-emerald-700',
  partially_received: 'bg-amber-50 text-amber-700',
  received: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
};

// BRD 5.7 — Payment Status column
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  incomplete: 'Incomplete',
  partial: 'Partial',
};
const PAYMENT_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700',
  incomplete: 'bg-red-50 text-red-600',
  partial: 'bg-amber-50 text-amber-700',
};

const PurchaseOrdersPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null);
  // Print/Download for the detail modal's header — fetched alongside the
  // modal opening, matching pharmacy/SalesList.tsx's View pattern (the
  // modal's structured summary itself is unrelated/unchanged).
  const [detailHtml, setDetailHtml] = useState<string | null>(null);
  const [downloadingDoc, setDownloadingDoc] = useState(false);
  const detailIframeRef = useRef<HTMLIFrameElement>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Role-based access control
  const roleAlias: Record<string, string> = {
    administrator: 'admin',
    hospital_admin: 'admin',
    'inventory-admin': 'inventory_manager',
    inventoryadmin: 'inventory_manager',
  };
  const roles = (user?.roles || []).map(r => {
    const normalized = String(r).trim().toLowerCase();
    return roleAlias[normalized] || normalized;
  });
  const isAdminUser = roles.includes('admin') || roles.includes('super_admin');
  const isInventoryManager = roles.includes('inventory_manager') && !isAdminUser;
  const isPharmacyLogin = roles.includes('pharmacist');
  // "view" access on `inventory` (e.g. pharmacist by default) can see this
  // whole page correctly, but every create/submit/approve/reject/cancel
  // action must be hidden — only "edit" tier gets those.
  const canManagePOs = canEdit('inventory', user?.roles);

  useEffect(() => {
    inventoryService.getSuppliers(1, 100, '', true).then(r => setSuppliers(r.data)).catch(() => {});
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getPurchaseOrders(page, 10, {
        status: statusFilter || undefined,
        supplier_id: supplierFilter || undefined,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        payment_status: paymentStatusFilter || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setOrders(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, supplierFilter, dateFrom, dateTo, paymentStatusFilter, sortBy, sortOrder]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
    setPage(1);
  };
  const sortIcon = (col: string) => sortBy === col ? (sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleStatusChange = async (po: PurchaseOrder, newStatus: string) => {
    try {
      await inventoryService.updatePurchaseOrder(po.id, { status: newStatus });
      toast.success(`PO ${po.po_number} → ${newStatus.replace('_', ' ')}`);
      fetchOrders();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount);

  const [exportingPdf, setExportingPdf] = useState(false);

  // BRD-002: export the currently-filtered/visible Purchase Orders list as a
  // PDF (PO Number, Supplier, Date, Item, Quantity, Unit Price, Total, Status,
  // Created By) — one row per line item, PO-level fields repeated per row.
  // Built entirely client-side from data already loaded for this page (no new
  // backend endpoint needed), fed through the same htmlStringToPdf() every
  // other "Download PDF" feature in this app already uses.
  const handleExportPdf = async () => {
    if (orders.length === 0) {
      toast.error('No purchase orders to export');
      return;
    }
    setExportingPdf(true);
    try {
      const esc = (v: unknown) =>
        String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

      const rows = orders.flatMap(po =>
        (po.items.length > 0 ? po.items : [null]).map(item => `
          <tr>
            <td>${esc(po.po_number)}</td>
            <td>${esc(po.supplier_name || '—')}</td>
            <td>${esc(formatDateOnly(po.order_date))}</td>
            <td>${esc(item?.item_name || '—')}</td>
            <td style="text-align:right;">${item ? esc(item.quantity_ordered) : '—'}</td>
            <td style="text-align:right;">${item ? esc(formatCurrency(item.unit_price)) : '—'}</td>
            <td style="text-align:right;">${item ? esc(formatCurrency(item.total_price)) : esc(formatCurrency(po.total_amount))}</td>
            <td style="text-transform:capitalize;">${esc(po.status.replace('_', ' '))}</td>
            <td>${esc(po.created_by_name || '—')}</td>
          </tr>`).join('')
      ).join('');

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Purchase Orders Export</title>
<style>
body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #1e293b; }
h1 { font-size: 18px; color: #137fec; margin: 0 0 4px; }
p.meta { font-size: 11px; color: #64748b; margin: 0 0 16px; }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th { background: #f1f5f9; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
</style></head>
<body>
<h1>${esc(user?.hospital_name || 'Hospital')} — Purchase Orders</h1>
<p class="meta">Generated ${esc(new Date().toLocaleString())} — ${orders.length} order(s)${statusFilter ? `, status: ${esc(statusFilter.replace('_', ' '))}` : ''}${supplierFilter ? `, supplier filtered` : ''}</p>
<table>
<thead><tr>
  <th>PO Number</th><th>Supplier</th><th>Date</th><th>Item</th>
  <th style="text-align:right;">Quantity</th><th style="text-align:right;">Unit Price</th>
  <th style="text-align:right;">Total</th><th>Status</th><th>Created By</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;

      await htmlStringToPdf(html, `Purchase_Orders_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch {
      toast.error('Failed to export PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  // BRD 5.4 — download a single PO as a proper document (PO number, vendor,
  // items, tax/total, signatory) via the new backend endpoint, distinct from
  // handleExportPdf's client-built bulk list export above.
  const openPODetail = async (po: PurchaseOrder) => {
    setDetailPO(po);
    setDetailHtml(null);
    try {
      const html = await inventoryService.getPurchaseOrderPdfHtml(po.id);
      setDetailHtml(html);
    } catch {
      toast.error('Failed to load purchase order document');
    }
  };

  const closePODetail = () => {
    setDetailPO(null);
    setDetailHtml(null);
  };

  const handlePrintPo = () => {
    detailIframeRef.current?.contentWindow?.print();
  };

  const handleDownloadPo = async () => {
    if (!detailPO || !detailHtml) return;
    setDownloadingDoc(true);
    try {
      await htmlStringToPdf(detailHtml, `PO_${detailPO.po_number}.pdf`);
    } catch {
      toast.error('Failed to download purchase order');
    } finally {
      setDownloadingDoc(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Create and manage purchase orders ({total} total)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportPdf} disabled={exportingPdf || orders.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
            <span className={`material-symbols-outlined text-lg ${exportingPdf ? 'animate-spin' : ''}`}>
              {exportingPdf ? 'progress_activity' : 'picture_as_pdf'}
            </span>
            {exportingPdf ? 'Exporting…' : 'Export PDF'}
          </button>
          {canManagePOs && (
            <button onClick={() => navigate('/inventory/purchase-orders/new')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
              <span className="material-symbols-outlined text-lg">add</span>
              New Purchase Order
            </button>
          )}
        </div>
      </header>

      {/* Workflow legend — the Actions column changes with status, so spell out the
          lifecycle once here instead of relying on hover tooltips alone. */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex items-center gap-2 flex-wrap text-xs text-slate-500">
        <span className="font-semibold text-slate-600">Order flow:</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-100">Draft</span>
        <span>→ Submit →</span>
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Submitted</span>
        <span>→ admin Approves/Rejects →</span>
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Approved</span>
        <span>→ receive goods via GRN →</span>
        <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">Received</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filters */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
              <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by PO number..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="partially_received">Partially Received</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={supplierFilter} onChange={e => { setSupplierFilter(e.target.value); setPage(1); }}
              className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer max-w-[200px]">
              <option value="">All Suppliers</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={paymentStatusFilter} onChange={e => { setPaymentStatusFilter(e.target.value); setPage(1); }}
              className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
              <option value="">All Payment Statuses</option>
              <option value="completed">Completed</option>
              <option value="partial">Partial</option>
              <option value="incomplete">Incomplete</option>
            </select>
          </div>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">receipt_long</span>
            <p className="text-slate-500 mt-3 text-sm">No purchase orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">PO Number</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Supplier</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Order Date</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Expected</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                  <th
                    className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer select-none hover:text-slate-800"
                    onClick={() => toggleSort('payment_status')}
                  >
                    <span className="inline-flex items-center gap-1">Payment Status <span className="material-symbols-outlined text-[13px]">{sortIcon('payment_status')}</span></span>
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map(po => (
                  <tr key={po.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <button onClick={() => openPODetail(po)} className="text-sm font-semibold text-primary hover:underline">{po.po_number}</button>
                      <p className="text-xs text-slate-400">{po.items.length} item(s)</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">{po.supplier_name || '—'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{formatDateOnly(po.order_date)}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{po.expected_delivery_date ? formatDateOnly(po.expected_delivery_date) : '—'}</td>
                    <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">{formatCurrency(po.total_amount)}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[po.status] || 'bg-slate-100 text-slate-600'}`}>
                        {po.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${PAYMENT_STATUS_COLORS[po.payment_status] || 'bg-slate-100 text-slate-600'}`}
                        title={`Paid ${formatCurrency(po.total_paid)} of ${formatCurrency(po.total_amount)}`}
                      >
                        {PAYMENT_STATUS_LABELS[po.payment_status] || po.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {canManagePOs && po.status === 'draft' && (
                          <button onClick={() => handleStatusChange(po, 'submitted')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Send this draft to an admin for approval">
                            <span className="material-symbols-outlined text-[15px]">send</span> Submit
                          </button>
                        )}
                        {canManagePOs && po.status === 'submitted' && isAdminUser && (
                          <>
                            <button onClick={() => handleStatusChange(po, 'approved')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                              title="Approve this order so it can be sent to the supplier">
                              <span className="material-symbols-outlined text-[15px]">check_circle</span> Approve
                            </button>
                            <button onClick={() => handleStatusChange(po, 'cancelled')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                              title="Reject this order — it will be cancelled">
                              <span className="material-symbols-outlined text-[15px]">cancel</span> Reject
                            </button>
                          </>
                        )}
                        {canManagePOs && po.status === 'draft' && !isAdminUser && (
                          <button onClick={() => handleStatusChange(po, 'cancelled')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            title="Cancel this draft order">
                            <span className="material-symbols-outlined text-[15px]">cancel</span> Cancel
                          </button>
                        )}
                        <button onClick={() => openPODetail(po)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          title="View full order details and line items">
                          <span className="material-symbols-outlined text-[15px]">visibility</span> View
                        </button>
                        {canManagePOs && isAdminUser && !['draft', 'cancelled'].includes(po.status) && (
                          <button onClick={() => navigate(`/inventory/purchase-orders/${po.id}/payments`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                            title="Record and view vendor payments for this order">
                            <span className="material-symbols-outlined text-[15px]">payments</span> Payments
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors">Previous</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closePODetail} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{detailPO.po_number}</h2>
                <p className="text-sm text-slate-500">{detailPO.supplier_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintPo}
                  disabled={!detailHtml}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">print</span> Print
                </button>
                <button
                  onClick={handleDownloadPo}
                  disabled={!detailHtml || downloadingDoc}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/5 border border-primary/20 rounded-lg hover:bg-primary/10 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  {downloadingDoc ? 'Preparing…' : 'Download'}
                </button>
                <button onClick={closePODetail} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                  <span className="material-symbols-outlined text-slate-500">close</span>
                </button>
              </div>
            </div>
            {/* Off-screen (not display:none) iframe carrying the print-ready
                HTML for the Print button above — kept off-screen rather
                than hidden so the browser actually lays it out; some
                browsers won't print a display:none iframe. */}
            <iframe
              ref={detailIframeRef}
              srcDoc={detailHtml || undefined}
              title={`Purchase Order ${detailPO.po_number}`}
              className="fixed -left-[9999px] top-0 h-[1px] w-[1px] border-0"
              aria-hidden="true"
            />
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Order Date</p>
                  <p className="text-sm font-medium text-slate-900">{formatDateOnly(detailPO.order_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Expected Delivery</p>
                  <p className="text-sm font-medium text-slate-900">{detailPO.expected_delivery_date ? formatDateOnly(detailPO.expected_delivery_date) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize mt-0.5 ${STATUS_COLORS[detailPO.status] || 'bg-slate-100 text-slate-600'}`}>
                    {detailPO.status.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Total Amount</p>
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(detailPO.total_amount)}</p>
                </div>
                {detailPO.place_of_supply_type && (
                  <div>
                    <p className="text-xs text-slate-400">Place of Supply</p>
                    <p className="text-sm font-medium text-slate-900">{PLACE_OF_SUPPLY_LABELS[detailPO.place_of_supply_type]}</p>
                  </div>
                )}
              </div>

              {detailPO.notes && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Notes</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{detailPO.notes}</p>
                </div>
              )}

              {/* Items Table */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3">Order Items</h3>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600">Item</th>
                        <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">Ordered</th>
                        <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">Received</th>
                        <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">Unit Price</th>
                        <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">Disc%</th>
                        <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">Taxable</th>
                        <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">GST%</th>
                        <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailPO.items.map(item => (
                        <tr key={item.id}>
                          <td className="px-3 py-3 text-sm text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className="material-icons text-slate-400 text-sm">
                                {item.item_type === 'medicine' ? 'medication' : 'inventory_2'}
                              </span>
                              {item.item_name || (
                                <span className="text-slate-400 text-xs font-mono">
                                  {item.item_id.substring(0, 8)}...
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm text-right text-slate-700">{item.quantity_ordered}</td>
                          <td className="px-3 py-3 text-sm text-right">
                            <span className={`inline-flex items-center gap-1 ${
                              item.quantity_received >= item.quantity_ordered
                                ? 'text-emerald-600 font-semibold'
                                : item.quantity_received > 0
                                ? 'text-amber-600'
                                : 'text-slate-400'
                            }`}>
                              {item.quantity_received > 0 && (
                                <span className="material-icons text-xs">check_circle</span>
                              )}
                              {item.quantity_received}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-sm text-right text-slate-700">{formatCurrency(item.unit_price)}</td>
                          <td className="px-3 py-3 text-sm text-right text-slate-500">{Number(item.discount_percent || 0)}%</td>
                          <td className="px-3 py-3 text-sm text-right text-slate-700">{formatCurrency(item.taxable_amount)}</td>
                          <td className="px-3 py-3 text-sm text-right text-slate-500">{Number(item.gst_rate || 0)}%</td>
                          <td className="px-3 py-3 text-sm text-right font-semibold text-slate-900">{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* GST Summary — mirrors the PDF's summary block exactly, so
                  what's printed matches what's shown on screen. Only the
                  component(s) that apply to this PO's place of supply are
                  shown (never CGST+SGST alongside IGST, etc.). */}
              <div className="flex justify-end">
                <div className="w-full sm:w-80 space-y-1.5 text-sm bg-slate-50 rounded-lg border border-slate-200 p-4">
                  <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(detailPO.subtotal)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{formatCurrency(detailPO.discount_amount)}</span></div>
                  <div className="flex justify-between text-slate-500 pb-1.5 border-b border-slate-200"><span>Taxable Amount</span><span>{formatCurrency(detailPO.taxable_amount)}</span></div>
                  {detailPO.place_of_supply_type === 'intra_state' && (
                    <>
                      <div className="flex justify-between text-slate-500"><span>CGST</span><span>{formatCurrency(detailPO.cgst_amount)}</span></div>
                      <div className="flex justify-between text-slate-500"><span>SGST</span><span>{formatCurrency(detailPO.sgst_amount)}</span></div>
                    </>
                  )}
                  {detailPO.place_of_supply_type === 'union_territory' && (
                    <>
                      <div className="flex justify-between text-slate-500"><span>CGST</span><span>{formatCurrency(detailPO.cgst_amount)}</span></div>
                      <div className="flex justify-between text-slate-500"><span>UGST</span><span>{formatCurrency(detailPO.ugst_amount)}</span></div>
                    </>
                  )}
                  {detailPO.place_of_supply_type === 'inter_state' && (
                    <div className="flex justify-between text-slate-500"><span>IGST</span><span>{formatCurrency(detailPO.igst_amount)}</span></div>
                  )}
                  <div className="flex justify-between font-bold text-slate-900 text-base pt-1.5 border-t border-slate-200">
                    <span>Grand Total</span><span>{formatCurrency(detailPO.total_amount)}</span>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400 flex flex-wrap gap-4">
                {detailPO.created_by_name && <span>Created by: {detailPO.created_by_name}</span>}
                {detailPO.approved_by_name && <span>Approved by: {detailPO.approved_by_name}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrdersPage;
