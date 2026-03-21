import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import inventoryService from '../../services/inventoryService';
import productsService from '../../services/productsService';
import type { StockAdjustment, StockAdjustmentCreate } from '../../types/inventory';
import type { Product } from '../../types/products';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
};

const TYPE_LABELS: Record<string, string> = {
  increase: 'Increase',
  decrease: 'Decrease',
  write_off: 'Write Off',
};

// All available product categories from the Product table
const PRODUCT_CATEGORIES = [
  { value: 'medicine', label: 'Medicine' },
  { value: 'optical', label: 'Optical Product' },
  { value: 'surgical', label: 'Surgical Item' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'laboratory', label: 'Laboratory Item' },
  { value: 'disposable', label: 'Disposable' },
  { value: 'other', label: 'Other' },
] as const;

const AdjustmentsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Check if user has approval permission (Admin or Super Admin only)
  const normalizedRoles = (user?.roles || []).map(r => String(r).trim().toLowerCase());
  const hasApprovalPermission = normalizedRoles.some(r => ['admin', 'super_admin', 'administrator'].includes(r));

  // Form state
  const [formData, setFormData] = useState<StockAdjustmentCreate>({
    item_type: 'medicine',
    item_id: '',
    adjustment_type: 'increase',
    quantity: 0,
    reason: '',
  });
  const [itemLabel, setItemLabel] = useState('');

  // Typeahead state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.getAdjustments(page, 10, statusFilter || undefined);
      setAdjustments(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load adjustments');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  useEffect(() => { fetchAdjustments(); }, [fetchAdjustments]);

  // Search for products with debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const result = await productsService.getProducts(1, 10, { search: searchQuery, is_active: true });
        setSearchResults(result.data);
        setShowDropdown(true);
        setHighlightedIndex(-1);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation for dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        selectProduct(searchResults[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const selectProduct = (product: Product) => {
    setSelectedProduct(product);
    setItemLabel(`${product.product_name}${product.generic_name ? ` (${product.generic_name})` : ''}`);
    setFormData({
      ...formData,
      item_type: product.category,
      item_id: product.id,
    });
    setSearchQuery('');
    setShowDropdown(false);
    setHighlightedIndex(-1);
    toast.success(`Selected: ${product.product_name}`);
  };

  const clearProductSelection = () => {
    setSelectedProduct(null);
    setItemLabel('');
    setSearchQuery('');
    setFormData({
      ...formData,
      item_type: 'medicine',
      item_id: '',
    });
    searchInputRef.current?.focus();
  };

  const resetForm = () => {
    setFormData({ item_type: 'medicine', item_id: '', adjustment_type: 'increase', quantity: 0, reason: '' });
    setItemLabel('');
    setSelectedProduct(null);
    setSearchQuery('');
    setShowDropdown(false);
    setShowModal(false);
  };

  const handleCreate = async () => {
    if (!formData.item_id || !formData.item_type) {
      toast.error('Please select a product from the list');
      return;
    }
    if (formData.quantity <= 0 || !formData.reason) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      await inventoryService.createAdjustment({
        ...formData,
        item_id: formData.item_id,
      });
      toast.success('Adjustment created successfully');
      resetForm();
      fetchAdjustments();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create adjustment');
    }
  };

  const handleApprove = async (id: string, approve: boolean) => {
    try {
      await inventoryService.approveAdjustment(id, approve ? 'approved' : 'rejected');
      toast.success(`Adjustment ${approve ? 'approved' : 'rejected'}`);
      fetchAdjustments();
    } catch {
      toast.error('Failed to update adjustment');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Adjustments</h1>
          <p className="text-sm text-slate-500 mt-1">Manage inventory adjustments and write-offs ({total} total)</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          New Adjustment
        </button>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filters */}
        <div className="p-4 border-b border-slate-200">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-pointer">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : adjustments.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">tune</span>
            <p className="text-slate-500 mt-3 text-sm">No adjustments found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Adj. Number</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Item</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider hidden md:table-cell">Reason</th>
                  <th className="px-4 py-3.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adjustments.map(adj => (
                  <tr key={adj.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4 text-sm font-semibold text-slate-900">{adj.adjustment_number}</td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-slate-900">{adj.item_name || adj.item_id}</p>
                      <p className="text-xs text-slate-400 capitalize">{adj.item_type}</p>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${adj.adjustment_type === 'increase' ? 'bg-emerald-50 text-emerald-700' : adj.adjustment_type === 'decrease' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
                        {TYPE_LABELS[adj.adjustment_type] || adj.adjustment_type}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">{adj.quantity}</td>
                    <td className="px-4 py-4 text-sm text-slate-600 hidden md:table-cell max-w-[200px] truncate">{adj.reason}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[adj.status] || 'bg-slate-100 text-slate-600'}`}>
                        {adj.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {adj.status === 'pending' && hasApprovalPermission && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleApprove(adj.id, true)} className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors" title="Approve">
                            <span className="material-symbols-outlined text-lg text-emerald-500">check_circle</span>
                          </button>
                          <button onClick={() => handleApprove(adj.id, false)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Reject">
                            <span className="material-symbols-outlined text-lg text-red-400">cancel</span>
                          </button>
                        </div>
                      )}
                      {adj.status === 'pending' && !hasApprovalPermission && (
                        <span className="text-xs text-slate-400 italic">Pending approval</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors">Previous</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={resetForm} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-slate-900">New Stock Adjustment</h2>
              <button onClick={resetForm} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Item Type and Adjustment Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Item Type *</label>
                  <select
                    value={formData.item_type}
                    onChange={e => setFormData({ ...formData, item_type: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  >
                    {PRODUCT_CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Adjustment Type *</label>
                  <select
                    value={formData.adjustment_type}
                    onChange={e => setFormData({ ...formData, adjustment_type: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  >
                    <option value="increase">Increase</option>
                    <option value="decrease">Decrease</option>
                    <option value="write_off">Write Off</option>
                  </select>
                </div>
              </div>

              {/* Product Search with Typeahead */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Product Name *</label>
                <div className="relative" ref={dropdownRef}>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={selectedProduct ? itemLabel : searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value);
                        setItemLabel(e.target.value);
                        setSelectedProduct(null);
                        setFormData({ ...formData, item_id: '' });
                      }}
                      onFocus={() => searchQuery.length >= 2 && setShowDropdown(true)}
                      onKeyDown={handleKeyDown}
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      placeholder="Search product by name, generic name, or barcode..."
                    />
                    {selectedProduct && (
                      <button
                        onClick={clearProductSelection}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded transition-colors"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-slate-400 text-sm">close</span>
                      </button>
                    )}
                    {isSearching && (
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-primary text-sm animate-spin">progress_activity</span>
                    )}
                  </div>

                  {/* Dropdown Results */}
                  {showDropdown && searchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {searchResults.map((product, index) => (
                        <button
                          key={product.id}
                          onClick={() => selectProduct(product)}
                          className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                            index === highlightedIndex ? 'bg-primary/5' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{product.product_name}</p>
                              {product.generic_name && (
                                <p className="text-xs text-slate-500 truncate">{product.generic_name}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 capitalize">
                                  {product.category}
                                </span>
                                {product.sku && (
                                  <span className="text-xs text-slate-400">SKU: {product.sku}</span>
                                )}
                                {product.barcode && (
                                  <span className="text-xs text-slate-400">Barcode: {product.barcode}</span>
                                )}
                              </div>
                            </div>
                            {product.available_stock !== undefined && (
                              <div className="text-right ml-2">
                                <p className={`text-sm font-semibold ${
                                  product.available_stock <= product.min_stock_level
                                    ? 'text-red-600'
                                    : product.available_stock <= product.reorder_level
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                                }`}>
                                  {product.available_stock} {product.unit_type}
                                </p>
                                <p className="text-xs text-slate-400">in stock</p>
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedProduct && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500">Category:</span>
                        <p className="font-medium text-slate-900 capitalize">{selectedProduct.category}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Unit Type:</span>
                        <p className="font-medium text-slate-900">{selectedProduct.unit_type}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Pack Size:</span>
                        <p className="font-medium text-slate-900">{selectedProduct.pack_size}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Min Stock:</span>
                        <p className="font-medium text-slate-900">{selectedProduct.min_stock_level}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Reorder Level:</span>
                        <p className="font-medium text-slate-900">{selectedProduct.reorder_level}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Max Stock:</span>
                        <p className="font-medium text-slate-900">{selectedProduct.max_stock_level}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Quantity *</label>
                <input
                  type="number"
                  min="1"
                  value={formData.quantity || ''}
                  onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  placeholder="0"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Reason *</label>
                <textarea
                  value={formData.reason}
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
                  placeholder="Reason for adjustment..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={resetForm}
                  className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Create Adjustment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdjustmentsPage;
