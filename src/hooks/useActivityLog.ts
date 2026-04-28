import { supabase } from '@/integrations/supabase/client';

export type ActionType = 
  | 'auth' 
  | 'sale' 
  | 'product' 
  | 'customer' 
  | 'supplier' 
  | 'category'
  | 'settings'
  | 'user_management'
  | 'return';

export interface LogActivityParams {
  action: string;
  actionType: ActionType;
  details?: Record<string, any>;
}

export async function logActivity({ action, actionType, details }: LogActivityParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      user_email: user.email,
      action,
      action_type: actionType,
      details: details || {},
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// Convenience functions for common actions
export const ActivityLogger = {
  login: () => logActivity({
    action: 'User logged in',
    actionType: 'auth',
  }),
  
  logout: () => logActivity({
    action: 'User logged out',
    actionType: 'auth',
  }),
  
  saleCreated: (saleId: string, amount: number, itemCount: number) => logActivity({
    action: `Sale completed: $${amount.toFixed(2)} (${itemCount} items)`,
    actionType: 'sale',
    details: { sale_id: saleId, amount, item_count: itemCount },
  }),
  
  productAdded: (productName: string, productId: string, condition?: string) => {
    const condLabel = condition === 'new' ? 'নতুন' : condition === 'used' ? 'ব্যবহৃত' : '';
    return logActivity({
      action: `প্রোডাক্ট যুক্ত: ${productName}${condLabel ? ` (${condLabel})` : ''}`,
      actionType: 'product',
      details: { product_id: productId, product_name: productName, condition: condition || null },
    });
  },

  productUpdated: (productName: string, productId: string, condition?: string) => {
    const condLabel = condition === 'new' ? 'নতুন' : condition === 'used' ? 'ব্যবহৃত' : '';
    return logActivity({
      action: `প্রোডাক্ট আপডেট: ${productName}${condLabel ? ` (${condLabel})` : ''}`,
      actionType: 'product',
      details: { product_id: productId, product_name: productName, condition: condition || null },
    });
  },

  productDeleted: (productName: string, condition?: string) => {
    const condLabel = condition === 'new' ? 'নতুন' : condition === 'used' ? 'ব্যবহৃত' : '';
    return logActivity({
      action: `প্রোডাক্ট ডিলিট: ${productName}${condLabel ? ` (${condLabel})` : ''}`,
      actionType: 'product',
      details: { product_name: productName, condition: condition || null },
    });
  },
  
  customerAdded: (customerName: string) => logActivity({
    action: `Customer added: ${customerName}`,
    actionType: 'customer',
    details: { customer_name: customerName },
  }),
  
  customerUpdated: (customerName: string) => logActivity({
    action: `Customer updated: ${customerName}`,
    actionType: 'customer',
    details: { customer_name: customerName },
  }),
  
  supplierAdded: (supplierName: string) => logActivity({
    action: `Supplier added: ${supplierName}`,
    actionType: 'supplier',
    details: { supplier_name: supplierName },
  }),
  
  categoryAdded: (categoryName: string) => logActivity({
    action: `Category added: ${categoryName}`,
    actionType: 'category',
    details: { category_name: categoryName },
  }),
  
  roleUpdated: (targetEmail: string, newRole: string) => logActivity({
    action: `User role updated: ${targetEmail} → ${newRole}`,
    actionType: 'user_management',
    details: { target_email: targetEmail, new_role: newRole },
  }),
  
  dataBackup: () => logActivity({
    action: 'Database backup created',
    actionType: 'settings',
  }),
  
  dataRestore: () => logActivity({
    action: 'Database restored from backup',
    actionType: 'settings',
  }),
  
  dataReset: () => logActivity({
    action: 'Database reset performed',
    actionType: 'settings',
  }),

  returnCreated: (productName: string, qty: number, refund: number, isAuditOnly: boolean, reason: string, returnId: string) => logActivity({
    action: `${isAuditOnly ? 'রিটার্ন নোট (অডিট-অনলি)' : 'রিটার্ন তৈরি'}: ${productName} (×${qty}) — ৳${refund.toFixed(2)} | কারণ: ${reason}`,
    actionType: 'return',
    details: { return_id: returnId, product_name: productName, quantity: qty, refund_amount: refund, is_audit_only: isAuditOnly, reason_code: reason },
  }),

  returnProcessed: (returnId: string, status: string, productName: string, refund: number) => logActivity({
    action: `রিটার্ন ${status === 'completed' ? 'অনুমোদন ও সম্পন্ন' : 'প্রত্যাখ্যাত'}: ${productName} — ৳${refund.toFixed(2)}`,
    actionType: 'return',
    details: { return_id: returnId, status, product_name: productName, refund_amount: refund },
  }),

  supplierReturnCreated: (returnNumber: string, supplierName: string, amount: number, status: string) => logActivity({
    action: `সাপ্লায়ার রিটার্ন তৈরি: ${returnNumber} — ${supplierName} — ৳${amount.toFixed(2)} (${status === 'completed' ? 'সম্পন্ন' : 'অপেক্ষমাণ'})`,
    actionType: 'supplier',
    details: { supplier_return_number: returnNumber, supplier_name: supplierName, refund_amount: amount, status },
  }),

  supplierReturnProcessed: (returnNumber: string, status: string, supplierName: string, amount: number) => logActivity({
    action: `সাপ্লায়ার রিটার্ন ${status === 'completed' ? 'অনুমোদন ও সম্পন্ন' : 'প্রত্যাখ্যাত'}: ${returnNumber} — ${supplierName} — ৳${amount.toFixed(2)}`,
    actionType: 'supplier',
    details: { supplier_return_number: returnNumber, status, supplier_name: supplierName, refund_amount: amount },
  }),
};
