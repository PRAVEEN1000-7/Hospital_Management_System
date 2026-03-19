import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import inventoryService from '../../services/inventoryService';
import pharmacyService from '../../services/pharmacyService';
import type { LowStockItem } from '../../types/inventory';

interface SupplierOption {
  id: string;
  name: string;
}

interface ReorderSuggestion extends LowStockItem {
  suggestedQuantity: number;
  estimatedCost?: number;
}

const LowStockAlertsPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const roles = user?.roles || [];
  
  // Role-based access control
  const hasInventoryAccess = 
    roles.includes('inventory_manager') || roles.includes('admin') || roles.includes('super_admin');
  const isPharmacistOnly = roles.includes('pharmacist') && !hasInventoryAccess;
  
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'stock' | 'variance' | 'name'>('stock');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'warning'>('all');
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [creating, setCreating] = useState(false);
  const [customQuantities, setCustomQuantities] = useState<Map<string, number>>(new Map());

  // Fetch low stock items
  const fetchLowStockItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getLowStock(100);
      setItems(res);

      // Generate reorder suggestions
      const generatedSuggestions = res.map(item => ({
        ...item,
        suggestedQuantity: Math.max(
          item.max_stock_level || item.reorder_level * 3,
          item.reorder_level * 2
        ) - item.current_stock,
        estimatedCost: (Math.max(
          item.max_stock_level || item.reorder_level * 3,
          item.reorder_level * 2
        ) - item.current_stock) * (item.purchase_price || 0),
      }));
      setSuggestions(generatedSuggestions);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load low stock items');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch suppliers
  const fetchSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      const res = await pharmacyService.getSuppliers('', true);
      setSuppliers(res.map(s => ({ id: s.id, name: s.name })));
    } catch (err: any) {
      console.error(err);
      setSuppliers([]);
      if (err?.response?.status === 403) {
        toast.error('You do not have permission to load suppliers');
      } else {
        toast.error('Failed to load suppliers');
      }
    } finally {
      setLoadingSuppliers(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLowStockItems();
  }, [fetchLowStockItems]);

  useEffect(() => {
    if (!showCreatePO) return;
    if (suppliers.length > 0) return;
    fetchSuppliers();
  }, [showCreatePO, suppliers.length, fetchSuppliers]);

  // Filter and sort items
  const filteredItems = suggestions
    .filter(item => {
      if (filterSeverity === 'critical') return item.current_stock === 0;
      if (filterSeverity === 'warning') return item.current_stock > 0 && item.current_stock < item.reorder_level;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'stock':
          return a.current_stock - b.current_stock;
        case 'variance':
          return a.suggestedQuantity - b.suggestedQuantity;
        case 'name':
          return (a.item_name || '').localeCompare(b.item_name || '');
        default:
          return 0;
      }
    });

  // Handle item selection
  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const selectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map(item => item.item_id)));
    }
  };

  // Create PO from selected items
  const handleCreatePO = async () => {
    if (!selectedSupplier) {
      toast.error('Please select a supplier');
      return;
    }

    if (selectedItems.size === 0) {
      toast.error('Please select at least one item');
      return;
    }

    setCreating(true);
    try {
      const selectedSuggestions = suggestions.filter(s => selectedItems.has(s.item_id));
      const items = selectedSuggestions.map(s => {
        const quantity = customQuantities.get(s.item_id) || s.suggestedQuantity;
        return {
          medicine_id: s.item_id,
          quantity_ordered: quantity,
          unit_price: s.purchase_price || 0,
        };
      });

      await pharmacyService.createPurchaseOrder({
        supplier_id: selectedSupplier,
        expected_delivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: `Auto-generated reorder for low stock items - ${selectedItems.size} items`,
        items,
      });

      toast.success(`Purchase order created for ${selectedItems.size} items`);
      setSelectedItems(new Set());
      setShowCreatePO(false);
      setSelectedSupplier('');
      setCustomQuantities(new Map());
      await fetchLowStockItems();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to create purchase order');
    } finally {
      setCreating(false);
    }
  };

  const totalQtyToOrder = Array.from(selectedItems).reduce((sum, itemId) => {
    const item = suggestions.find(s => s.item_id === itemId);
    const qty = customQuantities.get(itemId) ?? item?.suggestedQuantity ?? 0;
    return sum + qty;
  }, 0);

  const totalEstimatedCost = Array.from(selectedItems).reduce((sum, itemId) => {
    const item = suggestions.find(s => s.item_id === itemId);
    const qty = customQuantities.get(itemId) ?? item?.suggestedQuantity ?? 0;
    const price = item?.purchase_price || 0;
    return sum + (qty * price);
  }, 0);

  const getSeverityColor = (item: LowStockItem) => {
    if (item.current_stock === 0) return 'bg-red-50 border-red-200';
    if (item.current_stock < item.reorder_level / 2) return 'bg-orange-50 border-orange-200';
    return 'bg-amber-50 border-amber-200';
  };

  const getSeverityBadge = (item: LowStockItem) => {
    if (item.current_stock === 0) return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">CRITICAL</span>;
    if (item.current_stock < item.reorder_level / 2) return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">HIGH</span>;
    return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">WARNING</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Low Stock Alerts</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor items below reorder level and generate purchase orders</p>
        </div>
        {hasInventoryAccess && (
          <button
            onClick={() => {
              setSelectedSupplier('');
              setShowCreatePO(true);
            }}
            disabled={selectedItems.size === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
            Create PO ({selectedItems.size})
          </button>
        )}
        {isPharmacistOnly && (
          <div className="text-sm text-slate-500 italic">
            View only - Create PO requires inventory manager role
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-emerald-400">check_circle</span>
          <h2 className="text-lg font-bold text-slate-900 mt-4">All Items In Stock</h2>
          <p className="text-sm text-slate-500 mt-2">No items are currently below their reorder level</p>
        </div>
      ) : (
        <>
          {/* Filters & Controls */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex gap-3 flex-wrap">
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value as any)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="all">All Severity</option>
                  <option value="critical">Critical (0 stock)</option>
                  <option value="warning">Warning</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="stock">Sort by Stock Level</option>
                  <option value="variance">Sort by Qty to Order</option>
                  <option value="name">Sort by Name</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                  onChange={selectAll}
                  className="w-4 h-4 text-primary rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">Select All ({filteredItems.length})</span>
              </label>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                        onChange={selectAll}
                        className="w-4 h-4 text-primary rounded border-slate-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Medicine Name</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Current Stock</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Reorder Level</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Suggested Qty</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr
                      key={item.item_id}
                      className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer ${getSeverityColor(item)}`}
                      onClick={() => toggleItemSelection(item.item_id)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.item_id)}
                          onChange={() => toggleItemSelection(item.item_id)}
                          className="w-4 h-4 text-primary rounded border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{item.item_name}</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-900">{item.current_stock}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{item.reorder_level}</td>
                      <td className="px-4 py-3 text-center text-primary font-semibold">
                        {suggestions.find(s => s.item_id === item.item_id)?.suggestedQuantity || 0}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        ₹{item.purchase_price?.toFixed(2) || '0.00'}
                      </td>
                      <td className="px-4 py-3 text-center">{getSeverityBadge(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create PO Modal */}
          {showCreatePO && (
            <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
                  <h2 className="text-lg font-bold text-slate-900">Create Purchase Order</h2>
                  <button
                    onClick={() => {
                      setShowCreatePO(false);
                      setCustomQuantities(new Map());
                    }}
                    className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Select Supplier</label>
                    <select
                      value={selectedSupplier}
                      onChange={(e) => setSelectedSupplier(e.target.value)}
                      disabled={loadingSuppliers || suppliers.length === 0}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">
                        {loadingSuppliers ? 'Loading suppliers...' : suppliers.length === 0 ? 'No suppliers available' : '-- Choose Supplier --'}
                      </option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {!loadingSuppliers && suppliers.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No active suppliers found. Add suppliers first to create a PO.</p>
                    )}
                  </div>

                  {/* Items with Editable Quantities */}
                  <div className="border border-slate-200 rounded-lg">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-900">Items to Order</h3>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {Array.from(selectedItems).map(itemId => {
                        const item = suggestions.find(s => s.item_id === itemId);
                        if (!item) return null;
                        const qty = customQuantities.get(itemId) ?? item.suggestedQuantity;
                        const cost = qty * (item.purchase_price || 0);
                        return (
                          <div key={itemId} className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-slate-900">{item.item_name}</p>
                                <p className="text-xs text-slate-500">Current: {item.current_stock} | Reorder: {item.reorder_level}</p>
                              </div>
                              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">₹{(item.purchase_price || 0).toFixed(2)}/unit</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs text-slate-600 mb-1">Suggested Qty</label>
                                <input
                                  type="number"
                                  disabled
                                  value={item.suggestedQuantity}
                                  className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-600"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 mb-1">Quantity to Order *</label>
                                <input
                                  type="number"
                                  min={1}
                                  value={qty}
                                  onChange={(e) => {
                                    const newQty = Math.max(1, parseInt(e.target.value) || 0);
                                    setCustomQuantities(prev => new Map(prev).set(itemId, newQty));
                                  }}
                                  className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 mb-1">Est. Cost</label>
                                <input
                                  type="text"
                                  disabled
                                  value={`₹${cost.toFixed(2)}`}
                                  className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-900 font-semibold"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="bg-slate-50 p-4 rounded-lg space-y-2 border border-slate-200">
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Items to Order:</span>
                      <span className="font-bold text-slate-900">{selectedItems.size}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Total Quantity:</span>
                      <span className="font-bold text-slate-900">{totalQtyToOrder}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                      <span className="font-semibold text-slate-900">Est. Amount:</span>
                      <span className="font-bold text-primary text-lg">₹{totalEstimatedCost.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowCreatePO(false);
                        setCustomQuantities(new Map());
                      }}
                      className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreatePO}
                      disabled={creating || !selectedSupplier || loadingSuppliers || suppliers.length === 0}
                      className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {creating ? 'Creating...' : 'Create Order'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LowStockAlertsPage;
