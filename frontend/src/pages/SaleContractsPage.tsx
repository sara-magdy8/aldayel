import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Eye, Pencil, FileText, Trash2, Loader2, Wallet } from 'lucide-react';
import ResetFiltersButton from '@/components/ResetFiltersButton';
import DataTablePagination, { DEFAULT_PER_PAGE } from '@/components/DataTablePagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { SaleContract, Client, Collection } from '@/types';
import { useLookups } from '@/contexts/LookupsContext';
import { saleContractsService, SaleContractFormData, SaleContractDocuments, SaleContractStats } from '@/services/saleContracts';
import { propertiesService, PropertyOption } from '@/services/properties';
import { clientsService } from '@/services/clients';
import { collectionsService } from '@/services/collections';
import { ApiError } from '@/services/api';
import SaleContractFormDrawer from '@/components/SaleContractFormDrawer';
import SaleContractViewDrawer from '@/components/SaleContractViewDrawer';
import CollectionFormDrawer, { CollectionPrefill } from '@/components/CollectionFormDrawer';
import { exportSaleContractPDF } from '@/lib/contractPdf';
import { exportInvoicePDF } from '@/lib/invoicePdf';
import { closePendingTab, isWhatsAppPaymentLink, openPendingTab, sendPaymentLinkViaWhatsApp } from '@/lib/paymentLink';
import { formatDate } from '@/lib/utils';
import { Label } from '@/components/ui/label';

const statusColors: Record<string, string> = {
  'مسودة': 'bg-amber-100 text-amber-800',
  'نشط': 'bg-green-100 text-green-800',
  'مكتمل': 'bg-blue-100 text-blue-800',
  'ملغي': 'bg-red-100 text-red-800',
};

