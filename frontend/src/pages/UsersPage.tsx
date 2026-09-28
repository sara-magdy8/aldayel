import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import ResetFiltersButton from '@/components/ResetFiltersButton';
import DataTablePagination, { DEFAULT_PER_PAGE } from '@/components/DataTablePagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { usersService, AppUser, Role, UserFormData } from '@/services/users';
import { authService } from '@/services/auth';
import { ApiError } from '@/services/api';
import UserFormDialog from '@/components/UserFormDialog';

/**
 * Badge colour per role slug. Labels are not listed here — those come from the
 * roles table with the user — so a role added there still renders, just in the
 * neutral fallback colour until someone picks one for it.
 */
const roleColors: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  staff: 'bg-blue-100 text-blue-800',
};

const UsersPage = () => {
  const currentUserId = String(authService.getUser()?.id ?? '');

  // ── Table data ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // Page size is ours to choose (the "عرض N سجل" dropdown); `total` feeds the row summary.
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [total, setTotal] = useState(0);

  // ── Filters ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('الكل');
  // الصلاحيات from the roles table — feeds both the filter and the form dialog.
  const [roles, setRoles] = useState<Role[]>([]);

  // ── Dialogs ─────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Debounce search → reset page ────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [roleFilter]);

  // Changing the page size restarts from page 1 — batched with the size change
  // itself so the list refetches once, not twice.
  const handlePerPageChange = (n: number) => {
    setPerPage(n);
    setPage(1);
  };

  useEffect(() => {
    usersService.roles().then(setRoles).catch(() => { /* the picker stays empty */ });
  }, []);

  // ── Filter reset ────────────────────────────────────────────────────────
  // 'الكل' is the role filter's neutral value, not an empty string.
  const hasActiveFilters = search !== '' || roleFilter !== 'الكل';

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('الكل');
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersService.list({ search: debouncedSearch, role: roleFilter, page, per_page: perPage });
      setUsers(res.data);
      setLastPage(res.last_page);
      setTotal(res.total);
    } catch {
      toast.error('تعذّر تحميل قائمة المستخدمين');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, roleFilter, page, perPage]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Save (create / update) ────────────────────────────────────────────────
  const handleSave = async (data: UserFormData) => {
    try {
      if (editingUser) {
        await usersService.update(editingUser.id, data);
        toast.success('تم تعديل بيانات المستخدم');
      } else {
        await usersService.create(data);
        toast.success('تم إضافة المستخدم بنجاح');
      }
      fetchUsers();
    } catch (err) {
      const apiErr = err as ApiError;
      const firstFieldError = apiErr.errors ? Object.values(apiErr.errors)[0]?.[0] : undefined;
      toast.error(firstFieldError ?? apiErr.message ?? 'حدث خطأ، يرجى المحاولة مجدداً');
    } finally {
      setEditingUser(null);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await usersService.remove(deleteId);
      toast.success('تم حذف المستخدم');
      setDeleteId(null);
      fetchUsers();
    } catch (err) {
      toast.error((err as ApiError)?.message ?? 'تعذّر حذف المستخدم');
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-foreground">المستخدمون</h2>
        <Button onClick={() => { setEditingUser(null); setFormOpen(true); }} className="gap-2 w-full sm:w-auto">
          <Plus size={18} />
          إضافة مستخدم
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="role-filter">بحث</Label>
          <Input
            placeholder="بحث بالاسم أو البريد الإلكتروني..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full md:w-64"
          />
        </div>
        <div className="w-full md:w-36 space-y-1.5">
          <Label htmlFor="role-filter">الصلاحية</Label>
          <SearchableSelect
            className="w-full"
            value={roleFilter}
            onValueChange={setRoleFilter}
            options={[
              { value: 'الكل', label: 'كل الصلاحيات' },
              ...roles.map(r => ({ value: r.slug, label: r.name })),
            ]}
          />
        </div>
        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} />
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>الاسم</TableHead>
              <TableHead>البريد الإلكتروني</TableHead>
              <TableHead>الصلاحية</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="inline animate-spin text-muted-foreground" size={24} />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا يوجد مستخدمون</TableCell>
              </TableRow>
            ) : (
              users.map((u, i) => (
                <TableRow key={u.id}>
                  <TableCell>{(page - 1) * perPage + i + 1}</TableCell>
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === currentUserId && <span className="text-xs text-muted-foreground"> (أنت)</span>}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={roleColors[u.role]}>{u.role_name ?? u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {u.is_active
                      ? <Badge variant="secondary" className="bg-green-100 text-green-800">نشط</Badge>
                      : <Badge variant="secondary" className="bg-gray-100 text-gray-600">غير نشط</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingUser(u); setFormOpen(true); }} title="تعديل">
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(u.id)}
                        disabled={u.id === currentUserId}
                        title={u.id === currentUserId ? 'لا يمكنك حذف حسابك' : 'حذف'}
                        className="text-destructive hover:text-destructive disabled:opacity-40"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <DataTablePagination
        currentPage={page}
        lastPage={lastPage}
        total={total}
        perPage={perPage}
        loading={loading}
        onPageChange={setPage}
        onPerPageChange={handlePerPageChange}
      />

      {/* Form */}
      <UserFormDialog
        open={formOpen}
        onOpenChange={o => { setFormOpen(o); if (!o) setEditingUser(null); }}
        user={editingUser}
        roles={roles}
        onSave={handleSave}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="animate-spin" size={16} /> : 'حذف'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsersPage;
