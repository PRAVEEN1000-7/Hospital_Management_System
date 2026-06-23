import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import type { OpticalProduct, OpticalBatch } from '../../types/optical';
import { format } from 'date-fns';

const OpticalProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<OpticalProduct | null>(null);
  const [batches, setBatches] = useState<OpticalBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      opticalService.getProduct(id),
      opticalService.getBatches(id),
    ]).then(([product, batchList]) => {
      setProduct(product);
      setBatches(batchList);
    }).catch(() => {
      navigate('/optical/products');
    }).finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading || !product) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  const totalStock = batches.reduce((sum, b) => sum + b.quantity, 0);

  return (
    <div className="space-y-6 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/optical/products')} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{product.name}</h1>
            {product.brand && <p className="text-sm text-slate-500">{product.brand}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/optical/products/${id}/edit`)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary bg-white border border-primary/30 rounded-lg hover:bg-primary/5">
            <span className="material-symbols-outlined text-base">edit</span> Edit
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-y-4 gap-x-6 text-sm">
          {[
            ['Category', product.category],
            ['Brand', product.brand],
            ['Model Number', product.model_number],
            ['Color', product.color],
            ['Material', product.material],
            ['Size', product.size],
            ['Gender', product.gender],
            ['SKU', product.sku],
            ['Barcode', product.barcode],
            ['Lens Type', product.lens_type],
            ['Lens Index', product.lens_index],
            ['Lens Coating', product.lens_coating],
            ['Reorder Level', product.reorder_level?.toString()],
            ['Status', product.is_active ? 'Active' : 'Inactive'],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs text-slate-400 font-medium uppercase">{label}</p>
              <p className="text-slate-900 font-medium capitalize">{(value as string) || '—'}</p>
            </div>
          ))}
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase">Selling Price</p>
            <p className="text-slate-900 font-medium">₹{Number(product.selling_price ?? 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase">Total Stock</p>
            <p className={`text-lg font-bold ${totalStock <= (product.reorder_level ?? 5) ? 'text-red-500' : 'text-emerald-600'}`}>{totalStock}</p>
          </div>
        </div>
      </div>

      {/* Batches */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Batches</h2>
          <button onClick={() => navigate(`/optical/batches/new?product_id=${id}`)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5">
            <span className="material-symbols-outlined text-sm">add</span> Add Batch
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Batch Number</th>
                <th className="px-4 py-3">Mfg Date</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Purchase Price</th>
                <th className="px-4 py-3 text-right">Selling Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No batches yet</td>
                </tr>
              ) : batches.map((batch) => (
                <tr key={batch.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{batch.batch_number}</td>
                  <td className="px-4 py-3 text-slate-600">{batch.mfg_date ? format(new Date(batch.mfg_date), 'dd MMM yyyy') : '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{batch.expiry_date ? format(new Date(batch.expiry_date), 'dd MMM yyyy') : 'Never expires'}</td>
                  <td className="px-4 py-3 text-right text-slate-900 font-medium">{batch.quantity}</td>
                  <td className="px-4 py-3 text-right text-slate-600">₹{Number(batch.purchase_price ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-600">₹{Number(batch.selling_price ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OpticalProductDetail;
