/**
 * Automatic Reorder Service Helper
 * 
 * Handles automatic purchase order generation when stock falls below reorder levels.
 * Provides intelligent grouping and batch creation for efficiency.
 */

import inventoryService from './inventoryService';
import pharmacyService from './pharmacyService';
import type { Supplier, PurchaseOrderItemCreate } from '../types/inventory';
import type { Medicine } from '../types/pharmacy';

interface ReorderRule {
  enabled: boolean;
  autoCreatePO: boolean;
  groupBySupplier: boolean;
  maxItemsPerPO: number;
  defaultLeadTimeDays: number;
}

interface ReorderCandidate {
  medicine: Medicine;
  suggestedQuantity: number;
  estimatedCost: number;
  preferredSupplierId?: string;
}

/**
 * Default reorder rules
 */
const DEFAULT_REORDER_RULES: ReorderRule = {
  enabled: true,
  autoCreatePO: false, // Requires manual approval
  groupBySupplier: true,
  maxItemsPerPO: 50,
  defaultLeadTimeDays: 7,
};

/**
 * Get items that need reordering
 */
export async function getReorderCandidates(): Promise<ReorderCandidate[]> {
  try {
    const lowStockItems = await inventoryService.getLowStock(200);
    const candidates: ReorderCandidate[] = [];

    for (const item of lowStockItems) {
      // Fetch full medicine details
      const medicines = await pharmacyService.getMedicines(1, 1, '', item.item_name);
      const medicine = medicines.data[0];

      if (!medicine) continue;

      // Calculate suggested quantity
      const suggestedQuantity = Math.max(
        medicine.max_stock_level || medicine.reorder_level! * 3,
        medicine.reorder_level! * 2,
      ) - item.current_stock;

      const estimatedCost = suggestedQuantity * (medicine.purchase_price || 0);

      candidates.push({
        medicine,
        suggestedQuantity,
        estimatedCost,
        preferredSupplierId: undefined, // Could fetch from medicine or supplier history
      });
    }

    return candidates;
  } catch (error) {
    console.error('Error getting reorder candidates:', error);
    throw error;
  }
}

/**
 * Create automatic purchase order for candidates
 */
export async function createAutomaticPurchaseOrder(
  candidates: ReorderCandidate[],
  supplierId: string,
  rules: ReorderRule = DEFAULT_REORDER_RULES,
): Promise<any> {
  if (!rules.autoCreatePO) {
    throw new Error('Automatic PO creation is disabled in reorder rules');
  }

  if (candidates.length === 0) {
    throw new Error('No candidates provided for purchase order');
  }

  try {
    // Group by supplier if enabled
    const groupedCandidates: { [supplierId: string]: ReorderCandidate[] } = {};

    if (rules.groupBySupplier) {
      candidates.forEach(c => {
        const sid = c.preferredSupplierId || supplierId;
        if (!groupedCandidates[sid]) groupedCandidates[sid] = [];
        groupedCandidates[sid].push(c);
      });
    } else {
      groupedCandidates[supplierId] = candidates;
    }

    // Create POs for each supplier
    const createdPOs = [];

    for (const [sId, items] of Object.entries(groupedCandidates)) {
      // Split into chunks if necessary
      for (let i = 0; i < items.length; i += rules.maxItemsPerPO) {
        const chunk = items.slice(i, i + rules.maxItemsPerPO);

        const poItems: PurchaseOrderItemCreate[] = chunk.map(c => ({
          item_type: 'medicine',
          item_id: c.medicine.id,
          item_name: c.medicine.name,
          quantity_ordered: c.suggestedQuantity,
          unit_price: c.medicine.purchase_price || 0,
          total_price: c.suggestedQuantity * (c.medicine.purchase_price || 0),
        }));

        const expectedDelivery = new Date();
        expectedDelivery.setDate(expectedDelivery.getDate() + rules.defaultLeadTimeDays);

        const po = await inventoryService.createPurchaseOrder({
          supplier_id: sId,
          order_date: new Date().toISOString().split('T')[0],
          expected_delivery_date: expectedDelivery.toISOString().split('T')[0],
          notes: `Auto-generated reorder for ${chunk.length} low-stock items on ${new Date().toLocaleDateString()}`,
          items: poItems,
        });

        createdPOs.push(po);
      }
    }

    return createdPOs;
  } catch (error) {
    console.error('Error creating automatic purchase order:', error);
    throw error;
  }
}

