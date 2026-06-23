import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import type { OpticalDashboard as DashboardData, OpticalProduct } from '../../types/optical';
import { useAuth } from '../../contexts/AuthContext';

const OpticalDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [outOfStockProducts, setOutOfStockProducts] = useState<OpticalProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const dashboard = await opticalService.getDashboard();
        setStats(dashboard);

        const productsRes = await opticalService.getProducts(1, 100, '', '', true);
        const outOfStock = productsRes.data.filter(p => (p.total_stock ?? 0) === 0);
        setOutOfStockProducts(outOfStock.slice(0, 10));
      } catch (err) {
        console.error('Failed to load optical dashboard:', err);
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
    { label: 'Total Products', value: stats?.total_products ?? 0, icon: 'visibility', color: 'text-blue-500', bg: 'bg-blue-50', to: '/optical/products' },
    {
      label: 'Out of Stock',
      value: outOfStockProducts.length,
      icon: 'inventory_2',
      color: 'text-red-500',
      bg: 'bg-red-50',
      to: '/optical/products',
      alert: outOfStockProducts.length > 0,
    },
    { label: 'Low Stock', value: stats?.low_stock_count ?? 0, icon: 'warning', color: 'text-amber-500', bg: 'bg-amber-50', to: '/optical/products' },
    { label: 'Expiring Soon', value: stats?.expiring_soon_count ?? 0, icon: 'schedule', color: 'text-orange-500', bg: 'bg-orange-50', to: '/optical/products' },
    { label: 'Expired', value: stats?.expired_count ?? 0, icon: 'dangerous', color: 'text-red-500', bg: 'bg-red-50', to: '/optical/products' },
    { label: "Today's Sales", value: stats?.today_sales_count ?? 0, icon: 'receipt_long', color: 'text-emerald-500', bg: 'bg-emerald-50', to: '/optical/sales' },
    { label: "Today's Revenue", value: `₹${Number(stats?.today_sales_amount ?? 0).toLocaleString()}`, icon: 'payments', color: 'text-green-600', bg: 'bg-green-50', to: '/optical/sales' },
    { label: 'Pending Prescriptions', value: stats?.pending_prescriptions ?? 0, icon: 'description', color: 'text-purple-500', bg: 'bg-purple-50', to: '/optical/prescriptions' },
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
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate(card.to)}
            className={`${card.bg} rounded-xl p-4 text-left hover:shadow-md transition-all overflow-hidden relative ${
              card.alert ? 'ring-2 ring-red-400 ring-offset-2 animate-pulse' : ''
            }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`material-symbols-outlined text-2xl ${card.color} shrink-0`}>{card.icon}</span>
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
      {outOfStockProducts.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-red-600">inventory_2</span>
              <div>
                <h2 className="text-lg font-bold text-red-900">Out of Stock Products</h2>
                <p className="text-sm text-red-700">{outOfStockProducts.length} products need immediate restocking</p>
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
            {outOfStockProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => navigate(`/optical/batches/new?product_id=${product.id}`)}
                className="bg-white rounded-lg p-3 border border-red-200 cursor-pointer hover:shadow-md transition-all"
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
          { label: 'Products', desc: 'Browse & manage frames, lenses, accessories', icon: 'visibility', to: '/optical/products' },
          { label: 'Eye Prescriptions', desc: 'Record & review patient eye prescriptions', icon: 'description', to: '/optical/prescriptions' },
          { label: 'New Sale', desc: 'Sell a frame, lens, or accessory', icon: 'point_of_sale', to: '/optical/sales/new' },
          { label: 'Sales History', desc: 'View past sales & invoices', icon: 'receipt_long', to: '/optical/sales' },
          { label: 'Stock Adjustments', desc: 'Manual stock corrections', icon: 'tune', to: '/optical/stock-adjustments' },
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

export default OpticalDashboard;
