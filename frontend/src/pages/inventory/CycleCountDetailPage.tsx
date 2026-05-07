import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import inventoryService from '../../services/inventoryService';
import pharmacyService from '../../services/pharmacyService';
import type { CycleCount, CycleCountCreate } from '../../types/inventory';

interface CycleCountItem {
  item_type: 'medicine' | 'optical_product';
  item_id: string;
  item_name: string;
  system_quantity: number;
  counted_quantity?: number;
  variance?: number;
  batch_id?: string;
  batch_number?: string;
}

const CycleCountDetail: React.FC = () => {
  const { ccId } = useParams<{ ccId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const isEditMode = !!ccId && ccId !== 'new';

  const [cycleCount, setCycleCount] = useState<CycleCount | null>(null);
  const [items, setItems] = useState<CycleCountItem[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [countDate, setCountDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'in_progress' | 'completed' | 'verified'>('in_progress');
  const [activeTab, setActiveTab] = useState<'input' | 'variance'>('input');
  const [filterByVariance, setFilterByVariance] = useState(false);

  // Fetch cycle count if editing
  useEffect(() => {
    if (!isEditMode) return;
    const load = async () => {
      try {
        const cc = await inventoryService.getCycleCount(ccId!);
        setCycleCount(cc);
        setCountDate(cc.count_date);
        setNotes(cc.notes || '');
        setStatus(cc.status as any);
        // Parse items if stored
        setItems([]);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load cycle count');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, ccId]);

  // Fetch medicines
  useEffect(() => {
    const load = async () => {
      try {
        const res = await pharmacyService.getMedicines(1, 500);
        setMedicines(res.data);
        // Pre-populate with current stock from all medicines
        if (!isEditMode && items.length === 0) {
          const defaultItems = res.data.slice(0, 10).map(m => ({
            item_type: 'medicine' as const,
            item_id: m.id,
            item_name: m.name,
            system_quantity: 0, // Would fetch from batch
            batch_number: '',
          }));
          setItems(defaultItems);
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to load medicines');
      }
    };
    load();
  }, []);

  // Add item row
  const addItem = () => {
    setItems([...items, {
      item_type: 'medicine',
      item_id: '',
      item_name: '',
      system_quantity: 0,
      batch_number: '',
    }]);
  };

  // Update item
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    const item = newItems[index];
    (item as any)[field] = value;

    // Set item name if selecting from medicines
    if (field === 'item_id') {
      const medicine = medicines.find(m => m.id === value);
      if (medicine) {
        item.item_name = medicine.name;
        item.system_quantity = medicine.total_stock || 0;
      }
    }

    // Calculate variance
    if (field === 'counted_quantity') {
      item.variance = item.counted_quantity! - item.system_quantity;
    }

    setItems(newItems);
  };

  // Remove item
  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Calculate statistics
  const stats = {
    totalItems: items.length,
    itemsWithoutVariance: items.filter(i => (i.variance || 0) === 0).length,
    itemsWithVariance: items.filter(i => (i.variance || 0) !== 0).length,
    totalVariance: items.reduce((sum, i) => sum + (i.variance || 0), 0),
  };

  // Filtered items
  const displayItems = filterByVariance
    ? items.filter(i => (i.variance || 0) !== 0)
    : items;

  // Validate & save
  const handleSave = async () => {
    if (!countDate) {
      toast.error('Please select count date');
      return;
    }

    const itemsToCount = items.filter(i => i.item_id);
    if (itemsToCount.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    const hasMissingCount = itemsToCount.some(i => i.counted_quantity === undefined || Number.isNaN(i.counted_quantity));
    if (hasMissingCount) {
      toast.error('Please enter counted quantity for all selected items');
      return;
    }

    setSaving(true);
    try {
      const payload: CycleCountCreate = {
        count_date: countDate,
        notes: notes || undefined,
        items: itemsToCount.map(i => ({
          item_type: i.item_type,
          item_id: i.item_id,
          item_name: i.item_name || undefined,
          batch_id: i.batch_id || undefined,
          system_quantity: i.system_quantity,
          counted_quantity: i.counted_quantity as number,
        })),
      };

      if (isEditMode) {
        await inventoryService.updateCycleCount(ccId!, { status, notes });
        toast.success('Cycle count updated');
      } else {
        await inventoryService.createCycleCount(payload);
        toast.success('Cycle count created');
      }
      navigate('/inventory/cycle-counts');
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to save cycle count');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isEditMode ? `Cycle Count #${ccId}` : 'New Cycle Count'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Physical inventory verification and reconciliation</p>
        </div>
        <button
          onClick={() => navigate('/inventory/cycle-counts')}
          className="p-2 hover:bg-slate-100 rounded-lg"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Stats */}
        {items.length > 0 && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs text-slate-500 font-medium">Total Items</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats.totalItems}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs text-slate-500 font-medium">No Variance</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.itemsWithoutVariance}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs text-slate-500 font-medium">With Variance</p>
              <p className={`text-2xl font-bold mt-1 ${stats.itemsWithVariance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {stats.itemsWithVariance}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs text-slate-500 font-medium">Net Variance</p>
              <p className={`text-2xl font-bold mt-1 ${stats.totalVariance === 0 ? 'text-emerald-600' : stats.totalVariance > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {stats.totalVariance > 0 ? '+' : ''}{stats.totalVariance}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Basic Info */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="font-bold text-slate-900 pb-4 border-b border-slate-200">Cycle Count Details</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Count Date *</label>
            <input
              type="date"
              value={countDate}
              onChange={(e) => setCountDate(e.target.value)}
              disabled={isEditMode}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
            />
          </div>

          {isEditMode && (
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="verified">Verified</option>
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-slate-900 mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this count..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Items Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Counted Items</h2>
          {!isEditMode && (
            <button
              onClick={addItem}
              className="px-3 py-1.5 text-sm font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20"
            >
              + Add Item
            </button>
          )}
        </div>

        {/* Tabs */}
        {items.length > 0 && (
          <div className="border-b border-slate-200 flex">
            <button
              onClick={() => setActiveTab('input')}
              className={`flex-1 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'input'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Input Data
            </button>
            <button
              onClick={() => setActiveTab('variance')}
              className={`flex-1 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'variance'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Variance Report {stats.itemsWithVariance > 0 && `(${stats.itemsWithVariance})`}
            </button>
          </div>
        )}

        {/* Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Item</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">System Qty</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Counted Qty</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Variance</th>
                {!isEditMode && <th className="px-4 py-3 text-center font-semibold text-slate-600">Action</th>}
              </tr>
            </thead>
            <tbody>
              {displayItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {filterByVariance ? 'No items with variance' : 'No items added yet'}
                  </td>
                </tr>
              ) : (
                displayItems.map((item, idx) => {
                  const variance = (item.counted_quantity || 0) - item.system_quantity;
                  const varianceColor = variance === 0 ? 'text-slate-600' : variance > 0 ? 'text-blue-600' : 'text-red-600';

                  return (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <select
                          value={item.item_id}
                          onChange={(e) => updateItem(idx, 'item_id', e.target.value)}
                          disabled={isEditMode}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                        >
                          <option value="">-- Select Item --</option>
                          {medicines.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center font-mono">{item.system_quantity}</td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          value={item.counted_quantity || ''}
                          onChange={(e) => updateItem(idx, 'counted_quantity', parseInt(e.target.value))}
                          disabled={isEditMode}
                          placeholder="0"
                          className="w-20 px-2 py-1 border border-slate-200 rounded text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-50"
                        />
                      </td>
                      <td className={`px-4 py-3 text-center font-bold ${varianceColor}`}>
                        {variance > 0 ? '+' : ''}{variance}
                      </td>
                      {!isEditMode && (
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => removeItem(idx)}
                            className="text-red-500 hover:text-red-700 text-xs font-semibold"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Show variance filter if there are items with variance */}
        {stats.itemsWithVariance > 0 && activeTab === 'variance' && (
          <div className="p-4 border-t border-slate-200 flex items-center gap-2">
            <input
              type="checkbox"
              checked={filterByVariance}
              onChange={(e) => setFilterByVariance(e.target.checked)}
              id="filter-variance"
              className="w-4 h-4 text-primary rounded"
            />
            <label htmlFor="filter-variance" className="text-sm text-slate-700">
              Show only items with variance
            </label>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/inventory/cycle-counts')}
          className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
};

export default CycleCountDetail;
