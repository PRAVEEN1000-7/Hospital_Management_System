import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { PurchaseOrder } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  ordered: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

const PurchaseOrderList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [total, setTotal] = useState(0);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pharmacyService.getPurchaseOrders(1, 100, statusFilter || undefined);
      setOrders(res.data || []);
      setTotal(res.total || 0);
    } catch (error) {
      console.error('Failed to load purchase orders:', error);
      toast.error('Failed to load purchase orders');
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Manage medicine purchase orders ({total} total)</p>
        </div>
        <button onClick={() => navigate('/pharmacy/purchase-orders/new')}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-md">
          <span className="material-symbols-outlined text-lg">add</span> New Order
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-blue-500 text-xl mt-0.5">info</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-blue-900">Purchase Orders</p>
          <p className="text-xs text-blue-700 mt-1">
            Create purchase orders to restock medicines from suppliers. Orders created here will also appear in Inventory module.
          </p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {['', 'draft', 'ordered', 'received', 'cancelled'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              statusFilter === s 
                ? 'bg-primary text-white border-primary shadow-sm' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}>
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            {s === '' && total > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded text-[10px]">{total}</span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">local_shipping</span>
            <p className="text-lg font-semibold text-slate-700 mt-4">No purchase orders found</p>
            <p className="text-sm text-slate-500 mt-1 mb-4">
              {statusFilter ? `No ${statusFilter} purchase orders` : 'Create your first purchase order'}
            </p>
            {!statusFilter && (
              <button onClick={() => navigate('/pharmacy/purchase-orders/new')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
                <span className="material-symbols-outlined text-base">add</span> Create Order
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Order #</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Supplier</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Items</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Total</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map(po => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-primary">{po.order_number}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{po.supplier_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{po.items?.length || 0}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      ₹{Number(po.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[po.status] || 'bg-slate-100 text-slate-600'}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {po.status === 'draft' && (
                          <button onClick={() => navigate(`/pharmacy/purchase-orders/${po.id}`)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                            Edit
                          </button>
                        )}
                        {po.status === 'ordered' && (
                          <>
                            <button onClick={async () => {
                              if (!window.confirm('Mark this order as received?')) return;
                              try {
                                await pharmacyService.receivePurchaseOrder(po.id);
                                toast.success('Order marked as received');
                                fetchOrders();
                              } catch { 
                                toast.error('Failed to receive order'); 
                              }
                            }}
                              className="px-2.5 py-1.5 text-xs font-semibold text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                              Receive
                            </button>
                            <button onClick={() => navigate(`/pharmacy/purchase-orders/${po.id}`)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                              View
                            </button>
                          </>
                        )}
                        {po.status === 'received' && (
                          <button onClick={() => navigate(`/pharmacy/purchase-orders/${po.id}`)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                            View
                          </button>
                        )}
                        {po.status === 'cancelled' && (
                          <span className="text-xs text-slate-400">Cancelled</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PurchaseOrderList;
