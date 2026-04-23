import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'manager' | 'staff';

export interface RolePermissions {
  canAccessSettings: boolean;
  canAccessReports: boolean;
  canAccessUserManagement: boolean;
  canManageProducts: boolean;
  canManageCustomers: boolean;
  canManageSuppliers: boolean;
  canManageCategories: boolean;
  canAccessPOS: boolean;
  canAccessSales: boolean;
  canAccessReturns: boolean;
  canAccessDashboard: boolean;
  canBackupRestore: boolean;
  canResetData: boolean;
}

export const PERMISSION_LABELS: Record<keyof RolePermissions, string> = {
  canAccessDashboard: 'ড্যাশবোর্ড',
  canManageProducts: 'প্রোডাক্ট ব্যবস্থাপনা',
  canAccessPOS: 'POS (বিক্রয়)',
  canAccessSales: 'সেলস হিস্টোরি',
  canManageCustomers: 'কাস্টমার ব্যবস্থাপনা',
  canManageSuppliers: 'সাপ্লায়ার ব্যবস্থাপনা',
  canManageCategories: 'ক্যাটাগরি ব্যবস্থাপনা',
  canAccessReturns: 'রিটার্ন ব্যবস্থাপনা',
  canAccessReports: 'রিপোর্ট',
  canAccessSettings: 'সেটিংস',
  canAccessUserManagement: 'ব্যবহারকারী ব্যবস্থাপনা',
  canBackupRestore: 'ব্যাকআপ / রিস্টোর',
  canResetData: 'ডাটা রিসেট',
};

export const PERMISSION_GROUPS: { label: string; keys: (keyof RolePermissions)[] }[] = [
  {
    label: '📊 প্রধান পেজ',
    keys: ['canAccessDashboard', 'canAccessPOS', 'canAccessSales'],
  },
  {
    label: '📦 ইনভেন্টরি',
    keys: ['canManageProducts', 'canManageCategories', 'canManageSuppliers'],
  },
  {
    label: '👥 কাস্টমার ও রিটার্ন',
    keys: ['canManageCustomers', 'canAccessReturns'],
  },
  {
    label: '⚙️ অ্যাডমিন',
    keys: ['canAccessReports', 'canAccessSettings', 'canAccessUserManagement', 'canBackupRestore', 'canResetData'],
  },
];

const rolePermissions: Record<AppRole, RolePermissions> = {
  admin: {
    canAccessSettings: true,
    canAccessReports: true,
    canAccessUserManagement: true,
    canManageProducts: true,
    canManageCustomers: true,
    canManageSuppliers: true,
    canManageCategories: true,
    canAccessPOS: true,
    canAccessSales: true,
    canAccessReturns: true,
    canAccessDashboard: true,
    canBackupRestore: true,
    canResetData: true,
  },
  manager: {
    canAccessSettings: false,
    canAccessReports: false,
    canAccessUserManagement: false,
    canManageProducts: true,
    canManageCustomers: false,
    canManageSuppliers: false,
    canManageCategories: false,
    canAccessPOS: false,
    canAccessSales: true,
    canAccessReturns: true,
    canAccessDashboard: true,
    canBackupRestore: true,
    canResetData: false,
  },
  staff: {
    canAccessSettings: false,
    canAccessReports: false,
    canAccessUserManagement: false,
    canManageProducts: false,
    canManageCustomers: false,
    canManageSuppliers: false,
    canManageCategories: false,
    canAccessPOS: true,
    canAccessSales: true,
    canAccessReturns: true,
    canAccessDashboard: true,
    canBackupRestore: false,
    canResetData: false,
  },
};

export { rolePermissions };

export function useUserRole() {
  const [role, setRole] = useState<AppRole | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions>(rolePermissions.staff);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        setUserId(user.id);

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching role:', error);
        }

        const userRole = (data?.role as AppRole) || 'staff';
        setRole(userRole);
        setIsAdmin(userRole === 'admin');
        setIsManager(userRole === 'manager' || userRole === 'admin');

        // Start with role defaults
        const basePerms = { ...rolePermissions[userRole] };

        // Admin always gets everything — skip custom permission fetch
        if (userRole === 'admin') {
          setPermissions(basePerms);
        } else {
          // Fetch custom permission overrides
          const { data: customPerms } = await supabase
            .from('user_permissions')
            .select('permission_key, granted')
            .eq('user_id', user.id);

          if (customPerms && customPerms.length > 0) {
            for (const cp of customPerms) {
              const key = cp.permission_key as keyof RolePermissions;
              if (key in basePerms) {
                basePerms[key] = cp.granted;
              }
            }
          }
          setPermissions(basePerms);
        }
      } catch (error) {
        console.error('Error in useUserRole:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchRole();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { role, isAdmin, isManager, loading, userId, permissions };
}
