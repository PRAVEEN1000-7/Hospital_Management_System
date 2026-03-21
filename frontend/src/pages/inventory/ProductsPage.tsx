import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import productsService from '../../services/productsService';
import type { Product, ProductCreate, ProductUpdate } from '../../types/products';

const PRODUCTS_CATEGORIES = [
  { value: 'medicine', label: 'Medicine', icon: 'medication' },
  { value: 'optical', label: 'Optical', icon: 'eyeglasses' },
  { value: 'surgical', label: 'Surgical', icon: 'medical_information' },
  { value: 'equipment', label: 'Equipment', icon: 'medical_equipment' },
  { value: 'laboratory', label: 'Laboratory', icon: 'biotech' },
  { value: 'disposable', label: 'Disposable', icon: 'clean_hands' },
  { value: 'other', label: 'Other', icon: 'category' },
];

const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState<ProductCreate>({
    product_name: '',
    generic_name: '',
    brand_name: '',
    category: 'medicine',
    subcategory: '',
    sku: '',
    barcode: '',
    manufacturer: '',
    supplier_id: '',
    purchase_price: 0,
    selling_price: 0,
    mrp: 0,
    tax_percentage: 0,
    unit_type: 'unit',
    pack_size: 1,
    min_stock_level: 10,
    max_stock_level: 1000,
    reorder_level: 20,
    storage_conditions: '',
    shelf_life_days: null,
    requires_refrigeration: false,
    is_hazardous: false,
    is_narcotic: false,
    requires_prescription: false,
  });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productsService.getProducts(page, 20, {
        search: search || undefined,
        category: categoryFilter || undefined,
        is_active: showInactive ? undefined : true,
      });
      setProducts(res.data);
      setTotalPages(res.total_pages);
      setTotal(res.total);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, showInactive, toast]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        product_name: product.product_name,
        generic_name: product.generic_name || '',
        brand_name: product.brand_name || '',
        category: product.category,
        subcategory: product.subcategory || '',
        sku: product.sku || '',
        barcode: product.barcode || '',
        manufacturer: product.manufacturer || '',
        supplier_id: product.supplier_id || '',
        purchase_price: product.purchase_price,
        selling_price: product.selling_price,
        mrp: product.mrp,
        tax_percentage: product.tax_percentage,
        unit_type: product.unit_type,
        pack_size: product.pack_size,
        min_stock_level: product.min_stock_level,
        max_stock_level: product.max_stock_level,
        reorder_level: product.reorder_level,
        storage_conditions: product.storage_conditions || '',
        shelf_life_days: product.shelf_life_days,
        requires_refrigeration: product.requires_refrigeration,
        is_hazardous: product.is_hazardous,
        is_narcotic: product.is_narcotic,
        requires_prescription: product.requires_prescription,
      });
    } else {
      setEditingProduct(null);
      setFormData({
        product_name: '',
        generic_name: '',
        brand_name: '',
        category: 'medicine',
        subcategory: '',
        sku: '',
        barcode: '',
        manufacturer: '',
        supplier_id: '',
        purchase_price: 0,
        selling_price: 0,
        mrp: 0,
        tax_percentage: 0,
        unit_type: 'unit',
        pack_size: 1,
        min_stock_level: 10,
        max_stock_level: 1000,
        reorder_level: 20,
        storage_conditions: '',
        shelf_life_days: null,
        requires_refrigeration: false,
        is_hazardous: false,
        is_narcotic: false,
        requires_prescription: false,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingProduct(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingProduct) {
        await productsService.updateProduct(editingProduct.id, formData as ProductUpdate);
        toast.success('Product updated successfully');
      } else {
        await productsService.createProduct(formData);
        toast.success('Product created successfully');
      }
      handleCloseModal();
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Are you sure you want to deactivate "${product.product_name}"?`)) return;
    try {
      await productsService.deleteProduct(product.id);
      toast.success('Product deactivated');
      fetchProducts();
    } catch {
      toast.error('Failed to delete product');
    }
  };

  const handleInputChange = (field: keyof ProductCreate, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount);

  const getCategoryIcon = (category: string) => {
    const cat = PRODUCTS_CATEGORIES.find(c => c.value === category);
    return cat?.icon || 'category';
  };

  const getCategoryLabel = (category: string) => {
    const cat = PRODUCTS_CATEGORIES.find(c => c.value === category);
    return cat?.label || category;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products Catalog</h1>
          <p className="text-sm text-slate-500 mt-1">Manage all hospital products and inventory items ({total} total)</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/inventory/stock-overview')}
            className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50"
          >
            Stock Overview
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-sm inline-block align-middle mr-1">add</span>
            Add Product
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
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
            {PRODUCTS_CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded text-primary focus:ring-primary"
            />
            Show Inactive
          </label>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-slate-300">inventory_2</span>
            <p className="text-slate-500 mt-3">No products found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">SKU</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Purchase</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Selling</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Stock Levels</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map(product => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{product.product_name}</p>
                        {product.generic_name && (
                          <p className="text-xs text-slate-500">{product.generic_name}</p>
                        )}
                        {product.manufacturer && (
                          <p className="text-xs text-slate-400">{product.manufacturer}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-slate-400">
                          {getCategoryIcon(product.category)}
                        </span>
                        <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded capitalize">
                          {getCategoryLabel(product.category)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {product.sku || '—'}
                      {product.barcode && (
                        <p className="text-xs text-slate-400 font-mono">{product.barcode}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">
                      {formatCurrency(product.purchase_price)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">
                      {formatCurrency(product.selling_price)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="text-xs">
                        {product.available_stock !== undefined ? (
                          <>
                            <div className="font-semibold text-slate-900 mb-1">
                              Current: <span className={product.is_low_stock ? 'text-red-600' : 'text-emerald-600'}>{product.available_stock}</span>
                            </div>
                            <div className="text-slate-500">
                              Min: {product.min_stock_level} | Reorder: {product.reorder_level} | Max: {product.max_stock_level}
                            </div>
                          </>
                        ) : (
                          <div className="text-slate-500">
                            <div>Min: {product.min_stock_level}</div>
                            <div>Reorder: {product.reorder_level}</div>
                            <div>Max: {product.max_stock_level}</div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        product.is_active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {product.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenModal(product)}
                          className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-lg text-blue-500">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-lg text-red-400">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleCloseModal} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </h2>
                <p className="text-sm text-slate-500">
                  {editingProduct ? 'Update product information' : 'Add a new product to the catalog'}
                </p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-slate-500">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-700 pb-2 border-b border-slate-200">
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Product Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.product_name}
                      onChange={e => handleInputChange('product_name', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      placeholder="e.g., Paracetamol 650mg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Generic Name</label>
                    <input
                      type="text"
                      value={formData.generic_name}
                      onChange={e => handleInputChange('generic_name', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      placeholder="e.g., Acetaminophen"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Brand Name</label>
                    <input
                      type="text"
                      value={formData.brand_name}
                      onChange={e => handleInputChange('brand_name', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      placeholder="e.g., Crocin"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Category *</label>
                    <select
                      required
                      value={formData.category}
                      onChange={e => handleInputChange('category', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    >
                      {PRODUCTS_CATEGORIES.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">SKU</label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={e => handleInputChange('sku', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      placeholder="SKU-001"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Barcode</label>
                    <input
                      type="text"
                      value={formData.barcode}
                      onChange={e => handleInputChange('barcode', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      placeholder="1234567890123"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Manufacturer</label>
                    <input
                      type="text"
                      value={formData.manufacturer}
                      onChange={e => handleInputChange('manufacturer', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      placeholder="Manufacturer name"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-700 pb-2 border-b border-slate-200">
                  Pricing
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Purchase Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.purchase_price}
                      onChange={e => handleInputChange('purchase_price', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Selling Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.selling_price}
                      onChange={e => handleInputChange('selling_price', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">MRP (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.mrp}
                      onChange={e => handleInputChange('mrp', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Stock Levels */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-700 pb-2 border-b border-slate-200">
                  Stock Management
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Min Stock Level</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.min_stock_level}
                      onChange={e => handleInputChange('min_stock_level', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Reorder Level</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.reorder_level}
                      onChange={e => handleInputChange('reorder_level', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Max Stock Level</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.max_stock_level}
                      onChange={e => handleInputChange('max_stock_level', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Unit Type</label>
                    <input
                      type="text"
                      value={formData.unit_type}
                      onChange={e => handleInputChange('unit_type', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      placeholder="e.g., tablet, capsule, bottle, box"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Pack Size</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.pack_size}
                      onChange={e => handleInputChange('pack_size', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Special Handling */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-700 pb-2 border-b border-slate-200">
                  Special Handling
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={formData.requires_refrigeration}
                      onChange={e => handleInputChange('requires_refrigeration', e.target.checked)}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-slate-700">Refrigeration</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={formData.is_hazardous}
                      onChange={e => handleInputChange('is_hazardous', e.target.checked)}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-slate-700">Hazardous</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={formData.is_narcotic}
                      onChange={e => handleInputChange('is_narcotic', e.target.checked)}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-slate-700">Narcotic</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={formData.requires_prescription}
                      onChange={e => handleInputChange('requires_prescription', e.target.checked)}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-slate-700">Rx Required</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : (editingProduct ? 'Update Product' : 'Create Product')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
