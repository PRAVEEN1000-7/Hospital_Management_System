import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { PharmacyDashboard as DashboardData, Medicine } from '../../types/pharmacy';
import { useAuth } from '../../contexts/AuthContext';

const PharmacyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [outOfStockMedicines, setOutOfStockMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        // Fetch dashboard stats and pending prescriptions count in parallel
        const [dashboard, pendingRes] = await Promise.all([
          pharmacyService.getDashboard(),
          pharmacyService.getPendingPrescriptions(1, 1).catch(() => ({ total: 0 })),
        ]);
        
        setStats(dashboard);
        setPendingCount(pendingRes.total || 0);

        // Fetch out-of-stock medicines (stock = 0)
        const medicinesRes = await pharmacyService.getMedicines(1, 100, '', '', true);
        const outOfStock = medicinesRes.data.filter(m => (m.total_stock ?? 0) === 0);
        setOutOfStockMedicines(outOfStock.slice(0, 10)); // Show max 10
      } catch (err) {
        console.error('Failed to load pharmacy dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
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
      value: pendingCount,
      icon: pendingCount > 0 ? 'notifications_active' : 'queue',
      color: pendingCount > 0 ? 'text-blue-600' : 'text-blue-500',
      bg: pendingCount > 0 ? 'bg-blue-100' : 'bg-blue-50',
      to: '/pharmacy/pending-prescriptions',
      highlight: pendingCount > 0,
    },
    { 
      label: 'Total Medicines', 
      value: stats?.total_medicines ?? 0, 
      icon: 'medication', 
      color: 'text-blue-500', 
      bg: 'bg-blue-50', 
      to: '/pharmacy/medicines' 
    },
    { 
      label: 'Out of Stock', 
      value: outOfStockMedicines.length, 
      icon: 'inventory_2', 
      color: 'text-red-500', 
      bg: 'bg-red-50', 
      to: '/pharmacy/medicines',
      alert: outOfStockMedicines.length > 0,
    },
    { label: 'Low Stock', value: stats?.low_stock_count ?? 0, icon: 'warning', color: 'text-amber-500', bg: 'bg-amber-50', to: '/pharmacy/medicines' },
    { label: 'Expiring Soon', value: stats?.expiring_soon_count ?? 0, icon: 'schedule', color: 'text-orange-500', bg: 'bg-orange-50', to: '/pharmacy/medicines' },
    { label: 'Expired', value: stats?.expired_count ?? 0, icon: 'dangerous', color: 'text-red-500', bg: 'bg-red-50', to: '/pharmacy/medicines' },
    { label: "Today's Sales", value: stats?.today_sales_count ?? 0, icon: 'receipt_long', color: 'text-emerald-500', bg: 'bg-emerald-50', to: '/pharmacy/sales' },
    { label: "Today's Revenue", value: `₹${Number(stats?.today_sales_amount ?? 0).toLocaleString()}`, icon: 'payments', color: 'text-green-600', bg: 'bg-green-50', to: '/pharmacy/sales' },
    { label: 'Pending Orders', value: stats?.pending_orders ?? 0, icon: 'local_shipping', color: 'text-purple-500', bg: 'bg-purple-50', to: '/pharmacy/purchase-orders' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pharmacy Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back, <span className="font-semibold text-slate-700">{user?.first_name} {user?.last_name}</span>
          </p>
        </div>
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate(card.to)}
            className={`${card.bg} rounded-xl p-4 text-left hover:shadow-md transition-all overflow-hidden relative ${
              card.highlight ? 'ring-2 ring-blue-400 ring-offset-2 animate-pulse' : ''
            } ${card.alert ? 'ring-2 ring-red-400 ring-offset-2 animate-pulse' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`material-symbols-outlined text-2xl ${card.color} shrink-0`}>{card.icon}</span>
              {card.highlight && (
                <span className="material-symbols-outlined text-sm text-red-500 shrink-0">notifications</span>
              )}
              {card.alert && (
                <span className="material-symbols-outlined text-sm text-red-600 shrink-0">error</span>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900 truncate">{card.value}</p>
            <p className="text-xs text-slate-500 mt-1 truncate">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Out of Stock Alert Section */}
      {outOfStockMedicines.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-red-600">inventory_2</span>
              <div>
                <h2 className="text-lg font-bold text-red-900">⚠️ Out of Stock Medicines</h2>
                <p className="text-sm text-red-700">{outOfStockMedicines.length} medicines need immediate restocking</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/pharmacy/medicines')}
              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
            >
              View All
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {outOfStockMedicines.map((med) => (
              <div
                key={med.id}
                onClick={() => navigate(
                  `/pharmacy/purchase-orders/new?medicine_id=${med.id}&quantity=${Math.max(1, med.reorder_level ?? 1)}`
                )}
                className="bg-white rounded-lg p-3 border border-red-200 cursor-pointer hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{med.name}</p>
                    {med.generic_name && (
                      <p className="text-xs text-slate-500 truncate">{med.generic_name}</p>
                    )}
                    {med.strength && (
                      <p className="text-xs text-slate-600 mt-1">{med.strength}</p>
                    )}
                  </div>
                  <span className="material-symbols-outlined text-red-500 text-lg shrink-0 ml-2">
                    inventory_2
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Pending Prescriptions Queue', desc: 'Dispense medicines from prescriptions', icon: 'queue', to: '/pharmacy/pending-prescriptions' },
          { label: 'Medicine Inventory', desc: 'Browse & manage all medicines', icon: 'medication', to: '/pharmacy/medicines' },
          { label: 'New Sale / Dispense', desc: 'Create a pharmacy sale', icon: 'point_of_sale', to: '/pharmacy/sales/new' },
          { label: 'Sales History', desc: 'View past sales & invoices', icon: 'receipt_long', to: '/pharmacy/sales' },
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
