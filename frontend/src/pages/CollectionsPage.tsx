import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Eye, Pencil, FileText, Trash2, FilePlus, Loader2, Link2, MessageCircle, Mail, RefreshCw } from 'lucide-react';
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
import { Collection, Client } from '@/types';
import { useLookups } from '@/contexts/LookupsContext';
import { collectionsService, CollectionStats } from '@/services/collections';
import { clientsService } from '@/services/clients';
import { propertiesService, PropertyOption } from '@/services/properties';
import { ApiError } from '@/services/api';
import CollectionFormDrawer from '@/components/CollectionFormDrawer';
import CollectionViewDrawer from '@/components/CollectionViewDrawer';
import { exportInvoicePDF } from '@/lib/invoicePdf';
import { copyToClipboard } from '@/lib/clipboard';
import { closePendingTab, isEmailPaymentLink, isPaymentLinkExpired, isWhatsAppPaymentLink, openPendingTab, sendPaymentLinkViaWhatsApp } from '@/lib/paymentLink';
import { Label } from '@/components/ui/label';

const typeColors: Record<string, string> = {
  'عمولة': 'bg-purple-100 text-purple-800',
  'إيجار (دفعة دورية)': 'bg-blue-100 text-blue-800',
  'عربون': 'bg-amber-100 text-amber-800',
  'دفعة نقدية': 'bg-green-100 text-green-800',
  'أخرى': 'bg-gray-100 text-gray-800',
};

const beneficiaryColors: Record<string, string> = {
  'المكتب': 'bg-blue-100 text-blue-800',
  'المالك': 'bg-green-100 text-green-800',
  'الوسيط': 'bg-orange-100 text-orange-800',
};

/**
 * The payment-status badge for one row.
 *
 * A manual collection is money already in hand, so it reads as received whatever
 * `payment_status` holds — that field only tracks the lifecycle of a payment link,
 * and its `unpaid` default would otherwise brand every cash collection as pending.
 */
const PaymentStatusBadge = ({ collection: c }: { collection: Collection }) => {
  const [label, className] =
    c.collection_method !== 'payment_link' ? ['مستلم', 'bg-green-100 text-green-800']
    : c.payment_status === 'paid'          ? ['مدفوع', 'bg-green-100 text-green-800']
    : c.payment_status === 'failed'        ? ['فشل الدفع', 'bg-red-100 text-red-800']
    // A dead link must not still read as awaiting payment — /pay/{token} already
    // turns the client away by the time it reaches this state.
    : isPaymentLinkExpired(c)              ? ['منتهي الصلاحية', 'bg-gray-100 text-gray-700']
    :                                        ['بانتظار الدفع', 'bg-amber-100 text-amber-800'];

  return <Badge variant="secondary" className={className}>{label}</Badge>;
};

