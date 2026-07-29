import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { GoodsReceiptNote } from '../../types/inventory';
import DateRangeFilter from '../../components/common/DateRangeFilter';
import { formatDateOnly } from '../../utils/calendarDate';
import { htmlStringToPdf } from '../../utils/pdf';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  verified: 'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
};

const GRNsPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [grns, setGRNs] = useState<GoodsReceiptNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [detailGRN, setDetailGRN] = useState<GoodsReceiptNote | null>(null);

  const fetchGRNs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getGRNs(page, 10, {
        status: statusFilter || undefined,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setGRNs(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load GRNs');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, dateFrom, dateTo]);

  useEffect(() => { fetchGRNs(); }, [fetchGRNs]);

  const handleStatusChange = async (grn: GoodsReceiptNote, newStatus: string) => {
    try {
      await inventoryService.updateGRN(grn.id, { status: newStatus });
      toast.success(`GRN ${grn.grn_number} → ${newStatus}`);
      fetchGRNs();
      if (detailGRN?.id === grn.id) setDetailGRN(null);
    } catch {
      toast.error('Failed to update GRN status');
    }
  };

  // BRD 5.5 — download a single GRN as a proper document.
  const [downloadingGrnId, setDownloadingGrnId] = useState<string | null>(null);
  const handleDownloadGrn = async (grn: GoodsReceiptNote) => {
    if (downloadingGrnId) return;
    setDownloadingGrnId(grn.id);
    try {
      const html = await inventoryService.getGRNPdfHtml(grn.id);
      await htmlStringToPdf(html, `GRN_${grn.grn_number}.pdf`);
    } catch {
      toast.error('Failed to download GRN');
    } finally {
      setDownloadingGrnId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Goods Receipt Notes</h1>
          <p className="text-sm text-slate-500 mt-1">Receive and verify incoming goods ({total} total)</p>
        </div>
        <button onClick={() => navigate('/inventory/grns/new')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          New GRN
        </button>
      </header>

      {/* Workflow legend — the Actions column changes with status. */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex items-center gap-2 flex-wrap text-xs text-slate-500">
        <span className="font-semibold text-slate-600">Receipt flow:</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Pending</span>
        <span>→ check the delivery, Verify →</span>
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Verified</span>
        <span>→ Accept updates stock, or Reject →</span>
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Accepted</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filters */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
              <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by GRN number..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
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
        ) : grns.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">local_shipping</span>
            <p className="text-slate-500 mt-3 text-sm">No goods receipt notes found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">GRN Number</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">PO Number</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Received Date</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Items</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grns.map(grn => (
                  <tr key={grn.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <button onClick={() => setDetailGRN(grn)} className="text-sm font-semibold text-primary hover:underline">{grn.grn_number}</button>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">{grn.po_number || '—'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{formatDateOnly(grn.receipt_date)}</td>
                    <td className="px-4 py-4 text-center text-sm text-slate-700">{grn.items.length}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[grn.status] || 'bg-slate-100 text-slate-600'}`}>
                        {grn.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {grn.status === 'pending' && (
                          <button onClick={() => handleStatusChange(grn, 'verified')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Confirm the delivered items/quantities match this receipt">
                            <span className="material-symbols-outlined text-[15px]">verified</span> Verify
                          </button>
                        )}
                        {grn.status === 'verified' && (
                          <>
                            <button onClick={() => handleStatusChange(grn, 'accepted')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                              title="Accept — adds these items to stock and creates batches">
                              <span className="material-symbols-outlined text-[15px]">check_circle</span> Accept &amp; Update Stock
                            </button>
                            <button onClick={() => handleStatusChange(grn, 'rejected')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                              title="Reject this delivery — no stock will be added">
                              <span className="material-symbols-outlined text-[15px]">cancel</span> Reject
                            </button>
                          </>
                        )}
                        <button onClick={() => setDetailGRN(grn)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          title="View full receipt details and line items">
                          <span className="material-symbols-outlined text-[15px]">visibility</span> View
                        </button>
                        {grn.status === 'pending' && (
                          <button onClick={() => navigate(`/inventory/grns/${grn.id}`)}
                            className="inline-flex items-center gap-1 p-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Correct batch/quantity details while this GRN is still Pending">
                            <span className="material-symbols-outlined text-[15px]">edit</span>
                          </button>
                        )}
                        <button onClick={() => handleDownloadGrn(grn)} disabled={downloadingGrnId === grn.id}
                          className="inline-flex items-center gap-1 p-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                          title="Download this GRN as a PDF">
                          <span className={`material-symbols-outlined text-[15px] ${downloadingGrnId === grn.id ? 'animate-spin' : ''}`}>
                            {downloadingGrnId === grn.id ? 'progress_activity' : 'download'}
                          </span>
                        </button>
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
      {detailGRN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetailGRN(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{detailGRN.grn_number}</h2>
                <p className="text-sm text-slate-500">PO: {detailGRN.po_number || '—'}</p>
              </div>
              <button onClick={() => setDetailGRN(null)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Received Date</p>
                  <p className="text-sm font-medium text-slate-900">{formatDateOnly(detailGRN.receipt_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize mt-0.5 ${STATUS_COLORS[detailGRN.status]}`}>
                    {detailGRN.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Verified By</p>
                  <p className="text-sm font-medium text-slate-900">{detailGRN.verified_by_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Invoice Number</p>
                  <p className="text-sm font-medium text-slate-900">{detailGRN.invoice_number || '—'}</p>
                </div>
              </div>

              {detailGRN.notes && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Notes</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{detailGRN.notes}</p>
                </div>
              )}

              {/* Items Table */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3">Received Items</h3>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600">Item</th>
                        <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-600">Qty Received</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600">Batch No</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600">Expiry Date</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-600">Rejection Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailGRN.items.map(item => (
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
                          <td className="px-3 py-3 text-sm text-right">
                            <span className={`inline-flex items-center gap-1 ${
                              item.quantity_accepted && item.quantity_accepted >= item.quantity_received
                                ? 'text-emerald-600 font-semibold'
                                : 'text-slate-700'
                            }`}>
                              {item.quantity_accepted !== null && item.quantity_accepted !== item.quantity_received && (
                                <span className="material-icons text-xs">
                                  {item.quantity_accepted > item.quantity_received ? 'add_circle' : 'remove_circle'}
                                </span>
                              )}
                              {item.quantity_accepted !== null ? item.quantity_accepted : item.quantity_received}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-600">
                            {item.batch_number || (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-600">
                            {item.expiry_date ? (
                              <span className={
                                new Date(item.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                                  ? 'text-red-600 font-semibold'
                                  : 'text-slate-600'
                              }>
                                {formatDateOnly(item.expiry_date)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-600">
                            {item.rejection_reason ? (
                              <span className="text-red-600">{item.rejection_reason}</span>
                            ) : (
                              <span className="text-emerald-600 text-xs flex items-center gap-1">
                                <span className="material-icons text-xs">check_circle</span>
                                Accepted
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons in Modal */}
              {(detailGRN.status === 'pending' || detailGRN.status === 'verified') && (
                <div className="flex justify-end gap-3 pt-2">
                  {detailGRN.status === 'pending' && (
                    <button onClick={() => handleStatusChange(detailGRN, 'verified')} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                      Mark Verified
                    </button>
                  )}
                  {detailGRN.status === 'verified' && (
                    <>
                      <button onClick={() => handleStatusChange(detailGRN, 'rejected')} className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors">
                        Reject
                      </button>
                      <button onClick={() => handleStatusChange(detailGRN, 'accepted')} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors">
                        Accept &amp; Update Stock
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GRNsPage;
