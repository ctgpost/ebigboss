import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUserRole, AppRole, RolePermissions, PERMISSION_LABELS, PERMISSION_GROUPS, rolePermissions } from "@/hooks/useUserRole";
import { Shield, UserPlus, Trash2, Edit, Users, Crown, UserCog, User, Mail, Lock, KeyRound, Settings2, CheckCircle2, XCircle, Activity } from "lucide-react";
import { ActivityLogger } from "@/hooks/useActivityLog";

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  user_id: string;
  created_at: string;
}

export function UserManagement() {
  const { isAdmin, userId: currentUserId, loading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [newRole, setNewRole] = useState<AppRole>('staff');
  const [searchTerm, setSearchTerm] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>({});
  
  // New user form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('staff');
  const [addingUser, setAddingUser] = useState(false);

  // Fetch all users with their roles
  const { data: users, isLoading } = useQuery({
    queryKey: ['users-with-roles'],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at');
      
      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');
      
      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRole[] = (profiles || []).map((profile) => {
        const userRole = roles?.find(r => r.user_id === profile.id);
        return {
          id: profile.id,
          email: profile.email || '',
          full_name: profile.full_name,
          role: (userRole?.role as AppRole) || 'staff',
          user_id: profile.id,
          created_at: profile.created_at,
        };
      });

      return usersWithRoles;
    },
    enabled: isAdmin,
  });

  // Fetch permissions for selected user
  const { data: userPermissions, refetch: refetchPermissions } = useQuery({
    queryKey: ['user-permissions', selectedUser?.user_id],
    queryFn: async () => {
      if (!selectedUser) return [];
      const { data, error } = await supabase
        .from('user_permissions')
        .select('permission_key, granted')
        .eq('user_id', selectedUser.user_id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedUser && showPermissionsDialog,
  });

  const filteredUsers = users?.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openPermissionsDialog = (user: UserWithRole) => {
    setSelectedUser(user);
    // Initialize with role defaults
    const defaults = rolePermissions[user.role];
    const perms: Record<string, boolean> = {};
    for (const key of Object.keys(defaults)) {
      perms[key] = defaults[key as keyof RolePermissions];
    }
    setCustomPermissions(perms);
    setShowPermissionsDialog(true);
  };

  // Apply fetched custom permissions on top of defaults
  const applyFetchedPermissions = () => {
    if (!userPermissions || !selectedUser) return;
    const defaults = rolePermissions[selectedUser.role];
    const perms: Record<string, boolean> = {};
    for (const key of Object.keys(defaults)) {
      perms[key] = defaults[key as keyof RolePermissions];
    }
    for (const cp of userPermissions) {
      if (cp.permission_key in perms) {
        perms[cp.permission_key] = cp.granted;
      }
    }
    setCustomPermissions(perms);
  };

  // Effect: when userPermissions loads, apply them
  // Using a simple check instead of useEffect to avoid hook issues
  const [lastAppliedUser, setLastAppliedUser] = useState<string | null>(null);
  if (userPermissions && selectedUser && lastAppliedUser !== selectedUser.user_id) {
    const defaults = rolePermissions[selectedUser.role];
    const perms: Record<string, boolean> = {};
    for (const key of Object.keys(defaults)) {
      perms[key] = defaults[key as keyof RolePermissions];
    }
    for (const cp of userPermissions) {
      if (cp.permission_key in perms) {
        perms[cp.permission_key] = cp.granted;
      }
    }
    setCustomPermissions(perms);
    setLastAppliedUser(selectedUser.user_id);
  }

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    setSavingPermissions(true);

    try {
      // Delete existing permissions for this user
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', selectedUser.user_id);

      // Insert all custom permissions that differ from role defaults
      const defaults = rolePermissions[selectedUser.role];
      const inserts: { user_id: string; permission_key: string; granted: boolean; granted_by: string }[] = [];

      for (const [key, granted] of Object.entries(customPermissions)) {
        const defaultVal = defaults[key as keyof RolePermissions];
        if (granted !== defaultVal) {
          inserts.push({
            user_id: selectedUser.user_id,
            permission_key: key,
            granted,
            granted_by: currentUserId!,
          });
        }
      }

      if (inserts.length > 0) {
        const { error } = await supabase
          .from('user_permissions')
          .insert(inserts);
        if (error) throw error;
      }

      toast.success(`${selectedUser.full_name || selectedUser.email} এর অনুমতি আপডেট হয়েছে`);
      ActivityLogger.roleUpdated(selectedUser.email, 'custom_permissions');
      setShowPermissionsDialog(false);
      setLastAppliedUser(null);
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
    } catch (error: any) {
      toast.error('অনুমতি আপডেট করতে ব্যর্থ: ' + error.message);
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast.error("ইমেইল ও পাসওয়ার্ড দিতে হবে");
      return;
    }

    if (newUserPassword.length < 6) {
      toast.error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      return;
    }

    setAddingUser(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: newUserName || newUserEmail
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (newUserRole !== 'staff') {
          const { error: roleError } = await supabase
            .from('user_roles')
            .update({ role: newUserRole })
            .eq('user_id', authData.user.id);

          if (roleError) console.error('Role update error:', roleError);
        }

        if (newUserName) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ full_name: newUserName })
            .eq('id', authData.user.id);

          if (profileError) console.error('Profile update error:', profileError);
        }

        toast.success(`নতুন ${newUserRole === 'admin' ? 'এডমিন' : newUserRole === 'manager' ? 'ম্যানেজার' : 'স্টাফ'} যুক্ত হয়েছে: ${newUserEmail}`);
        ActivityLogger.roleUpdated(newUserEmail, newUserRole);
        queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
        setShowAddDialog(false);
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserName('');
        setNewUserRole('staff');
      }
    } catch (error: any) {
      if (error.message?.includes('already registered')) {
        toast.error("এই ইমেইল দিয়ে ইতিমধ্যে একাউন্ট আছে");
      } else {
        toast.error('ব্যবহারকারী যুক্ত করতে ব্যর্থ: ' + error.message);
      }
    } finally {
      setAddingUser(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;

    try {
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', selectedUser.user_id)
        .maybeSingle();

      if (existingRole) {
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', selectedUser.user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: selectedUser.user_id, role: newRole });
        if (error) throw error;
      }

      // Clear custom permissions when role changes
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', selectedUser.user_id);

      toast.success(`রোল আপডেট হয়েছে: ${selectedUser.email} → ${newRole === 'admin' ? 'এডমিন' : newRole === 'manager' ? 'ম্যানেজার' : 'স্টাফ'}`);
      ActivityLogger.roleUpdated(selectedUser.email, newRole);
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      setShowEditDialog(false);
      setSelectedUser(null);
    } catch (error: any) {
      toast.error('রোল আপডেট করতে ব্যর্থ: ' + error.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      await supabase.from('user_permissions').delete().eq('user_id', selectedUser.user_id);
      const { error: roleError } = await supabase.from('user_roles').delete().eq('user_id', selectedUser.user_id);
      if (roleError) throw roleError;

      toast.success(`ব্যবহারকারী সরানো হয়েছে: ${selectedUser.email}`);
      ActivityLogger.roleUpdated(selectedUser.email, 'deleted');
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      setShowDeleteDialog(false);
      setSelectedUser(null);
    } catch (error: any) {
      toast.error('ব্যবহারকারী সরাতে ব্যর্থ: ' + error.message);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser?.email) return;

    setResetPasswordLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(selectedUser.email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;

      toast.success(`পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে: ${selectedUser.email}`);
      setShowResetPasswordDialog(false);
      setSelectedUser(null);
    } catch (error: any) {
      toast.error('পাসওয়ার্ড রিসেট ইমেইল পাঠাতে ব্যর্থ: ' + error.message);
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const getRoleBadge = (role: AppRole) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-red-500 hover:bg-red-600"><Crown className="w-3 h-3 mr-1" />এডমিন</Badge>;
      case 'manager':
        return <Badge className="bg-blue-500 hover:bg-blue-600"><UserCog className="w-3 h-3 mr-1" />ম্যানেজার</Badge>;
      case 'staff':
        return <Badge variant="secondary"><User className="w-3 h-3 mr-1" />স্টাফ</Badge>;
    }
  };

  const getRoleDescription = (role: AppRole) => {
    switch (role) {
      case 'admin':
        return 'সম্পূর্ণ সিস্টেম অ্যাক্সেস ও ব্যবহারকারী ব্যবস্থাপনা';
      case 'manager':
        return 'প্রোডাক্ট, সেলস ও রিপোর্ট ব্যবস্থাপনা';
      case 'staff':
        return 'শুধুমাত্র সেলস অপারেশন';
    }
  };

  const getCustomPermissionCount = (userId: string) => {
    // This is a visual indicator — we'd need separate query per user for accuracy
    // For now we show the badge only for the selected user
    return null;
  };

  if (roleLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">অ্যাক্সেস সীমাবদ্ধ</h3>
          <p className="text-muted-foreground">শুধুমাত্র এডমিন ব্যবহারকারী ব্যবস্থাপনা করতে পারেন।</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">👥 ব্যবহারকারী ব্যবস্থাপনা</h2>
        </div>
        <Button 
          onClick={() => setShowAddDialog(true)}
          className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          নতুন ব্যবহারকারী যুক্ত করুন
        </Button>
      </div>

      {/* Role Legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-5 h-5 text-red-500" />
            <span className="font-semibold text-red-600">এডমিন</span>
          </div>
          <p className="text-sm text-muted-foreground">{getRoleDescription('admin')}</p>
        </div>
        <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <UserCog className="w-5 h-5 text-blue-500" />
            <span className="font-semibold text-blue-600">ম্যানেজার</span>
          </div>
          <p className="text-sm text-muted-foreground">{getRoleDescription('manager')}</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold text-foreground">স্টাফ</span>
          </div>
          <p className="text-sm text-muted-foreground">{getRoleDescription('staff')}</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="ইমেইল বা নাম দিয়ে খুঁজুন..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Users Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ব্যবহারকারী</TableHead>
                <TableHead>ইমেইল</TableHead>
                <TableHead>রোল</TableHead>
                <TableHead>যুক্ত হয়েছে</TableHead>
                <TableHead className="text-right">অ্যাকশন</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    কোনো ব্যবহারকারী পাওয়া যায়নি
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-medium text-foreground">{user.full_name || 'নাম নেই'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">{user.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(user.created_at).toLocaleDateString('bn-BD')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {/* Permission Assignment Button */}
                        {user.role !== 'admin' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPermissionsDialog(user)}
                            title="দায়িত্ব বন্টন / অনুমতি"
                            className="border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                          >
                            <Settings2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setNewRole(user.role);
                            setShowEditDialog(true);
                          }}
                          title="রোল পরিবর্তন"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {user.user_id !== currentUserId && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setShowResetPasswordDialog(true);
                              }}
                              title="পাসওয়ার্ড রিসেট"
                              className="border-amber-500 text-amber-600 hover:bg-amber-50"
                            >
                              <KeyRound className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setShowDeleteDialog(true);
                              }}
                              title="ব্যবহারকারী সরান"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Stats */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>মোট ব্যবহারকারী: <strong className="text-foreground">{users?.length || 0}</strong></span>
          <span>এডমিন: <strong className="text-red-600">{users?.filter(u => u.role === 'admin').length || 0}</strong></span>
          <span>ম্যানেজার: <strong className="text-blue-600">{users?.filter(u => u.role === 'manager').length || 0}</strong></span>
          <span>স্টাফ: <strong className="text-foreground">{users?.filter(u => u.role === 'staff').length || 0}</strong></span>
        </div>
      </div>

      {/* ========== PERMISSIONS DIALOG ========== */}
      <Dialog open={showPermissionsDialog} onOpenChange={(open) => {
        setShowPermissionsDialog(open);
        if (!open) setLastAppliedUser(null);
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-emerald-500" />
              দায়িত্ব বন্টন / অনুমতি সেটিংস
            </DialogTitle>
            <DialogDescription>
              <strong>{selectedUser?.full_name || selectedUser?.email}</strong> ({getRoleBadge(selectedUser?.role || 'staff')}) এর জন্য কাস্টম অনুমতি নির্ধারণ করুন
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
              <p className="text-sm text-amber-700">
                ⚠️ রোল পরিবর্তন করলে কাস্টম অনুমতি রিসেট হয়ে যাবে। আগে রোল ঠিক করুন, তারপর অনুমতি দিন।
              </p>
            </div>

            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label} className="space-y-3">
                <h4 className="font-semibold text-sm text-foreground border-b border-border pb-1">{group.label}</h4>
                {group.keys.map((key) => {
                  const isDefault = rolePermissions[selectedUser?.role || 'staff'][key];
                  const isGranted = customPermissions[key] ?? isDefault;
                  const isOverridden = isGranted !== isDefault;

                  return (
                    <div key={key} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        {isGranted ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span className="text-sm text-foreground">{PERMISSION_LABELS[key]}</span>
                        {isOverridden && (
                          <Badge variant="outline" className="text-xs px-1 py-0 border-amber-400 text-amber-600">
                            কাস্টম
                          </Badge>
                        )}
                      </div>
                      <Switch
                        checked={isGranted}
                        onCheckedChange={(checked) => {
                          setCustomPermissions(prev => ({ ...prev, [key]: checked }));
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-between pt-2 border-t">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                // Reset to role defaults
                const defaults = rolePermissions[selectedUser?.role || 'staff'];
                const perms: Record<string, boolean> = {};
                for (const key of Object.keys(defaults)) {
                  perms[key] = defaults[key as keyof RolePermissions];
                }
                setCustomPermissions(perms);
              }}
            >
              ডিফল্ট রিসেট
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowPermissionsDialog(false); setLastAppliedUser(null); }}>
                বাতিল
              </Button>
              <Button 
                onClick={handleSavePermissions}
                disabled={savingPermissions}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {savingPermissions ? "সেভ হচ্ছে..." : "✅ অনুমতি সেভ করুন"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== ADD USER DIALOG ========== */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              নতুন ব্যবহারকারী যুক্ত করুন
            </DialogTitle>
            <DialogDescription>
              নতুন স্টাফ বা ম্যানেজার তৈরি করুন
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="newUserName" className="mb-2 block">নাম</Label>
              <Input
                id="newUserName"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="ব্যবহারকারীর নাম"
              />
            </div>
            <div>
              <Label htmlFor="newUserEmail" className="mb-2 block">ইমেইল *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="newUserEmail"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="newUserPassword" className="mb-2 block">পাসওয়ার্ড *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="newUserPassword"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="কমপক্ষে ৬ অক্ষর"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="newUserRole" className="mb-2 block">রোল নির্বাচন করুন</Label>
              <Select value={newUserRole} onValueChange={(value: AppRole) => setNewUserRole(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="রোল নির্বাচন করুন" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      স্টাফ - সেলস অপারেশন
                    </div>
                  </SelectItem>
                  <SelectItem value="manager">
                    <div className="flex items-center gap-2">
                      <UserCog className="w-4 h-4 text-blue-500" />
                      ম্যানেজার - প্রোডাক্ট ও সেলস ব্যবস্থাপনা
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-red-500" />
                      এডমিন - সম্পূর্ণ অ্যাক্সেস
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              বাতিল
            </Button>
            <Button 
              onClick={handleAddUser} 
              disabled={addingUser || !newUserEmail || !newUserPassword}
              className="bg-primary"
            >
              {addingUser ? "যুক্ত হচ্ছে..." : "ব্যবহারকারী যুক্ত করুন"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== EDIT ROLE DIALOG ========== */}
      <AlertDialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>রোল আপডেট করুন</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{selectedUser?.email}</strong> এর রোল পরিবর্তন করুন। রোল পরিবর্তনে কাস্টম অনুমতি রিসেট হবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="role" className="mb-2 block">রোল নির্বাচন করুন</Label>
            <Select value={newRole} onValueChange={(value: AppRole) => setNewRole(value)}>
              <SelectTrigger>
                <SelectValue placeholder="রোল নির্বাচন করুন" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-red-500" />
                    এডমিন - সম্পূর্ণ অ্যাক্সেস
                  </div>
                </SelectItem>
                <SelectItem value="manager">
                  <div className="flex items-center gap-2">
                    <UserCog className="w-4 h-4 text-blue-500" />
                    ম্যানেজার - প্রোডাক্ট ও সেলস ব্যবস্থাপনা
                  </div>
                </SelectItem>
                <SelectItem value="staff">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    স্টাফ - সেলস অপারেশন
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateRole}>রোল আপডেট করুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ========== DELETE USER DIALOG ========== */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ব্যবহারকারী সরান</AlertDialogTitle>
            <AlertDialogDescription>
              আপনি কি নিশ্চিত যে <strong>{selectedUser?.email}</strong> কে সরাতে চান? 
              এটি তাদের রোল, অনুমতি ও প্রোফাইল সিস্টেম থেকে সরিয়ে দেবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive hover:bg-destructive/90">
              ব্যবহারকারী সরান
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ========== PASSWORD RESET DIALOG ========== */}
      <AlertDialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-500" />
              পাসওয়ার্ড রিসেট লিংক পাঠান
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{selectedUser?.email}</strong> এ পাসওয়ার্ড রিসেট লিংক পাঠানো হবে। 
              ব্যবহারকারী ইমেইলে প্রাপ্ত লিংকে ক্লিক করে নতুন পাসওয়ার্ড সেট করতে পারবেন।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetPasswordLoading}>বাতিল</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleResetPassword} 
              disabled={resetPasswordLoading}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {resetPasswordLoading ? "পাঠানো হচ্ছে..." : "📧 রিসেট লিংক পাঠান"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
