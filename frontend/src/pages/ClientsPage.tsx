import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Eye, Pencil, Trash2, Users, Building2, User, Handshake, UserCog, Loader2 } from 'lucide-react';
import DataTablePagination, { DEFAULT_PER_PAGE } from '@/components/DataTablePagination';
import ResetFiltersButton from '@/components/ResetFiltersButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Client } from '@/types';
import { CLIENT_TYPES } from '@/lib/clientTypes';
import { clientsService, ClientStats, ClientWithRelations } from '@/services/clients';
import { ApiError } from '@/services/api';
import ClientFormDialog from '@/components/ClientFormDialog';
import ClientViewDrawer from '@/components/ClientViewDrawer';
import { Label } from '@/components/ui/label';

const clientStatusColors: Record<string, string> = {
  'نشط': 'bg-green-100 text-green-800',
  'غير نشط': 'bg-gray-100 text-gray-800',
};

const clientTypeColors: Record<string, string> = {
  'فرد': 'border-blue-300 text-blue-700',
  'شركة': 'border-purple-300 text-purple-700',
  'وسيط': 'border-amber-300 text-amber-700',
  'مسؤول العقار': 'border-teal-300 text-teal-700',
};

const clientRoleColors: Record<string, string> = {
  'مالك': 'bg-indigo-100 text-indigo-800',
  'مشتري': 'bg-violet-100 text-violet-800',
  'مستأجر': 'bg-cyan-100 text-cyan-800',
};

/**
 * الصفة — what the client is to the office, read off what they are attached to:
 * owner of a property ⇒ مالك, buyer on a sale contract ⇒ مشتري, tenant on a
 * rental contract ⇒ مستأجر. One table drives the column badges and the filter
 * options, and the labels must match the ROLE_RELATIONS keys the backend filters by.
 */
const CLIENT_ROLE_FLAGS: {
  label: string;
  flag: 'owned_properties_exists' | 'sale_contracts_exists' | 'rental_contracts_exists';
}[] = [
  { label: 'مالك',   flag: 'owned_properties_exists' },
  { label: 'مشتري',  flag: 'sale_contracts_exists' },
  { label: 'مستأجر', flag: 'rental_contracts_exists' },
];

const CLIENT_ROLES = CLIENT_ROLE_FLAGS.map(r => r.label);

/** The roles a client currently holds. Independent, so all can apply — or none. */
const clientRoles = (client: Client): string[] =>
  CLIENT_ROLE_FLAGS.filter(r => client[r.flag]).map(r => r.label);

