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
  cancelled: 'bg-red-100 text-red-700',
};

const PurchaseOrderList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pharmacyService.getPurchaseOrders(1, 100, statusFilter || undefined);
      setOrders(res.data);
    } catch {
      toast.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
        <button onClick={() => navigate('/pharmacy/purchase-orders/new')}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90">
          <span className="material-symbols-outlined text-lg">add</span> New Order
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {['', 'draft', 'ordered', 'received', 'cancelled'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${statusFilter === s ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 block">inventory_2</span>
            <p className="font-medium">No purchase orders found</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Order #</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Supplier</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Items</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Total</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map(po => (
                <tr key={po.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{po.order_number}</td>
                  <td className="px-4 py-3 text-slate-600">{po.supplier_name || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{po.items?.length || 0}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">₹{Number(po.total_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[po.status] || ''}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {po.status === 'ordered' && (
                        <button onClick={async () => {
                          if (!window.confirm('Mark this order as received?')) return;
                          try {
                            await pharmacyService.receivePurchaseOrder(po.id);
                            toast.success('Order marked as received');
                            fetchOrders();
                          } catch { toast.error('Failed to receive order'); }
                        }}
                          className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-50 rounded-lg hover:bg-green-100">
                          Receive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PurchaseOrderList;
