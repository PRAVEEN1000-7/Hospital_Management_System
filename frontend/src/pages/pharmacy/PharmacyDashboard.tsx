import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { PharmacyDashboard as DashboardData } from '../../types/pharmacy';

const PharmacyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      pharmacyService.getDashboard(),
      pharmacyService.getPendingPrescriptions(1, 1).then(r => r.total).catch(() => 0),
    ])
      .then(([dashboard, pending]) => {
        setStats(dashboard);
        setPendingCount(pending);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  const cards = [
    {
      label: 'Pending Prescriptions',
      value: loading ? '…' : pendingCount,
      icon: pendingCount > 0 ? 'notifications_active' : 'queue',
      color: pendingCount > 0 ? 'text-blue-600' : 'text-blue-500',
      bg: pendingCount > 0 ? 'bg-blue-100' : 'bg-blue-50',
      to: '/pharmacy/pending-prescriptions',
      highlight: pendingCount > 0,
    },
    { label: 'Total Medicines', value: stats?.total_medicines ?? 0, icon: 'medication', color: 'text-blue-500', bg: 'bg-blue-50', to: '/pharmacy/medicines' },
    { label: 'Low Stock', value: stats?.low_stock_count ?? 0, icon: 'warning', color: 'text-amber-500', bg: 'bg-amber-50', to: '/pharmacy/medicines' },
    { label: 'Expiring Soon', value: stats?.expiring_soon_count ?? 0, icon: 'schedule', color: 'text-orange-500', bg: 'bg-orange-50', to: '/pharmacy/medicines' },
    { label: 'Expired', value: stats?.expired_count ?? 0, icon: 'dangerous', color: 'text-red-500', bg: 'bg-red-50', to: '/pharmacy/medicines' },
    { label: "Today's Sales", value: stats?.today_sales_count ?? 0, icon: 'receipt_long', color: 'text-emerald-500', bg: 'bg-emerald-50', to: '/pharmacy/sales' },
    { label: "Today's Revenue", value: `₹${Number(stats?.today_sales_amount ?? 0).toLocaleString()}`, icon: 'payments', color: 'text-green-600', bg: 'bg-green-50', to: '/pharmacy/sales' },
    { label: 'Pending Orders', value: stats?.pending_orders ?? 0, icon: 'local_shipping', color: 'text-purple-500', bg: 'bg-purple-50', to: '/pharmacy/purchase-orders' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Pharmacy Dashboard</h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/pharmacy/sales/new')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
            <span className="material-symbols-outlined text-base">point_of_sale</span> New Sale
          </button>
          <button onClick={() => navigate('/pharmacy/medicines/new')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary bg-white border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
            <span className="material-symbols-outlined text-base">add</span> Add Medicine
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate(card.to)}
            className={`${card.bg} rounded-xl p-4 text-left hover:shadow-md transition-all overflow-hidden ${
              card.highlight ? 'ring-2 ring-blue-400 ring-offset-2 animate-pulse' : ''
            }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`material-symbols-outlined text-2xl ${card.color} shrink-0`}>{card.icon}</span>
              {card.highlight && (
                <span className="material-symbols-outlined text-sm text-red-500 shrink-0 notification-badge">notifications</span>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900 truncate">{card.value}</p>
            <p className="text-xs text-slate-500 mt-1 truncate">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Pending Prescriptions Queue', desc: 'Dispense medicines from prescriptions', icon: 'queue', to: '/pharmacy/pending-prescriptions' },
          { label: 'Medicine Inventory', desc: 'Browse & manage all medicines', icon: 'medication', to: '/pharmacy/medicines' },
          { label: 'New Sale / Dispense', desc: 'Create a pharmacy sale', icon: 'point_of_sale', to: '/pharmacy/sales/new' },
          { label: 'Sales History', desc: 'View past sales & invoices', icon: 'receipt_long', to: '/pharmacy/sales' },
          { label: 'Suppliers', desc: 'Manage medicine suppliers', icon: 'local_shipping', to: '/pharmacy/suppliers' },
          { label: 'Purchase Orders', desc: 'Stock-in from suppliers', icon: 'inventory_2', to: '/pharmacy/purchase-orders' },
          { label: 'Stock Adjustments', desc: 'Manual stock corrections', icon: 'tune', to: '/pharmacy/stock-adjustments' },
        ].map((item) => (
          <button key={item.label} onClick={() => navigate(item.to)}
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-primary/30 transition-all text-left overflow-hidden">
            <span className="material-symbols-outlined text-3xl text-primary shrink-0">{item.icon}</span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{item.label}</p>
              <p className="text-xs text-slate-500 truncate">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PharmacyDashboard;
