import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/pharmacy';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';

const STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  submitted: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved: 'bg-blue-100 text-blue-700 border-blue-200',
  ordered: 'bg-purple-100 text-purple-700 border-purple-200',
  received: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  ordered: 'Ordered',
  received: 'Received',
  cancelled: 'Cancelled',
};

const PurchaseOrderList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pharmacyService.getPurchaseOrders(
        1,
        100,
        statusFilter || undefined,
        undefined,
        dateFrom || undefined,
        dateTo || undefined
      );
      setOrders(res.data);
    } catch (err: any) {
      console.error('Failed to load purchase orders:', err);
      toast.error(err?.response?.data?.detail || 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo, toast]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleAction = async (orderId: string, action: string, confirmMessage?: string) => {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setActionLoading(action);
    try {
      switch (action) {
        case 'submit':
          await pharmacyService.submitPurchaseOrder(orderId);
          toast.success('Purchase order submitted successfully');
          break;
        case 'approve':
          await pharmacyService.approvePurchaseOrder(orderId);
          toast.success('Purchase order approved successfully');
          break;
        case 'place':
          await pharmacyService.placePurchaseOrder(orderId);
          toast.success('Purchase order placed with supplier');
          break;
        case 'receive':
          await pharmacyService.receivePurchaseOrder(orderId);
          toast.success('Purchase order received and stock updated');
          break;
        case 'cancel':
          const reason = prompt('Enter cancellation reason (optional):');
          await pharmacyService.cancelPurchaseOrder(orderId, reason || undefined);
          toast.success('Purchase order cancelled');
          break;
        case 'delete':
          if (!window.confirm('Are you sure you want to delete this purchase order? This action cannot be undone.')) {
            setActionLoading(null);
            return;
          }
          await pharmacyService.deletePurchaseOrder(orderId);
          toast.success('Purchase order deleted');
          break;
      }
      fetchOrders();
    } catch (err: any) {
      console.error(`Failed to ${action} purchase order:`, err);
      toast.error(err?.response?.data?.detail || `Failed to ${action} purchase order`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewDetails = async (orderId: string) => {
    try {
      const order = await pharmacyService.getPurchaseOrder(orderId);
      setSelectedOrder(order);
      setShowDetailModal(true);
    } catch (err: any) {
      toast.error('Failed to load purchase order details');
    }
  };

  const filteredOrders = orders.filter(order => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(query) ||
      order.supplier_name?.toLowerCase().includes(query) ||
      order.supplier_contact_person?.toLowerCase().includes(query)
    );
  });

  const getStatusActions = (order: PurchaseOrder) => {
    const actions: Array<{ label: string; action: string; color: string; icon: string; confirm?: string }> = [];

    switch (order.status) {
      case 'draft':
        actions.push(
          { label: 'Submit', action: 'submit', color: 'blue', icon: 'send', confirm: 'Submit this order for approval?' },
          { label: 'Edit', action: 'edit', color: 'slate', icon: 'edit' },
          { label: 'Delete', action: 'delete', color: 'red', icon: 'delete', confirm: 'Delete this draft order?' }
        );
        break;
      case 'submitted':
        actions.push(
          { label: 'Approve', action: 'approve', color: 'blue', icon: 'check_circle', confirm: 'Approve this order?' },
          { label: 'View', action: 'view', color: 'slate', icon: 'visibility' }
        );
        break;
      case 'approved':
        actions.push(
          { label: 'Place Order', action: 'place', color: 'purple', icon: 'local_shipping', confirm: 'Send this order to the supplier?' },
          { label: 'View', action: 'view', color: 'slate', icon: 'visibility' }
        );
        break;
      case 'ordered':
        actions.push(
          { label: 'Receive', action: 'receive', color: 'green', icon: 'inventory', confirm: 'Mark this order as received?' },
          { label: 'Cancel', action: 'cancel', color: 'red', icon: 'cancel', confirm: 'Cancel this order?' },
          { label: 'View', action: 'view', color: 'slate', icon: 'visibility' }
        );
        break;
      case 'received':
        actions.push(
          { label: 'View', action: 'view', color: 'slate', icon: 'visibility' }
        );
        break;
      case 'cancelled':
        actions.push(
          { label: 'View', action: 'view', color: 'slate', icon: 'visibility' },
          { label: 'Delete', action: 'delete', color: 'red', icon: 'delete', confirm: 'Delete this cancelled order?' }
        );
        break;
    }

    return actions;
  };

  const handleActionClick = (action: { action: string; label: string; confirm?: string }, order: PurchaseOrder) => {
    if (action.action === 'edit') {
      navigate(`/pharmacy/purchase-orders/${order.id}/edit`);
    } else if (action.action === 'view') {
      handleViewDetails(order.id);
    } else {
      handleAction(order.id, action.action, action.confirm);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and track your medicine procurement</p>
        </div>
        <button
          onClick={() => navigate('/pharmacy/purchase-orders/new')}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          New Order
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <span className="material-symbols-outlined text-lg">search</span>
            </span>
            <input
              type="text"
              placeholder="Search by order # or supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="From"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="To"
            />
          </div>

          {/* Clear Filters */}
          {(searchQuery || dateFrom || dateTo || statusFilter) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setDateFrom('');
                setDateTo('');
                setStatusFilter('');
              }}
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          <button
            key="all"
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
              statusFilter === ''
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Orders
          </button>
          {(['draft', 'submitted', 'approved', 'ordered', 'received', 'cancelled'] as PurchaseOrderStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                statusFilter === status
                  ? STATUS_COLORS[status] + ' shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            <p className="text-sm text-slate-500 mt-3">Loading purchase orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-6">
            <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">inventory_2</span>
            <p className="font-semibold text-slate-700">No purchase orders found</p>
            <p className="text-sm text-slate-500 mt-1">
              {searchQuery || statusFilter || dateFrom || dateTo
                ? 'Try adjusting your filters'
                : 'Create your first purchase order to get started'}
            </p>
            {!searchQuery && !statusFilter && !dateFrom && !dateTo && (
              <button
                onClick={() => navigate('/pharmacy/purchase-orders/new')}
                className="mt-4 px-4 py-2 text-sm font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
              >
                Create Order
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Order #</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Supplier</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Order Date</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Expected Delivery</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600 text-center">Items</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600 text-right">Total Amount</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3.5 font-semibold text-slate-600 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleViewDetails(po.id)}
                        className="font-semibold text-primary hover:text-primary/80 hover:underline"
                      >
                        {po.order_number}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{po.supplier_name || '-'}</div>
                      {po.supplier_contact_person && (
                        <div className="text-xs text-slate-500">{po.supplier_contact_person}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {po.expected_delivery ? format(new Date(po.expected_delivery), 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-700 rounded">
                        {po.items?.length || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      ₹{Number(po.total_amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${
                          STATUS_COLORS[po.status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {STATUS_LABELS[po.status] || po.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {getStatusActions(po).map((action) => (
                          <button
                            key={action.action}
                            onClick={() => handleActionClick(action, po)}
                            disabled={actionLoading === action.action}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                              action.color === 'blue'
                                ? 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                                : action.color === 'green'
                                ? 'text-green-700 bg-green-50 hover:bg-green-100'
                                : action.color === 'red'
                                ? 'text-red-700 bg-red-50 hover:bg-red-100'
                                : action.color === 'purple'
                                ? 'text-purple-700 bg-purple-50 hover:bg-purple-100'
                                : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title={action.label}
                          >
                            {actionLoading === action.action ? (
                              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                            ) : (
                              <span className="material-symbols-outlined text-sm">{action.icon}</span>
                            )}
                            <span className="hidden lg:inline">{action.label}</span>
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedOrder && (
        <PurchaseOrderDetailModal
          order={selectedOrder}
          onClose={() => setShowDetailModal(false)}
          onAction={(action, confirm) => handleAction(selectedOrder.id, action, confirm)}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
};

// Detail Modal Component
interface PurchaseOrderDetailModalProps {
  order: PurchaseOrder;
  onClose: () => void;
  onAction: (action: string, confirm?: string) => void;
  actionLoading: string | null;
}

const PurchaseOrderDetailModal: React.FC<PurchaseOrderDetailModalProps> = ({
  order,
  onClose,
  onAction,
  actionLoading,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Purchase Order Details</h2>
            <p className="text-sm text-slate-500">{order.order_number}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-6 max-h-[calc(90vh-180px)]">
          {/* Status & Key Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500 uppercase font-semibold">Status</div>
              <div className="mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ${
                    STATUS_COLORS[order.status]
                  }`}
                >
                  {STATUS_LABELS[order.status]}
                </span>
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500 uppercase font-semibold">Order Date</div>
              <div className="mt-1 font-semibold text-slate-900">
                {order.order_date ? format(new Date(order.order_date), 'dd MMM yyyy') : '-'}
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500 uppercase font-semibold">Expected Delivery</div>
              <div className="mt-1 font-semibold text-slate-900">
                {order.expected_delivery ? format(new Date(order.expected_delivery), 'dd MMM yyyy') : 'Not set'}
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500 uppercase font-semibold">Total Amount</div>
              <div className="mt-1 font-bold text-primary">₹{Number(order.total_amount || 0).toFixed(2)}</div>
            </div>
          </div>

          {/* Supplier Info */}
          <div className="bg-slate-50 rounded-lg p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Supplier Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500">Supplier Name</div>
                <div className="font-medium text-slate-900">{order.supplier_name || '-'}</div>
              </div>
              {order.supplier_contact_person && (
                <div>
                  <div className="text-xs text-slate-500">Contact Person</div>
                  <div className="font-medium text-slate-900">{order.supplier_contact_person}</div>
                </div>
              )}
              {order.supplier_phone && (
                <div>
                  <div className="text-xs text-slate-500">Phone</div>
                  <div className="font-medium text-slate-900">{order.supplier_phone}</div>
                </div>
              )}
              {order.supplier_email && (
                <div>
                  <div className="text-xs text-slate-500">Email</div>
                  <div className="font-medium text-slate-900">{order.supplier_email}</div>
                </div>
              )}
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">Order Items</h3>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">#</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Medicine</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Qty</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Unit Price</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items?.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{item.medicine_name || 'Unknown'}</div>
                        {item.medicine_generic_name && (
                          <div className="text-xs text-slate-500">{item.medicine_generic_name}</div>
                        )}
                        {item.medicine_strength && (
                          <div className="text-xs text-slate-500">{item.medicine_strength}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700">{item.quantity_ordered}</td>
                      <td className="px-4 py-3 text-right text-slate-700">₹{item.unit_price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">₹{item.total_price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-semibold text-slate-600">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-primary">₹{order.total_amount.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">note</span>
                Notes
              </h3>
              <p className="text-sm text-amber-800">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
          {order.status === 'draft' && (
            <button
              onClick={() => onAction('submit', 'Submit this order for approval?')}
              disabled={!!actionLoading}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'submit' ? 'Submitting...' : 'Submit Order'}
            </button>
          )}
          {order.status === 'submitted' && (
            <button
              onClick={() => onAction('approve', 'Approve this order?')}
              disabled={!!actionLoading}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'approve' ? 'Approving...' : 'Approve Order'}
            </button>
          )}
          {order.status === 'approved' && (
            <button
              onClick={() => onAction('place', 'Send this order to the supplier?')}
              disabled={!!actionLoading}
              className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'place' ? 'Placing...' : 'Place Order'}
            </button>
          )}
          {order.status === 'ordered' && (
            <>
              <button
                onClick={() => onAction('cancel', 'Cancel this order?')}
                disabled={!!actionLoading}
                className="px-4 py-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Order'}
              </button>
              <button
                onClick={() => onAction('receive', 'Mark this order as received?')}
                disabled={!!actionLoading}
                className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'receive' ? 'Receiving...' : 'Receive Order'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderList;
