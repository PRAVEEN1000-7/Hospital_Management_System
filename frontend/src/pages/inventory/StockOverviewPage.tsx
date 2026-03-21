import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import productsService from '../../services/productsService';
import type { StockDashboard, StockSummary, StockAlert, LowStockItem, ExpiringItem } from '../../types/products';

const StockOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [dashboard, setDashboard] = useState<StockDashboard | null>(null);
  const [stockItems, setStockItems] = useState<StockSummary[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'low-stock' | 'expiring' | 'alerts'>('overview');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const CATEGORIES = ['medicine', 'optical', 'surgical', 'equipment', 'laboratory', 'disposable', 'other'];

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await productsService.getStockDashboard();
      setDashboard(data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  }, []);

  const fetchStockOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productsService.getStockOverview(page, 20, {
        search: search || undefined,
        category: categoryFilter || undefined,
        low_stock_only: lowStockOnly,
      });
      setStockItems(res.data);
      setTotalPages(res.total_pages);
    } catch (err) {
      toast.error('Failed to load stock overview');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, lowStockOnly, toast]);

  const fetchLowStock = useCallback(async () => {
    try {
      const data = await productsService.getLowStock(50);
      setLowStockItems(data);
    } catch (err) {
      console.error('Failed to load low stock:', err);
    }
  }, []);

  const fetchExpiring = useCallback(async () => {
    try {
      const data = await productsService.getExpiringItems(90, 50);
      setExpiringItems(data);
    } catch (err) {
      console.error('Failed to load expiring items:', err);
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await productsService.getAlerts(1, 20, { unresolved_only: true });
      setAlerts(res.data);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (activeTab === 'overview') fetchStockOverview();
    if (activeTab === 'low-stock') fetchLowStock();
    if (activeTab === 'expiring') fetchExpiring();
    if (activeTab === 'alerts') fetchAlerts();
  }, [activeTab, fetchStockOverview, fetchLowStock, fetchExpiring, fetchAlerts]);

  const handleResolveAlert = async (alertId: string) => {
    try {
      await productsService.resolveAlert(alertId);
      toast.success('Alert resolved');
      fetchAlerts();
    } catch {
      toast.error('Failed to resolve alert');
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await productsService.acknowledgeAlert(alertId);
      toast.success('Alert acknowledged');
      fetchAlerts();
    } catch {
      toast.error('Failed to acknowledge alert');
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getAlertTypeIcon = (type: string) => {
    switch (type) {
      case 'low_stock': return 'warning';
      case 'expiring_soon':
      case 'near_expiry': return 'schedule';
      case 'expired': return 'error';
      case 'overstocked': return 'inventory_2';
      default: return 'info';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Overview</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor inventory levels, alerts, and expiring items</p>
        </div>
        <button
          onClick={() => navigate('/inventory/products')}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90"
        >
          Manage Products
        </button>
      </header>

      {/* Dashboard Stats */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <StatCard label="Total Products" value={dashboard.total_products} icon="inventory" color="blue" />
          <StatCard label="Active Products" value={dashboard.active_products} icon="check_circle" color="green" />
          <StatCard label="Stock Value" value={formatCurrency(dashboard.total_stock_value)} icon="account_balance_wallet" color="purple" />
          <StatCard label="Low Stock" value={dashboard.low_stock_count} icon="warning" color="amber" />
          <StatCard label="Expiring Soon" value={dashboard.expiring_soon_count} icon="schedule" color="orange" />
          <StatCard label="Expired" value={dashboard.expired_count} icon="error" color="red" />
          <StatCard label="Total Alerts" value={dashboard.total_alerts} icon="notifications" color="blue" />
          <StatCard label="Critical" value={dashboard.critical_alerts} icon="priority_high" color="red" />
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-200">
          <nav className="flex gap-4 px-4">
            {[
              { id: 'overview', label: 'Stock Overview', icon: 'dashboard' },
              { id: 'low-stock', label: 'Low Stock', icon: 'warning', count: dashboard?.low_stock_count },
              { id: 'expiring', label: 'Expiring', icon: 'schedule', count: dashboard?.expiring_soon_count },
              { id: 'alerts', label: 'Alerts', icon: 'notifications', count: dashboard?.total_alerts },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as typeof activeTab); setPage(1); }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                    <input
                      type="text"
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                      placeholder="Search products..."
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                </div>
                <select
                  value={categoryFilter}
                  onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lowStockOnly}
                    onChange={e => setLowStockOnly(e.target.checked)}
                    className="rounded text-primary focus:ring-primary"
                  />
                  Low Stock Only
                </label>
              </div>

              {/* Table */}
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
                </div>
              ) : stockItems.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <span className="material-symbols-outlined text-5xl text-slate-300">inventory_2</span>
                  <p className="mt-3">No stock items found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Category</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Stock</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Value</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Status</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Expiry</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stockItems.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-slate-900">{item.product_name}</p>
                              {item.sku && <p className="text-xs text-slate-500">SKU: {item.sku}</p>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded capitalize">
                              {item.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className={`font-semibold ${item.available_stock <= item.min_stock_level ? 'text-red-600' : 'text-slate-900'}`}>
                              {item.available_stock}
                            </p>
                            <p className="text-xs text-slate-500">Min: {item.min_stock_level}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {formatCurrency(item.total_value)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col gap-1">
                              {item.is_low_stock && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">Low Stock</span>
                              )}
                              {item.is_expiring_soon && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">Expiring</span>
                              )}
                              {!item.is_low_stock && !item.is_expiring_soon && (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-slate-600">
                            {item.earliest_expiry ? new Date(item.earliest_expiry).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
                    >
                      Previous
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Low Stock Tab */}
          {activeTab === 'low-stock' && (
            <div className="space-y-4">
              {lowStockItems.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <span className="material-symbols-outlined text-5xl text-green-300">check_circle</span>
                  <p className="mt-3">No low stock items</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Category</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Current</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Min</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Reorder</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Supplier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lowStockItems.map(item => (
                        <tr key={item.product_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{item.product_name}</p>
                            {item.sku && <p className="text-xs text-slate-500">SKU: {item.sku}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded capitalize">
                              {item.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold text-red-600">{item.current_stock}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{item.min_stock_level}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{item.reorder_level}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{item.supplier_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Expiring Tab */}
          {activeTab === 'expiring' && (
            <div className="space-y-4">
              {expiringItems.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <span className="material-symbols-outlined text-5xl text-green-300">check_circle</span>
                  <p className="mt-3">No expiring items</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Category</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Quantity</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Expiry Date</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Days Left</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expiringItems.map(item => (
                        <tr key={item.product_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{item.product_name}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded capitalize">
                              {item.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{item.quantity}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 text-xs font-medium rounded ${
                              item.days_until_expiry <= 7
                                ? 'bg-red-100 text-red-700'
                                : item.days_until_expiry <= 30
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {new Date(item.expiry_date).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-semibold ${
                              item.days_until_expiry <= 7
                                ? 'text-red-600'
                                : item.days_until_expiry <= 30
                                ? 'text-amber-600'
                                : 'text-slate-600'
                            }`}>
                              {item.days_until_expiry} days
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Alerts Tab */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <span className="material-symbols-outlined text-5xl text-green-300">check_circle</span>
                  <p className="mt-3">No active alerts</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map(alert => (
                    <div
                      key={alert.id}
                      className={`p-4 border rounded-lg ${getSeverityColor(alert.severity)}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-xl mt-0.5">
                            {getAlertTypeIcon(alert.alert_type)}
                          </span>
                          <div>
                            <h3 className="font-semibold">{alert.title}</h3>
                            <p className="text-sm mt-1 opacity-90">{alert.message}</p>
                            {alert.product_name && (
                              <p className="text-xs mt-2 opacity-75">Product: {alert.product_name}</p>
                            )}
                            {alert.days_until_expiry !== null && (
                              <p className="text-xs mt-1 opacity-75">Days until expiry: {alert.days_until_expiry}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {!alert.acknowledged_at && (
                            <button
                              onClick={() => handleAcknowledgeAlert(alert.id)}
                              className="px-3 py-1.5 text-xs font-medium bg-white/50 hover:bg-white rounded transition-colors"
                            >
                              Acknowledge
                            </button>
                          )}
                          <button
                            onClick={() => handleResolveAlert(alert.id)}
                            className="px-3 py-1.5 text-xs font-medium bg-white/50 hover:bg-white rounded transition-colors"
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs opacity-75">
                        <span>{alert.alert_type.replace('_', ' ').toUpperCase()}</span>
                        <span>•</span>
                        <span>{new Date(alert.created_at).toLocaleString()}</span>
                        {alert.acknowledged_at && (
                          <>
                            <span>•</span>
                            <span>Acknowledged: {new Date(alert.acknowledged_at).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard: React.FC<{ label: string; value: string | number; icon: string; color: string }> = ({ label, value, icon, color }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    amber: 'bg-amber-50 text-amber-700',
    orange: 'bg-orange-50 text-orange-700',
    red: 'bg-red-50 text-red-700',
  };

  return (
    <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <span className={`material-symbols-outlined p-2 rounded-lg ${colorClasses[color] || colorClasses.blue}`}>
          {icon}
        </span>
      </div>
    </div>
  );
};

export default StockOverviewPage;
