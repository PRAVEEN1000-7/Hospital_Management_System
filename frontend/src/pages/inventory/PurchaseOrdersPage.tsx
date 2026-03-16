import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import type { PurchaseOrder, Supplier } from '../../types/inventory';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-50 text-blue-700',
  approved: 'bg-emerald-50 text-emerald-700',
  partially_received: 'bg-amber-50 text-amber-700',
  received: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
};

const PurchaseOrdersPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null);

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
  }, [page, search, statusFilter, supplierFilter]);

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

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Create and manage purchase orders ({total} total)</p>
        </div>
        <button onClick={() => navigate('/inventory/purchase-orders/new')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          New Purchase Order
        </button>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filters */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
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
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">PO Number</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden md:table-cell">Supplier</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden lg:table-cell">Order Date</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden lg:table-cell">Expected</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map(po => (
                  <tr key={po.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <button onClick={() => setDetailPO(po)} className="text-sm font-semibold text-primary hover:underline">{po.po_number}</button>
                      <p className="text-xs text-slate-400">{po.items.length} item(s)</p>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell text-sm text-slate-700">{po.supplier_name || '—'}</td>
                    <td className="px-4 py-4 hidden lg:table-cell text-sm text-slate-600">{new Date(po.order_date).toLocaleDateString()}</td>
                    <td className="px-4 py-4 hidden lg:table-cell text-sm text-slate-600">{po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">{formatCurrency(po.total_amount)}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[po.status] || 'bg-slate-100 text-slate-600'}`}>
                        {po.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {po.status === 'draft' && (
                          <button onClick={() => handleStatusChange(po, 'submitted')} className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title="Submit">
                            <span className="material-symbols-outlined text-lg text-blue-500">send</span>
                          </button>
                        )}
                        {po.status === 'submitted' && (
                          <button onClick={() => handleStatusChange(po, 'approved')} className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors" title="Approve">
                            <span className="material-symbols-outlined text-lg text-emerald-500">check_circle</span>
                          </button>
                        )}
                        {(po.status === 'draft' || po.status === 'submitted') && (
                          <button onClick={() => handleStatusChange(po, 'cancelled')} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Cancel">
                            <span className="material-symbols-outlined text-lg text-red-400">cancel</span>
                          </button>
                        )}
                        <button onClick={() => setDetailPO(po)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="View Details">
                          <span className="material-symbols-outlined text-lg text-slate-500">visibility</span>
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
      {detailPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetailPO(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{detailPO.po_number}</h2>
                <p className="text-sm text-slate-500">{detailPO.supplier_name}</p>
              </div>
              <button onClick={() => setDetailPO(null)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Order Date</p>
                  <p className="text-sm font-medium text-slate-900">{new Date(detailPO.order_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Expected Delivery</p>
                  <p className="text-sm font-medium text-slate-900">{detailPO.expected_delivery_date ? new Date(detailPO.expected_delivery_date).toLocaleDateString() : '—'}</p>
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
                          <td className="px-3 py-3 text-sm text-right font-semibold text-slate-900">{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
