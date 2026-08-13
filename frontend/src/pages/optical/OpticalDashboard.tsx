import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import type { OpticalDashboard as DashboardData } from '../../types/optical';
import { useAuth } from '../../contexts/AuthContext';

const OpticalDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  // Optical staff / admins can sell, manage stock, and see the dispensing queue.
  // Doctors can view products and prescriptions but not process sales.
  const canManage = hasRole('super_admin', 'admin', 'optical_staff');
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      // out_of_stock_count/out_of_stock_items come straight from the
      // dashboard endpoint (a true catalog-wide count) — previously this was
      // computed by fetching page 1/limit 100 of the product list and
      // filtering client-side, which silently undercounted any hospital with
      // more than 100 active products.
      const [dashboardRes, pendingRes] = await Promise.allSettled([
        opticalService.getDashboard(),
        opticalService.getPendingPrescriptions(1, 1, 'pending'),
      ]);
      if (dashboardRes.status === 'fulfilled') setStats(dashboardRes.value);
      if (pendingRes.status === 'fulfilled') setPendingCount(pendingRes.value.total);
      setLoading(false);
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
      icon: 'notifications_active',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      to: '/optical/prescriptions/pending',
      highlight: pendingCount > 0,
    },
    { label: 'Total Products', value: stats?.total_products ?? 0, icon: 'visibility', color: 'text-blue-500', bg: 'bg-blue-50', to: '/optical/products' },
    {
      label: 'Out of Stock',
      value: stats?.out_of_stock_count ?? 0,
      icon: 'inventory_2',
      color: 'text-red-500',
      bg: 'bg-red-50',
      to: '/optical/products',
      alert: (stats?.out_of_stock_count ?? 0) > 0,
    },
    { label: 'Low Stock', value: stats?.low_stock_count ?? 0, icon: 'warning', color: 'text-amber-500', bg: 'bg-amber-50', to: '/optical/products' },
    { label: 'Expiring Soon', value: stats?.expiring_soon_count ?? 0, icon: 'schedule', color: 'text-orange-500', bg: 'bg-orange-50', to: '/optical/products' },
    { label: 'Expired', value: stats?.expired_count ?? 0, icon: 'dangerous', color: 'text-red-500', bg: 'bg-red-50', to: '/optical/products' },
    { label: "Today's Sales", value: stats?.today_sales_count ?? 0, icon: 'receipt_long', color: 'text-emerald-500', bg: 'bg-emerald-50', to: '/optical/sales' },
    { label: "Today's Revenue", value: `₹${Number(stats?.today_sales_amount ?? 0).toLocaleString()}`, icon: 'payments', color: 'text-green-600', bg: 'bg-green-50', to: '/optical/sales' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Optical Store Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back, <span className="font-semibold text-slate-700">{user?.first_name} {user?.last_name}</span>
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => navigate('/optical/sales/new')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
              <span className="material-symbols-outlined text-base">point_of_sale</span> New Sale
            </button>
            <button onClick={() => navigate('/optical/products/new')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary bg-white border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
              <span className="material-symbols-outlined text-base">add</span> Add Product
            </button>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate(card.to)}
            className={`${card.bg} rounded-xl p-4 text-left hover:shadow-md transition-all overflow-hidden relative ${
              card.alert ? 'ring-2 ring-red-400 ring-offset-2 animate-pulse' :
              card.highlight ? 'ring-2 ring-blue-400 ring-offset-2 animate-pulse' : ''
            }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`material-symbols-outlined text-2xl ${card.color} shrink-0`}>{card.icon}</span>
              {card.alert && (
                <span className="material-symbols-outlined text-sm text-red-600 shrink-0">error</span>
              )}
              {card.highlight && !card.alert && (
                <span className="material-symbols-outlined text-sm text-blue-600 shrink-0">notifications_active</span>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900 truncate">{card.value}</p>
            <p className="text-xs text-slate-500 mt-1 truncate">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Out of Stock Alert Section */}
      {(stats?.out_of_stock_items?.length ?? 0) > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-red-600">inventory_2</span>
              <div>
                <h2 className="text-lg font-bold text-red-900">Out of Stock Products</h2>
                <p className="text-sm text-red-700">{stats?.out_of_stock_count ?? 0} products need immediate restocking</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/optical/products')}
              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
            >
              View All
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(stats?.out_of_stock_items ?? []).map((product) => (
              <div
                key={product.id}
                onClick={() => canManage ? navigate(`/optical/batches/new?product_id=${product.id}`) : undefined}
                className={`bg-white rounded-lg p-3 border border-red-200 transition-all ${canManage ? 'cursor-pointer hover:shadow-md' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{product.name}</p>
                    {product.brand && (
                      <p className="text-xs text-slate-500 truncate">{product.brand}</p>
                    )}
                    <p className="text-xs text-slate-600 mt-1 capitalize">{product.category}</p>
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
          canManage && {
            label: 'Prescription Queue',
            desc: pendingCount > 0 ? `${pendingCount} prescription${pendingCount > 1 ? 's' : ''} waiting for dispensing` : 'View finalized prescriptions awaiting dispensing',
            icon: 'queue',
            to: '/optical/prescriptions/pending',
            badge: pendingCount > 0 ? pendingCount : undefined,
          },
          canManage && { label: 'Dispensing Queue', desc: 'Today\'s order status board', icon: 'view_list', to: '/optical/queue' },
          { label: 'Products', desc: 'Browse & manage frames, lenses, accessories', icon: 'visibility', to: '/optical/products' },
          { label: 'Eye Prescriptions', desc: 'Record & review patient eye prescriptions', icon: 'description', to: '/optical/prescriptions' },
          canManage && { label: 'New Sale', desc: 'Sell a frame, lens, or accessory', icon: 'point_of_sale', to: '/optical/sales/new' },
          { label: 'Sales History', desc: 'View past sales & invoices', icon: 'receipt_long', to: '/optical/sales' },
        ].filter(Boolean).map((item: any) => (
          <button key={item.label} onClick={() => navigate(item.to)}
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-primary/30 transition-all text-left overflow-hidden relative">
            <span className="material-symbols-outlined text-3xl text-primary shrink-0">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 truncate">{item.label}</p>
              <p className="text-xs text-slate-500 truncate">{item.desc}</p>
            </div>
            {item.badge !== undefined && (
              <span className="absolute top-3 right-3 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default OpticalDashboard;