/**
 * Check stock levels and trigger reorder alerts
 */
export async function checkAndTriggerReorders(rules: ReorderRule = DEFAULT_REORDER_RULES): Promise<{
  candidates: ReorderCandidate[];
  autoCreated?: any[];
}> {
  if (!rules.enabled) {
    return { candidates: [] };
  }

  try {
    const candidates = await getReorderCandidates();

    if (candidates.length === 0) {
      return { candidates: [] };
    }

    // If auto-create is disabled, just return candidates for manual review
    if (!rules.autoCreatePO) {
      return { candidates };
    }

    // Auto-create POs if enabled
    const autoCreatedPOs = await createAutomaticPurchaseOrder(
      candidates,
      '', // Would use default supplier
      rules,
    );

    return {
      candidates,
      autoCreated: autoCreatedPOs,
    };
  } catch (error) {
    console.error('Error checking and triggering reorders:', error);
    throw error;
  }
}

/**
 * Validate medicine has proper reorder configuration
 */
export function isValidForReorder(medicine: Medicine): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!medicine.reorder_level || medicine.reorder_level <= 0) {
    issues.push('Reorder level not configured');
  }

  if (!medicine.max_stock_level || medicine.max_stock_level <= 0) {
    issues.push('Max stock level not configured');
  }

  if (!medicine.purchase_price || medicine.purchase_price <= 0) {
    issues.push('Purchase price not configured');
  }

  if (medicine.reorder_level && medicine.max_stock_level && medicine.reorder_level >= medicine.max_stock_level) {
    issues.push('Reorder level >= max stock level');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Get reorder statistics
 */
export async function getReorderStats(): Promise<{
  totalItems: number;
  itemsNeedingReorder: number;
  itemsWithIssues: number;
  estimatedTotalCost: number;
  avgLeadTime: number;
}> {
  try {
    const candidates = await getReorderCandidates();
    const medicines = await pharmacyService.getMedicines(1, 1000);

    let itemsWithIssues = 0;
    let totalLeadTime = 0;
    let leadTimeCount = 0;

    medicines.data.forEach(m => {
      const validation = isValidForReorder(m);
      if (!validation.valid) {
        itemsWithIssues++;
      }
    });

    // Fetch suppliers for lead time
    const suppliersRes = await inventoryService.getSuppliers(1, 100, '', true);
    const suppliers = suppliersRes.data;

    suppliers.forEach(s => {
      if (s.lead_time_days) {
        totalLeadTime += s.lead_time_days;
        leadTimeCount++;
      }
    });

    const estimatedTotalCost = candidates.reduce((sum, c) => sum + c.estimatedCost, 0);

    return {
      totalItems: medicines.data.length,
      itemsNeedingReorder: candidates.length,
      itemsWithIssues,
      estimatedTotalCost,
      avgLeadTime: leadTimeCount > 0 ? totalLeadTime / leadTimeCount : 7,
    };
  } catch (error) {
    console.error('Error getting reorder stats:', error);
    throw error;
  }
}

/**
 * Batch check reorder for multiple items (utility)
 */
export function batchCheckReorder(medicines: Medicine[]): {
  medicine: Medicine;
  needsReorder: boolean;
  suggestedQuantity: number;
  issues: string[];
}[] {
  return medicines.map(m => {
    const validation = isValidForReorder(m);
    const needsReorder = (m.total_stock || 0) < (m.reorder_level || 0);
    const suggestedQuantity = Math.max(
      m.max_stock_level || (m.reorder_level || 0) * 3,
      (m.reorder_level || 0) * 2,
    ) - (m.total_stock || 0);

    return {
      medicine: m,
      needsReorder,
      suggestedQuantity,
      issues: validation.issues,
    };
  });
}

export default {
  getReorderCandidates,
  createAutomaticPurchaseOrder,
  checkAndTriggerReorders,
  isValidForReorder,
  getReorderStats,
  batchCheckReorder,
  DEFAULT_REORDER_RULES,
};
