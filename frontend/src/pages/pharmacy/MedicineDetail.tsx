import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import pharmacyService from '../../services/pharmacyService';
import type { Medicine, MedicineBatch } from '../../types/pharmacy';
import { format } from 'date-fns';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

const MedicineDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [batches, setBatches] = useState<MedicineBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      pharmacyService.getMedicine(id),
      pharmacyService.getBatches(id),
    ]).then(([med, batchList]) => {
      setMedicine(med);
      setBatches(batchList);
    }).catch(() => {
      navigate('/pharmacy/medicines');
    }).finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading || !medicine) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  const totalStock = batches.reduce((sum, b) => sum + b.quantity, 0);

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Deactivate Medicine',
      message: `Deactivate "${medicine.name}"? It will no longer appear in the inventory or be available for prescribing/dispensing. This does not delete its sales or batch history.`,
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await pharmacyService.deleteMedicine(medicine.id);
      toast.success('Medicine deactivated');
      navigate('/pharmacy/medicines');
    } catch {
      toast.error('Failed to deactivate medicine');
    }
  };

  const handleDeactivateBatch = async (batch: MedicineBatch) => {
    const ok = await confirm({
      title: 'Deactivate Batch',
      message: `Deactivate batch ${batch.batch_number}? It will no longer appear in stock listings or be selectable for dispensing. Its sales/movement history is kept.`,
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await pharmacyService.updateBatch(batch.id, { is_active: false });
      toast.success('Batch deactivated');
      setBatches((prev) => prev.filter((b) => b.id !== batch.id));
    } catch {
      toast.error('Failed to deactivate batch');
    }
  };

  return (
    <div className="space-y-6 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pharmacy/medicines')} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{medicine.name}</h1>
            {medicine.generic_name && <p className="text-sm text-slate-500">{medicine.generic_name}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/pharmacy/medicines/${id}/edit`)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary bg-white border border-primary/30 rounded-lg hover:bg-primary/5">
            <span className="material-symbols-outlined text-base">edit</span> Edit
          </button>
          {medicine.is_active && (
            <button onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50">
              <span className="material-symbols-outlined text-base">delete</span> Deactivate
            </button>
          )}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-y-4 gap-x-6 text-sm">
          {[
            ['Brand', medicine.brand],
            ['Category', medicine.category],
            ['Dosage Form', medicine.dosage_form],
            ['Strength', medicine.strength],
            ['Manufacturer', medicine.manufacturer],
            ['Unit', medicine.unit],
            ['HSN Code', medicine.hsn_code],
            ['SKU', medicine.sku],
            ['Barcode', medicine.barcode],
            ['Drug Schedule', medicine.schedule_type],
            ['Rack Location', medicine.rack_location],
            ['Reorder Level', medicine.reorder_level?.toString()],
            ['Max Stock', medicine.max_stock_level?.toString()],
            ['Storage', medicine.storage_conditions],
            ['Requires Rx', medicine.requires_prescription ? 'Yes' : 'No'],
            ['Status', medicine.is_active ? 'Active' : 'Inactive'],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs text-slate-400 font-medium uppercase">{label}</p>
              <p className="text-slate-900 font-medium">{(value as string) || '—'}</p>
            </div>
          ))}
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase">Total Stock</p>
            <p className={`text-lg font-bold ${totalStock <= (medicine.reorder_level ?? 10) ? 'text-red-500' : 'text-emerald-600'}`}>{totalStock}</p>
          </div>
        </div>
        {medicine.description && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 font-medium uppercase mb-1">Description</p>
            <p className="text-sm text-slate-700">{medicine.description}</p>
          </div>
        )}
        {medicine.drug_interaction_notes && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 font-medium uppercase mb-1">Drug Interaction Notes</p>
            <p className="text-sm text-slate-700">{medicine.drug_interaction_notes}</p>
          </div>
        )}
        {medicine.side_effects && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 font-medium uppercase mb-1">Side Effects</p>
            <p className="text-sm text-slate-700">{medicine.side_effects}</p>
          </div>
        )}
      </div>

      {/* Batches */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Batches</h2>
          <button onClick={() => navigate(`/pharmacy/batches/new?medicine_id=${id}`)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5">
            <span className="material-symbols-outlined text-sm">add</span> Add Batch
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase">
                <th className="px-4 py-3 text-center">Batch #</th>
                <th className="px-4 py-3 text-center">Mfg Date</th>
                <th className="px-4 py-3 text-center">Expiry</th>
                <th className="px-4 py-3 text-center">Qty</th>
                <th className="px-4 py-3 text-center">Purchase ₹</th>
                <th className="px-4 py-3 text-center">Selling ₹</th>
                <th className="px-4 py-3 text-center">MRP ₹</th>
                <th className="px-4 py-3 text-center">Supplier</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No batches found</td></tr>
              ) : batches.map((b) => {
                const isExpired = new Date(b.expiry_date) < new Date();
                return (
                  <tr key={b.id} className={`hover:bg-slate-50 ${isExpired ? 'bg-red-50/50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">{b.batch_number}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {b.mfg_date ? format(new Date(b.mfg_date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={isExpired ? 'text-red-500 font-semibold' : 'text-slate-600'}>
                        {format(new Date(b.expiry_date), 'dd MMM yyyy')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{b.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{Number(b.purchase_price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{Number(b.selling_price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{b.mrp ? Number(b.mrp).toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{b.supplier_name || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {b.quantity === 0 ? (
                        <button onClick={() => handleDeactivateBatch(b)} title="Deactivate empty batch"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300" title="Only an emptied (0 qty) batch can be deactivated — use Stock Adjustments to reduce quantity first">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MedicineDetail;