const SaleContractsPage = () => {
  // Filter option lists from the backend lookup tables.
  const { contractStatusesFor, paymentMethodsFor } = useLookups();

  // ── Table data ──────────────────────────────────────────────────────────
  const [contracts, setContracts] = useState<SaleContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // Total matching rows and page size, driving the datatable pagination bar.
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  // ── Stats ───────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<SaleContractStats>({ نشط: 0, مسودة: 0, مكتمل: 0, ملغي: 0 });

  // ── Filters ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<string[]>([]);

  // ── Form dependencies (for the drawer dropdowns) ─────────────────────────
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // ── Dialogs / drawers ───────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<SaleContract | null>(null);
  const [viewContract, setViewContract] = useState<SaleContract | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Collection drawer (add a payment collection for a specific contract) ──
  const [collectionFormOpen, setCollectionFormOpen] = useState(false);
  const [collectionCtx, setCollectionCtx] = useState<CollectionPrefill | null>(null);

  // ── Debounce search → reset page ────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Reset page when filters change ──────────────────────────────────────
  useEffect(() => { setPage(1); }, [statusFilter, paymentFilter]);

  // Changing the page size restarts from page 1 — batched with the size change
  // itself so the list refetches once, not twice.
  const handlePerPageChange = (n: number) => {
    setPerPage(n);
    setPage(1);
  };

  // ── Filter reset ────────────────────────────────────────────────────────
  const hasActiveFilters = search !== '' || statusFilter.length > 0 || paymentFilter.length > 0;

  const resetFilters = () => {
    setSearch('');
    setStatusFilter([]);
    setPaymentFilter([]);
  };

  // ── Fetch paginated contracts ────────────────────────────────────────────
  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await saleContractsService.list({
        search: debouncedSearch,
        status: statusFilter,
        payment_method: paymentFilter,
        page,
        per_page: perPage,
      });
      setContracts(res.data);
      setLastPage(res.last_page);
      setTotal(res.total);
    } catch {
      toast.error('تعذّر تحميل عقود البيع');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, paymentFilter, page, perPage]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  // ── Fetch stats (non-critical) ───────────────────────────────────────────
  const refreshStats = useCallback(() => {
    saleContractsService.stats().then(setStats).catch(() => { });
  }, []);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  // ── Load form dependencies on mount ─────────────────────────────────────
  useEffect(() => {
    // Seeds the collection drawer's property combobox; it re-queries on search.
    propertiesService.options({ listing_type: 'بيع' })
      .then(setProperties)
      .catch(() => { });
  }, []);

  useEffect(() => {
    // Seeds the buyer combobox before the user types; it re-queries on search.
    clientsService.list({ per_page: 50 })
      .then(r => setClients(r.data))
      .catch(() => { });
  }, []);

  // ── Save (create / update) ───────────────────────────────────────────────
  const handleSave = async (contract: SaleContract, asDraft: boolean, documents: SaleContractDocuments): Promise<void> => {
    const formData: SaleContractFormData = {
      contract_number: contract.contract_number?.trim() || undefined,
      property_id: contract.property_id,
      unit_id: contract.unit_id ?? null,
      buyer_id: contract.buyer_id,
      contract_date: contract.contract_date,
      delivery_date: contract.delivery_date || undefined,
      total_amount: contract.total_amount,
      payment_method: contract.payment_method,
      down_payment: contract.down_payment ?? null,
      notes: contract.notes,
      status: contract.status as 'مسودة' | 'نشط',
    };

    try {
      if (editingContract) {
        const updated = await saleContractsService.update(editingContract.id, formData, documents);
        setContracts(prev => prev.map(c => c.id === updated.id ? updated : c));
        toast.success('تم تعديل العقد بنجاح');
      } else {
        const created = await saleContractsService.create(formData, documents);
        setContracts(prev => [created, ...prev]);
        refreshStats();
        toast.success(asDraft ? 'تم حفظ العقد كمسودة' : 'تم إضافة العقد بنجاح');
      }
      setEditingContract(null);
    } catch (err) {
      const apiErr = err as ApiError;
      const firstFieldError = apiErr.errors
        ? Object.values(apiErr.errors)[0]?.[0]
        : undefined;
      toast.error(firstFieldError ?? apiErr.message ?? 'حدث خطأ، يرجى المحاولة مجدداً');
      throw err; // re-throw so the drawer stays open
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await saleContractsService.remove(deleteId);
      setContracts(prev => prev.filter(c => c.id !== deleteId));
      refreshStats();
      toast.success('تم حذف العقد');
      setDeleteId(null);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? 'لا يمكن حذف هذا العقد');
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleClientAdded = (client: Client) => {
    setClients(prev => [...prev, client]);
  };

  // ── Open the collection drawer prefilled from a contract's buyer/property ──
  const openCollectionForContract = (c: SaleContract) => {
    setCollectionCtx({
      client_id: c.buyer_id,
      client_name: c.buyer_name,
      client_phone: c.buyer_phone,
      property_id: c.property_id,
      property_name: c.property_name,
      unit_id: c.unit_id,
    });
    setCollectionFormOpen(true);
  };

  // ── Save a new collection (create only, mirrors CollectionsPage) ──────────
  const handleSaveCollection = async (collection: Collection, withInvoice: boolean, attachments: File[] = []) => {
    const formData = {
      collection_type: collection.collection_type,
      client_id: collection.client_id,
      property_id: collection.property_id,
      unit_id: collection.unit_id,
      broker: collection.broker,
      beneficiary: collection.beneficiary,
      amount: collection.amount,
      collection_method: collection.collection_method,
      payment_date: collection.payment_date,
      payment_method: collection.payment_method,
      payment_link_expiry_days: collection.payment_link_expiry_days,
      payment_link_reminder_days: collection.payment_link_reminder_days,
      payment_link_gateways: collection.payment_link_gateways,
      payment_link_channel: collection.payment_link_channel,
      payment_gateway_id: collection.payment_gateway_id,
      check_number: collection.check_number,
      check_bank: collection.check_bank,
      check_date: collection.check_date,
      transfer_bank: collection.transfer_bank,
      transfer_transaction_number: collection.transfer_transaction_number,
      transfer_date: collection.transfer_date,
      card_type: collection.card_type,
      card_transaction_number: collection.card_transaction_number,
      card_last4: collection.card_last4,
      notes: collection.notes,
      has_invoice: collection.has_invoice || withInvoice,
    };

    // Reserved before the request so the popup blocker still sees the click.
    const waTab = isWhatsAppPaymentLink(collection) ? openPendingTab() : null;

    try {
      const saved = await collectionsService.create(formData, attachments);
      toast.success('تم تسجيل التحصيل بنجاح');

      if (waTab && !sendPaymentLinkViaWhatsApp(saved, waTab)) {
        toast.error('تعذّر فتح واتساب — تحقّق من رقم هاتف العميل');
      }

      if (withInvoice) {
        try {
          const inv = await collectionsService.generateInvoice(saved.id);
          exportInvoicePDF({ ...saved, has_invoice: true, invoice_number: inv.invoice_number });
          toast.success('تم إصدار الفاتورة');
        } catch {
          toast.error('تعذّر إصدار الفاتورة');
        }
      }
    } catch (e) {
      closePendingTab(waTab);
      const err = e as ApiError;
      const firstFieldError = err.errors ? Object.values(err.errors)[0]?.[0] : undefined;
      toast.error(firstFieldError ?? err.message ?? 'تعذّر حفظ التحصيل');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-foreground">عقود البيع</h2>
        <Button onClick={() => { setEditingContract(null); setFormOpen(true); }} className="gap-2 w-full sm:w-auto">
          <Plus size={18} />
          إضافة عقد بيع
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([['نشط', stats.نشط, 'text-green-600'], ['مسودة', stats.مسودة, 'text-amber-600'], ['مكتمل', stats.مكتمل, 'text-blue-600'], ['ملغي', stats.ملغي, 'text-red-600']] as const).map(([label, count, color]) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="role-filter">بحث</Label>
          <Input placeholder="بحث برقم العقد أو اسم المشتري..." value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-72" />
        </div>
        <div className="w-full md:w-40 space-y-1.5">
          <Label htmlFor="role-filter">الحالة</Label>
          <MultiSearchableSelect
            className="w-full md:w-40"
            placeholder="الحالة"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={contractStatusesFor('sale')}
          />
        </div>
        <div className="w-full md:w-40 space-y-1.5">
          <Label htmlFor="role-filter">طريقة السداد</Label>
          <MultiSearchableSelect
            className="w-full md:w-40"
            placeholder="طريقة السداد"
            value={paymentFilter}
            onValueChange={setPaymentFilter}
            options={paymentMethodsFor('contract')}
          />
        </div>
        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} />
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead>رقم العقد</TableHead>
              <TableHead>العقار / الوحدة</TableHead>
              <TableHead>المالك</TableHead>
              <TableHead>المشتري</TableHead>
              <TableHead>تاريخ العقد</TableHead>
              <TableHead>تاريخ التسليم</TableHead>
              <TableHead>المبلغ</TableHead>
              <TableHead>طريقة الدفع</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <Loader2 className="inline animate-spin text-muted-foreground" size={24} />
                </TableCell>
              </TableRow>
            ) : contracts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">لا توجد عقود</TableCell>
              </TableRow>
            ) : (
              contracts.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.contract_number}</TableCell>
                  <TableCell>{c.property_name}{c.unit_number ? ` / ${c.unit_number}` : ''}</TableCell>
                  <TableCell>{c.owner_name}</TableCell>
                  <TableCell>{c.buyer_name}</TableCell>
                  <TableCell>{formatDate(c.contract_date)}</TableCell>
                  <TableCell>{c.delivery_date ? formatDate(c.delivery_date) : '-'}</TableCell>
                  <TableCell>{c.total_amount.toLocaleString()} د.ك</TableCell>
                  <TableCell>{c.payment_method}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[c.status] || 'bg-gray-100 text-gray-800'}>{c.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewContract(c)} title="عرض"><Eye size={16} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditingContract(c); setFormOpen(true); }} title="تعديل"><Pencil size={16} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openCollectionForContract(c)} title="إضافة تحصيل مالي لهذا العقد" className="text-green-600 hover:text-green-700"><Wallet size={16} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => exportSaleContractPDF(c)} title="تصدير PDF"><FileText size={16} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)} title="حذف" className="text-destructive hover:text-destructive"><Trash2 size={16} /></Button>
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

      <SaleContractFormDrawer
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingContract(null); }}
        contract={editingContract}
        onSave={handleSave}
      />

      <SaleContractViewDrawer contract={viewContract} onClose={() => setViewContract(null)} />

      <CollectionFormDrawer
        open={collectionFormOpen}
        onOpenChange={(open) => { setCollectionFormOpen(open); if (!open) setCollectionCtx(null); }}
        collection={null}
        properties={properties}
        clients={clients}
        prefill={collectionCtx}
        hideClientAndProperty
        onSave={handleSaveCollection}
        onClientAdded={handleClientAdded}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا العقد؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
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

export default SaleContractsPage;