const ClientsPage = () => {
  // ── Table data ──────────────────────────────────────────────────────────
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // Total matching rows and page size, driving the datatable pagination bar.
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  // ── Stats ───────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<ClientStats>({ total: 0, individuals: 0, companies: 0, brokers: 0, property_managers: 0 });

  // ── Filters ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);

  // ── Dialogs / drawers ───────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewClient, setViewClient] = useState<Client | null>(null);
  const [viewDetails, setViewDetails] = useState<ClientWithRelations | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ── Loading flags ───────────────────────────────────────────────────────
  const [deleting, setDeleting] = useState(false);

  // ── Debounce search → reset page ────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Reset page when filters change ──────────────────────────────────────
  useEffect(() => { setPage(1); }, [typeFilter, statusFilter, roleFilter]);

  // Changing the page size restarts from page 1 — batched with the size change
  // itself so the list refetches once, not twice.
  const handlePerPageChange = (n: number) => {
    setPerPage(n);
    setPage(1);
  };

  // ── Filter reset ────────────────────────────────────────────────────────
  const hasActiveFilters = search !== '' || typeFilter.length > 0 || statusFilter.length > 0 || roleFilter.length > 0;

  const resetFilters = () => {
    setSearch('');
    setTypeFilter([]);
    setStatusFilter([]);
    setRoleFilter([]);
  };

  // ── Fetch paginated clients ──────────────────────────────────────────────
  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await clientsService.list({
        search: debouncedSearch,
        type: typeFilter,
        status: statusFilter,
        role: roleFilter,
        page,
        per_page: perPage,
      });
      setClients(res.data);
      setLastPage(res.last_page);
      setTotal(res.total);
    } catch {
      toast.error('تعذّر تحميل قائمة العملاء');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, typeFilter, statusFilter, roleFilter, page, perPage]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // ── Fetch stats (non-critical) ───────────────────────────────────────────
  const refreshStats = useCallback(() => {
    clientsService.stats().then(setStats).catch(() => { });
  }, []);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  // ── View: load relations from show endpoint ──────────────────────────────
  const handleViewClient = async (client: Client) => {
    setViewClient(client);
    setViewDetails(null);
    try {
      const details = await clientsService.show(client.id);
      setViewDetails(details);
    } catch {
      // Drawer still shows basic client info if show fails
    }
  };

  // ── Save (create / update) ───────────────────────────────────────────────
  const handleSave = async (formData: Client) => {
    try {
      if (editingClient) {
        const updated = await clientsService.update(editingClient.id, {
          full_name: formData.full_name,
          phone: formData.phone,
          email: formData.email,
          type: formData.type,
          company_rep_name: formData.company_rep_name,
          company_rep_phone: formData.company_rep_phone,
          notes: formData.notes,
          status: formData.status,
        });
        setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
        toast.success('تم تعديل بيانات العميل');
      } else {
        const created = await clientsService.create({
          full_name: formData.full_name,
          phone: formData.phone,
          email: formData.email,
          type: formData.type,
          company_rep_name: formData.company_rep_name,
          company_rep_phone: formData.company_rep_phone,
          notes: formData.notes,
          status: formData.status,
        });
        setClients(prev => [created, ...prev]);
        refreshStats();
        toast.success('تم إضافة العميل بنجاح');
      }
    } catch (err) {
      const apiErr = err as ApiError;
      // 422 → Laravel validation errors under errors.<field>; otherwise the message
      const firstFieldError = apiErr.errors
        ? Object.values(apiErr.errors)[0]?.[0]
        : undefined;
      toast.error(firstFieldError ?? apiErr.message ?? 'حدث خطأ، يرجى المحاولة مجدداً');
    } finally {
      setEditingClient(null);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await clientsService.remove(deleteId);
      setClients(prev => prev.filter(c => c.id !== deleteId));
      refreshStats();
      toast.success('تم حذف العميل');
      setDeleteId(null);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? 'لا يمكن حذف هذا العميل');
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-foreground">العملاء</h2>
        <Button onClick={() => { setEditingClient(null); setFormOpen(true); }} className="gap-2 w-full sm:w-auto">
          <Plus size={18} />
          إضافة عميل
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10"><Users size={20} className="text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">إجمالي العملاء</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-blue-100"><User size={20} className="text-blue-700" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.individuals}</p>
              <p className="text-sm text-muted-foreground">الأفراد</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-purple-100"><Building2 size={20} className="text-purple-700" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.companies}</p>
              <p className="text-sm text-muted-foreground">الشركات</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-amber-100"><Handshake size={20} className="text-amber-700" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.brokers}</p>
              <p className="text-sm text-muted-foreground">الوسطاء</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-teal-100"><UserCog size={20} className="text-teal-700" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.property_managers}</p>
              <p className="text-sm text-muted-foreground">مسؤولو العقار</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="role-filter">بحث</Label>
          <Input
            placeholder="بحث بالاسم أو رقم الهاتف..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full md:w-64"
          />
        </div>
        <div className="w-full md:w-36 space-y-1.5">
          <Label htmlFor="role-filter">النوع</Label>
          <MultiSearchableSelect
            className="w-full md:w-36"
            placeholder="النوع"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={CLIENT_TYPES}
          />
        </div>
        <div className="w-full md:w-36 space-y-1.5">
          <Label htmlFor="role-filter">الصفة</Label>
          <MultiSearchableSelect
            className="w-full md:w-36"
            placeholder="الصفة"
            value={roleFilter}
            onValueChange={setRoleFilter}
            options={CLIENT_ROLES}
          />
        </div>
        <div className="w-full md:w-36 space-y-1.5">
          <Label htmlFor="role-filter">الحالة</Label>
          <MultiSearchableSelect
            className="w-full md:w-36"
            placeholder="الحالة"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={['نشط', 'غير نشط']}
          />
        </div>
        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} />
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>الاسم الكامل</TableHead>
              <TableHead>رقم الهاتف</TableHead>
              <TableHead>البريد الإلكتروني</TableHead>
              <TableHead>اسم ممثل الشركة</TableHead>
              <TableHead>رقم هاتف الممثل</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>الصفة</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>تاريخ الإضافة</TableHead>
              <TableHead>الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8">
                  <Loader2 className="inline animate-spin text-muted-foreground" size={24} />
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  لا يوجد عملاء
                </TableCell>
              </TableRow>
            ) : (
              clients.map((c, i) => (
                <TableRow key={c.id}>
                  <TableCell>{(page - 1) * 20 + i + 1}</TableCell>
                  <TableCell className="font-medium">{c.full_name}</TableCell>
                  <TableCell>{c.phone}</TableCell>
                  <TableCell>{c.email || '-'}</TableCell>
                  <TableCell>{c.company_rep_name || '-'}</TableCell>
                  <TableCell>{c.company_rep_phone || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={clientTypeColors[c.type]}>{c.type}</Badge>
                  </TableCell>
                  <TableCell>
                    {clientRoles(c).length === 0 ? '-' : (
                      <div className="flex flex-wrap gap-1">
                        {clientRoles(c).map(role => (
                          <Badge key={role} variant="secondary" className={clientRoleColors[role]}>{role}</Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={clientStatusColors[c.status]}>{c.status}</Badge>
                  </TableCell>
                  <TableCell>{c.created_at?.split('T')[0]}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleViewClient(c)} title="عرض">
                        <Eye size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditingClient(c); setFormOpen(true); }} title="تعديل">
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(c.id)}
                        title="حذف"
                        className="text-destructive hover:text-destructive"
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

      {/* Dialogs */}
      <ClientFormDialog
        open={formOpen}
        onOpenChange={o => { setFormOpen(o); if (!o) setEditingClient(null); }}
        client={editingClient}
        onSave={handleSave}
      />

      <ClientViewDrawer
        client={viewClient}
        onClose={() => { setViewClient(null); setViewDetails(null); }}
        preloadedProperties={viewDetails?.owned_properties}
        preloadedRequests={viewDetails?.requests}
        preloadedCollections={viewDetails?.collections}
      />

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا العميل؟ لا يمكن حذف عميل مرتبط بعقار أو طلب.
            </AlertDialogDescription>
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

export default ClientsPage;