const CollectionsPage = () => {
  // Filter option lists from the backend lookup tables.
  const { collectionTypes, paymentBeneficiaries, paymentMethodsFor } = useLookups();

  // ── Table data ──────────────────────────────────────────────────────────
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // Total matching rows and page size, driving the datatable pagination bar.
  const [totalRows, setTotalRows] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  // ── Stats (aggregated over the whole filtered dataset) ───────────────────
  const [stats, setStats] = useState<CollectionStats>({ total: 0, totalAmount: 0, officeAmount: 0, invoicesCount: 0 });

  // ── Form dropdown data ──────────────────────────────────────────────────
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);

  // ── Filters ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [methodFilter, setMethodFilter] = useState<string[]>([]);
  const [beneficiaryFilter, setBeneficiaryFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Dialogs / drawers ───────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [viewCollection, setViewCollection] = useState<Collection | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The collection whose link is being mailed, so its button can't fire twice.
  const [emailingId, setEmailingId] = useState<string | null>(null);
  // The collection awaiting confirmation of a reissue, and the one in flight.
  const [regenerateCollection, setRegenerateCollection] = useState<Collection | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // ── Active filter set (shared by list + stats fetches) ───────────────────
  const activeFilters = useMemo(() => ({
    search: debouncedSearch,
    collection_type: typeFilter,
    payment_method: methodFilter,
    beneficiary: beneficiaryFilter,
    date_from: dateFrom,
    date_to: dateTo,
  }), [debouncedSearch, typeFilter, methodFilter, beneficiaryFilter, dateFrom, dateTo]);

  // ── Debounce search → reset page ────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Reset page when filters change ──────────────────────────────────────
  useEffect(() => { setPage(1); }, [typeFilter, methodFilter, beneficiaryFilter, dateFrom, dateTo]);

  // Changing the page size restarts from page 1 — batched with the size change
  // itself so the list refetches once, not twice.
  const handlePerPageChange = (n: number) => {
    setPerPage(n);
    setPage(1);
  };

  // ── Filter reset ────────────────────────────────────────────────────────
  const hasActiveFilters =
    search !== '' || dateFrom !== '' || dateTo !== '' ||
    [typeFilter, methodFilter, beneficiaryFilter].some(f => f.length > 0);

  const resetFilters = () => {
    setSearch('');
    setTypeFilter([]);
    setMethodFilter([]);
    setBeneficiaryFilter([]);
    setDateFrom('');
    setDateTo('');
  };

  // ── Fetch paginated collections ──────────────────────────────────────────
  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await collectionsService.list({ ...activeFilters, page, per_page: perPage });
      setCollections(res.data);
      setLastPage(res.last_page);
      setTotalRows(res.total);
    } catch {
      toast.error('تعذّر تحميل التحصيلات');
    } finally {
      setLoading(false);
    }
  }, [activeFilters, page, perPage]);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  // ── Fetch stats over the whole filtered dataset (non-critical) ───────────
  const refreshStats = useCallback(() => {
    collectionsService.stats(activeFilters).then(setStats).catch(() => { });
  }, [activeFilters]);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  // ── Fetch dropdown data (clients + properties) ───────────────────────────
  useEffect(() => {
    // Seed the comboboxes before the user types; both re-query on search.
    clientsService.list({ per_page: 50 }).then(r => setClients(r.data)).catch(() => { });
    propertiesService.options().then(setProperties).catch(() => { });
  }, []);

  // ── Save (create / update) ───────────────────────────────────────────────
  const handleSave = async (collection: Collection, withInvoice: boolean, attachments: File[] = []) => {
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
      let saved: Collection;
      if (editingCollection) {
        saved = await collectionsService.update(editingCollection.id, formData, attachments);
        toast.success('تم تعديل التحصيل بنجاح');
      } else {
        saved = await collectionsService.create(formData, attachments);
        toast.success('تم تسجيل التحصيل بنجاح');
      }

      if (waTab) {
        // Editing an already-settled link must not nag the client to pay again.
        if (saved.payment_status === 'paid') {
          closePendingTab(waTab);
        } else if (!sendPaymentLinkViaWhatsApp(saved, waTab)) {
          toast.error('تعذّر فتح واتساب — تحقّق من رقم هاتف العميل');
        }
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

      fetchCollections();
      refreshStats();
    } catch (e) {
      closePendingTab(waTab);
      const err = e as ApiError;
      const firstFieldError = err.errors ? Object.values(err.errors)[0]?.[0] : undefined;
      toast.error(firstFieldError ?? err.message ?? 'تعذّر حفظ التحصيل');
    } finally {
      setEditingCollection(null);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await collectionsService.remove(deleteId);
      toast.success('تم حذف التحصيل');
      fetchCollections();
      refreshStats();
      setDeleteId(null);
    } catch (e) {
      toast.error((e as ApiError)?.message ?? 'تعذّر حذف التحصيل');
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── Generate invoice ─────────────────────────────────────────────────────
  const handleCreateInvoice = async (col: Collection) => {
    try {
      const res = await collectionsService.generateInvoice(col.id);
      const updated = { ...col, has_invoice: true, invoice_number: res.invoice_number };
      exportInvoicePDF(updated);
      toast.success('تم إنشاء الفاتورة');
      fetchCollections();
      refreshStats();
    } catch {
      toast.error('تعذّر إنشاء الفاتورة');
    }
  };

  // ── Copy the client-facing payment link ──────────────────────────────────
  // The URL is served by the backend (/pay/{token}); opening it starts a Hesabe
  // checkout and forwards the client to the hosted payment page.
  const handleCopyPaymentLink = async (col: Collection) => {
    if (!col.payment_link_url) {
      toast.error('لا يوجد رابط دفع لهذا التحصيل');
      return;
    }

    if (await copyToClipboard(col.payment_link_url)) {
      toast.success('تم نسخ رابط الدفع');
    } else {
      // Surface the URL itself so the office can still hand it over.
      toast.error(`تعذّر نسخ الرابط: ${col.payment_link_url}`);
    }
  };

  // ── Re-send the link over WhatsApp ───────────────────────────────────────
  // Same hand-off the save flow performs, for a link that was never sent or
  // needs chasing. Called straight from the click, so no tab has to be reserved.
  const handleSendPaymentLink = (col: Collection) => {
    if (!sendPaymentLinkViaWhatsApp(col, null)) {
      toast.error(
        col.payment_link_url
          ? 'تعذّر فتح واتساب — تحقّق من رقم هاتف العميل'
          : 'لا يوجد رابط دفع لهذا التحصيل',
      );
    }
  };

  // ── Mail the link to the client ──────────────────────────────────────────
  // Sent server-side: the backend owns the mailer and the client's address.
  const handleEmailPaymentLink = async (col: Collection) => {
    setEmailingId(col.id);
    try {
      const res = await collectionsService.sendPaymentLinkEmail(col.id);
      toast.success(res.message ?? 'تم إرسال رابط الدفع إلى بريد العميل');
    } catch (e) {
      toast.error((e as ApiError)?.message ?? 'تعذّر إرسال البريد الإلكتروني');
    } finally {
      setEmailingId(null);
    }
  };

  // ── Reissue an expired link ──────────────────────────────────────────────
  // The backend mints a new token and restarts the expiry from today; the URL the
  // client already has stops working, which is why the office confirms first.
  const handleRegeneratePaymentLink = async () => {
    const col = regenerateCollection;
    if (!col) return;

    setRegeneratingId(col.id);
    try {
      const updated = await collectionsService.regeneratePaymentLink(col.id);
      setRegenerateCollection(null);

      // The office picked how the link reaches the client at save time; honour the
      // same channel now. Email goes out server-side, WhatsApp opens here — and the
      // click that got us here is long gone, so no tab can be reserved.
      if (isWhatsAppPaymentLink(updated) && !sendPaymentLinkViaWhatsApp(updated, null)) {
        toast.error('تم إصدار رابط جديد، لكن تعذّر فتح واتساب — انسخ الرابط وأرسله يدوياً');
      } else {
        toast.success(isEmailPaymentLink(updated)
          ? 'تم إصدار رابط دفع جديد وإرساله إلى بريد العميل'
          : 'تم إصدار رابط دفع جديد');
      }

      fetchCollections();
    } catch (e) {
      toast.error((e as ApiError)?.message ?? 'تعذّر إصدار رابط دفع جديد');
      setRegenerateCollection(null);
    } finally {
      setRegeneratingId(null);
    }
  };

  // ── Client added inline from the form drawer ─────────────────────────────
  const handleClientAdded = (client: Client) => {
    setClients(prev => [...prev, client]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-foreground">التحصيل المالي</h2>
        <Button onClick={() => { setEditingCollection(null); setFormOpen(true); }} className="gap-2 w-full sm:w-auto">
          <Plus size={18} />
          تسجيل تحصيل
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">إجمالي التحصيلات</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">إجمالي المبالغ</p>
            <p className="text-2xl font-bold text-green-600">{stats.totalAmount.toLocaleString()} د.ك</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">تحصيلات المكتب</p>
            <p className="text-2xl font-bold text-blue-600">{stats.officeAmount.toLocaleString()} د.ك</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">فواتير صادرة</p>
            <p className="text-2xl font-bold text-foreground">{stats.invoicesCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5 ">
          <Label htmlFor="role-filter">بحث</Label>
          <Input placeholder="بحث برقم التحصيل أو اسم العميل..." value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-72" />
        </div>
        <div className="w-full md:w-40 space-y-1.5 ">
          <Label htmlFor="role-filter">النوع</Label>
          <MultiSearchableSelect
            className="w-full md:w-40"
            placeholder="النوع"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={collectionTypes}
          />
        </div>
        <div className="w-full md:w-40 space-y-1.5 ">
          <Label htmlFor="role-filter">طريقة الدفع</Label>
          <MultiSearchableSelect
            className="w-full md:w-40"
            placeholder="طريقة الدفع"
            value={methodFilter}
            onValueChange={setMethodFilter}
            options={paymentMethodsFor('collection')}
          />
        </div>
        <div className="w-full md:w-36 space-y-1.5 ">
          <Label htmlFor="role-filter">المستفيد</Label>
          <MultiSearchableSelect
            className="w-full md:w-36"
            placeholder="المستفيد"
            value={beneficiaryFilter}
            onValueChange={setBeneficiaryFilter}
            options={paymentBeneficiaries}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto mt-7">
          <span className="text-sm text-muted-foreground">من</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full md:w-36" />
          <span className="text-sm text-muted-foreground">إلى</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full md:w-36" />
        </div>
        <ResetFiltersButton show={hasActiveFilters} onReset={resetFilters} />
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead>رقم التحصيل</TableHead>
              <TableHead>العميل</TableHead>
              <TableHead>العقار</TableHead>
              <TableHead>نوع التحصيل</TableHead>
              <TableHead>المستفيد</TableHead>
              <TableHead>المبلغ</TableHead>
              <TableHead>طريقة الدفع</TableHead>
              <TableHead>تاريخ الدفع</TableHead>
              <TableHead>حالة الدفع</TableHead>
              <TableHead>فاتورة</TableHead>
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
            ) : collections.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">لا توجد تحصيلات</TableCell>
              </TableRow>
            ) : (
              collections.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.collection_number}</TableCell>
                  <TableCell>{c.client_name}</TableCell>
                  <TableCell>{c.property_name || '—'}{c.unit_number ? ` / ${c.unit_number}` : ''}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={typeColors[c.collection_type]}>{c.collection_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={beneficiaryColors[c.beneficiary]}>{c.beneficiary}</Badge>
                  </TableCell>
                  <TableCell>{c.amount.toLocaleString()} د.ك</TableCell>
                  <TableCell>{c.payment_method}</TableCell>
                  <TableCell>{c.payment_date?.slice(0, 10) || '—'}</TableCell>
                  <TableCell><PaymentStatusBadge collection={c} /></TableCell>
                  <TableCell>
                    {c.has_invoice
                      ? <Badge className="bg-green-100 text-green-800">✅ صادرة</Badge>
                      : <span className="text-gray-400">—</span>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewCollection(c)} title="عرض"><Eye size={16} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditingCollection(c); setFormOpen(true); }} title="تعديل"><Pencil size={16} /></Button>
                      {/* Electronic collections only — a manual one has no link to share. */}
                      {c.collection_method === 'payment_link' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyPaymentLink(c)}
                          title={c.payment_status === 'paid' ? 'تم الدفع — نسخ رابط الدفع' : 'نسخ رابط الدفع'}
                          className={c.payment_status === 'paid' ? 'text-green-600 hover:text-green-600' : ''}
                        >
                          <Link2 size={16} />
                        </Button>
                      )}
                      {/* Only a dead link is worth replacing. A live one is still
                          payable — a declined attempt included, since the client can
                          retry the same URL — and a paid one is history. */}
                      {isPaymentLinkExpired(c) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRegenerateCollection(c)}
                          disabled={regeneratingId === c.id}
                          title="إصدار رابط دفع جديد"
                          className="text-amber-600 hover:text-amber-600"
                        >
                          {regeneratingId === c.id
                            ? <Loader2 size={16} className="animate-spin" />
                            : <RefreshCw size={16} />}
                        </Button>
                      )}
                      {/* Only when the office picked email as the delivery channel. */}
                      {isEmailPaymentLink(c) && c.payment_status !== 'paid' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEmailPaymentLink(c)}
                          disabled={emailingId === c.id}
                          title="إرسال رابط الدفع إلى بريد العميل"
                          className="text-blue-600 hover:text-blue-600"
                        >
                          {emailingId === c.id
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Mail size={16} />}
                        </Button>
                      )}
                      {/* Only when the office picked WhatsApp as the delivery channel. */}
                      {isWhatsAppPaymentLink(c) && c.payment_status !== 'paid' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSendPaymentLink(c)}
                          title="إرسال رابط الدفع عبر واتساب"
                          className="text-green-600 hover:text-green-600"
                        >
                          <MessageCircle size={16} />
                        </Button>
                      )}
                      {c.has_invoice ? (
                        <Button variant="ghost" size="icon" onClick={() => exportInvoicePDF(c)} title="فاتورة PDF"><FileText size={16} /></Button>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => handleCreateInvoice(c)} title="إنشاء فاتورة"><FilePlus size={16} /></Button>
                      )}
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
        total={totalRows}
        perPage={perPage}
        loading={loading}
        onPageChange={setPage}
        onPerPageChange={handlePerPageChange}
      />

      <CollectionFormDrawer
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingCollection(null); }}
        collection={editingCollection}
        properties={properties}
        clients={clients}
        onSave={handleSave}
        onClientAdded={handleClientAdded}
      />

      <CollectionViewDrawer
        collection={viewCollection}
        onClose={() => setViewCollection(null)}
        onCreateInvoice={handleCreateInvoice}
      />

      <AlertDialog open={!!regenerateCollection} onOpenChange={(open) => !open && setRegenerateCollection(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إصدار رابط دفع جديد</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إصدار رابط دفع جديد للتحصيل {regenerateCollection?.collection_number} وتبدأ مدة الصلاحية من اليوم.
              الرابط القديم سيتوقف عن العمل فوراً.
              {regenerateCollection && isEmailPaymentLink(regenerateCollection) && ' وسيتم إرسال الرابط الجديد إلى بريد العميل.'}
              {regenerateCollection && isWhatsAppPaymentLink(regenerateCollection) && ' وسيُفتح واتساب لإرسال الرابط الجديد إلى العميل.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegeneratePaymentLink} disabled={!!regeneratingId}>
              {regeneratingId ? <Loader2 className="inline animate-spin mr-1" size={14} /> : null}
              إصدار رابط جديد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا التحصيل؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="inline animate-spin mr-1" size={14} /> : null}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CollectionsPage;
