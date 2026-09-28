import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus, Check, ChevronsUpDown, Loader2, X, FileText, Wallet, Link2, AlertTriangle,
  MessageCircle, Mail, Copy,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import {
  Collection, CollectionType, CollectionPaymentMethod, Beneficiary, CardType,
  CollectionMethod, PaymentLinkGateway, PaymentLinkChannel, Unit, Client, ClientType,
} from '@/types';
import { useLookups } from '@/contexts/LookupsContext';
import { collectionsService, CollectionAttachmentDto } from '@/services/collections';
import { settingsService, PaymentGatewayOption } from '@/services/settings';
import { unitsService } from '@/services/units';
import { clientsService } from '@/services/clients';
import { propertiesService, PropertyOption } from '@/services/properties';
import QuickAddClientDialog from './QuickAddClientDialog';

/**
 * A collection is raised against the person paying — never against a وسيط or a
 * مسؤول عقار, who are on the property in their own right.
 */
const COLLECTION_CLIENT_TYPES: ClientType[] = ['فرد', 'شركة'];

/**
 * Pre-selected client/property context, e.g. when opening the drawer from a
 * contract. When paired with `hideClientAndProperty`, these come from the
 * source record and are shown read-only instead of as pickers.
 */
export interface CollectionPrefill {
  client_id: string;
  client_name: string;
  client_phone?: string;
  property_id?: string;
  property_name?: string;
  unit_id?: string;
}

interface CollectionFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: Collection | null;
  properties: PropertyOption[];
  clients: Client[];
  onSave: (collection: Collection, withInvoice: boolean, attachments: File[]) => void;
  onClientAdded: (client: Client) => void;
  /** Seed client/property for a new collection (create mode only). */
  prefill?: CollectionPrefill | null;
  /** Hide the client/property/unit pickers and show the prefilled context read-only. */
  hideClientAndProperty?: boolean;
}

const cardTypes: CardType[] = ['فيزا', 'ماستركارد', 'مدى'];

/** The two ways money reaches the office — drives which payment fields are shown. */
const collectionMethods: { value: CollectionMethod; title: string; hint: string; icon: typeof Wallet }[] = [
  { value: 'manual', title: 'دفع يدوي', hint: 'استلمت المبلغ بالفعل — سجّله كمدفوع', icon: Wallet },
  { value: 'payment_link', title: 'رابط دفع إلكتروني', hint: 'أرسل رابطًا ليدفع العميل بنفسه', icon: Link2 },
];

const linkExpiryOptions = [
  { value: '3', label: '3 أيام' },
  { value: '7', label: '7 أيام' },
  { value: '14', label: '14 يوم' },
];

// Days before the link expires to nudge the client. `0` is stored rather than
// omitted so switching to "no reminder" on an edit actually clears the old value.
const linkReminderOptions = [
  { value: '1', label: 'يوم واحد قبل' },
  { value: '2', label: 'يومين قبل'    },
  { value: '0', label: 'بدون تذكير'   },
];

const linkGateways: PaymentLinkGateway[] = ['كي نت', 'فيزا / ماستركارد', 'Apple Pay', 'Google Pay'];

const linkChannels: { value: PaymentLinkChannel; label: string; icon: typeof Wallet }[] = [
  { value: 'whatsapp', label: 'واتساب',         icon: MessageCircle },
  { value: 'email',    label: 'بريد إلكتروني',  icon: Mail          },
  { value: 'copy',     label: 'نسخ فقط',        icon: Copy          },
];

// Attachments have no stored mime type, so infer "is image" from the file name.
const isImageName = (name: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

const CollectionFormDrawer: React.FC<CollectionFormDrawerProps> = ({
  open, onOpenChange, collection, properties, clients, onSave, onClientAdded,
  prefill = null, hideClientAndProperty = false,
}) => {
  const isEdit = !!collection;

  // Option lists from the backend lookup tables.
  const { collectionTypes, paymentBeneficiaries, paymentMethodsFor } = useLookups();
  const paymentMethods = paymentMethodsFor('collection');
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // ── Attachments ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAttachments, setSelectedAttachments] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<CollectionAttachmentDto[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  // Units are lazy-loaded for the selected property (GET /properties/{id}/units).
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  // ── Backend-driven client combobox (search isn't limited to page 1) ─────
  const [clientComboOpen, setClientComboOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientOptions, setClientOptions] = useState<Client[]>(clients);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  // False while a stub is standing in for the real client, i.e. its `email` says
  // nothing about what is actually on file. See hydrateClientEmail below.
  const [clientEmailKnown, setClientEmailKnown] = useState(true);
  // The client whose email fetch is current, so a slower earlier one is ignored.
  const clientEmailRequestRef = useRef<string | null>(null);

  // ── Backend-driven property combobox ────────────────────────────────────
  const [propComboOpen, setPropComboOpen] = useState(false);
  const [propSearch, setPropSearch] = useState('');
  const [propOptions, setPropOptions] = useState<PropertyOption[]>(properties);
  const [loadingProps, setLoadingProps] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyOption | null>(null);

  // Payment-link gateways are multi-select, so they use a popover rather than a Select.
  const [gatewayComboOpen, setGatewayComboOpen] = useState(false);

  // The office's saved gateway accounts (payment_gateways) — one issues the link.
  const [gatewayAccounts, setGatewayAccounts] = useState<PaymentGatewayOption[]>([]);
  const [loadingGatewayAccounts, setLoadingGatewayAccounts] = useState(false);

  const [form, setForm] = useState({
    collection_type: 'عمولة' as CollectionType,
    client_id: '',
    property_id: '',
    unit_id: '',
    broker: '',
    beneficiary: 'المكتب' as Beneficiary,
    amount: 0,
    collection_method: 'manual' as CollectionMethod,
    payment_date: '',
    payment_method: 'نقدي' as CollectionPaymentMethod,
    payment_link_expiry_days: '7',
    payment_link_reminder_days: '1',
    payment_link_gateways: [] as PaymentLinkGateway[],
    payment_link_channel: 'whatsapp' as PaymentLinkChannel,
    payment_gateway_id: '',
    check_number: '', check_bank: '', check_date: '',
    transfer_bank: '', transfer_transaction_number: '', transfer_date: '',
    card_type: 'فيزا' as CardType, card_transaction_number: '', card_last4: '',
    has_invoice: false,
    notes: '',
  });

  /**
   * Edit/prefill only seed a client stub built from the source record, which has
   * no `email`. Fetch the full client and merge it in so the payment-link send
   * channels can react to whether an email is actually saved. Ignored if the
   * selection changed while the request was in flight.
   *
   * `clientEmailKnown` stays false until this lands — a missing email on the stub
   * is an unanswered question, not a "no", and treating it as one would knock a
   * saved `email` channel back to whatsapp before the answer arrives. A failed
   * fetch leaves it false too: still unknown, so the option stays offered.
   */
  const hydrateClientEmail = (clientId: string) => {
    clientEmailRequestRef.current = clientId;
    setClientEmailKnown(false);
    clientsService.show(clientId)
      .then(full => {
        // Superseded by a newer selection — its own answer is the current one.
        if (clientEmailRequestRef.current !== clientId) return;
        setSelectedClient(prev => (prev && prev.id === clientId ? { ...prev, email: full.email } : prev));
        setClientEmailKnown(true);
      })
      .catch(() => { /* leave it unknown rather than claiming the client has none */ });
  };

  /**
   * Resolve the property a collection/prefill points at. Only its id and name
   * come with the source record, but `property_type` decides whether the unit
   * selector shows — so the rest is fetched. `limit=0` returns that one row.
   * The name from the record stands in if the fetch fails.
   */
  const hydrateProperty = (propertyId?: string, propertyName?: string) => {
    if (!propertyId) {
      setSelectedProperty(null);
      return;
    }
    propertiesService.options({ include: propertyId, limit: 0 })
      .then(opts => setSelectedProperty(
        opts.find(o => o.id === propertyId) ?? { id: propertyId, name: propertyName || '' } as PropertyOption,
      ))
      .catch(() => setSelectedProperty({ id: propertyId, name: propertyName || '' } as PropertyOption));
  };

  useEffect(() => {
    if (collection) {
      setForm({
        collection_type: collection.collection_type,
        client_id: collection.client_id,
        property_id: collection.property_id || '',
        unit_id: collection.unit_id || '',
        broker: collection.broker || '',
        beneficiary: collection.beneficiary,
        amount: collection.amount,
        collection_method: collection.collection_method || 'manual',
        payment_date: collection.payment_date,
        payment_method: collection.payment_method,
        payment_link_expiry_days: collection.payment_link_expiry_days ? String(collection.payment_link_expiry_days) : '7',
        // `?? 1` not `|| 1` — a stored 0 means "no reminder", not "unset".
        payment_link_reminder_days: String(collection.payment_link_reminder_days ?? 1),
        payment_link_gateways: collection.payment_link_gateways || [],
        payment_link_channel: collection.payment_link_channel || 'whatsapp',
        payment_gateway_id: collection.payment_gateway_id || '',
        check_number: collection.check_number || '',
        check_bank: collection.check_bank || '',
        check_date: collection.check_date || '',
        transfer_bank: collection.transfer_bank || '',
        transfer_transaction_number: collection.transfer_transaction_number || '',
        transfer_date: collection.transfer_date || '',
        card_type: collection.card_type || 'فيزا',
        card_transaction_number: collection.card_transaction_number || '',
        card_last4: collection.card_last4 || '',
        has_invoice: collection.has_invoice,
        notes: collection.notes || '',
      });
      // Seed the combobox trigger labels from the record itself — the client/property
      // may not be on page 1 of the option lists.
      setSelectedClient({
        id: collection.client_id,
        full_name: collection.client_name,
        phone: collection.client_phone,
        type: 'فرد',
        status: 'نشط',
        created_at: '',
      });
      // The stub above has no email — fetch the real client so the "email" send
      // channel can be hidden when the client has none saved.
      hydrateClientEmail(collection.client_id);
      hydrateProperty(collection.property_id, collection.property_name);
    } else {
      setForm({
        collection_type: 'عمولة',
        client_id: prefill?.client_id || '',
        property_id: prefill?.property_id || '',
        unit_id: prefill?.unit_id || '',
        broker: '', beneficiary: 'المكتب', amount: 0,
        collection_method: 'manual', payment_date: '',
        payment_method: 'نقدي', payment_link_expiry_days: '7',
        payment_link_reminder_days: '1', payment_link_gateways: [], payment_link_channel: 'whatsapp',
        payment_gateway_id: '',
        check_number: '', check_bank: '', check_date: '',
        transfer_bank: '', transfer_transaction_number: '', transfer_date: '',
        card_type: 'فيزا', card_transaction_number: '', card_last4: '',
        has_invoice: false, notes: '',
      });
      // Seed the trigger labels from the prefill context (e.g. a contract's buyer/property).
      if (prefill?.client_id) {
        setSelectedClient({
          id: prefill.client_id,
          full_name: prefill.client_name,
          phone: prefill.client_phone || '',
          type: 'فرد',
          status: 'نشط',
          created_at: '',
        });
        hydrateClientEmail(prefill.client_id);
      } else {
        setSelectedClient(null);
        // No client, so nothing to look up — "has no email" is settled.
        clientEmailRequestRef.current = null;
        setClientEmailKnown(true);
      }
      hydrateProperty(prefill?.property_id, prefill?.property_name);
    }
    setClientSearch('');
    setPropSearch('');
  }, [collection, open, prefill]);

  // Reset newly-picked files, then load the collection's persisted attachments (edit only).
  useEffect(() => {
    if (!open) return;
    setSelectedAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (collection) {
      let active = true;
      setAttachmentsLoading(true);
      collectionsService.getAttachments(collection.id)
        .then(list => { if (active) setExistingAttachments(list); })
        .catch(() => { if (active) setExistingAttachments([]); })
        .finally(() => { if (active) setAttachmentsLoading(false); });
      return () => { active = false; };
    }
    setExistingAttachments([]);
  }, [collection, open]);

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!collection) return;
    setDeletingAttachmentId(attachmentId);
    try {
      await collectionsService.deleteAttachment(collection.id, attachmentId);
      setExistingAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch {
      // Keep the item visible if the delete failed.
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  // Keep option lists synced with props (e.g. after a client is quick-added),
  // without disturbing the form/selection.
  // Filtered here as well as in the query below: the prop is the page's
  // unfiltered list, and it is what shows before the first search returns.
  useEffect(() => {
    setClientOptions(clients.filter(c => COLLECTION_CLIENT_TYPES.includes(c.type)));
  }, [clients]);
  useEffect(() => { setPropOptions(properties); }, [properties]);

  // Debounced backend search for clients — queries clients/index.
  useEffect(() => {
    if (!clientComboOpen) return;
    let cancelled = false;
    setLoadingClients(true);
    const t = setTimeout(async () => {
      try {
        // per_page overrides the list page's default of 5 — a combobox needs to
        // show more than five matches before the user has to narrow the search.
        const res = await clientsService.list({
          search: clientSearch || undefined,
          type: COLLECTION_CLIENT_TYPES,
          page: 1,
          per_page: 50,
        });
        if (!cancelled) setClientOptions(res.data);
      } catch {
        if (!cancelled) setClientOptions([]);
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [clientSearch, clientComboOpen]);

  // Debounced backend search for properties — queries properties/index.
  useEffect(() => {
    if (!propComboOpen) return;
    let cancelled = false;
    setLoadingProps(true);
    const t = setTimeout(async () => {
      try {
        const res = await propertiesService.options({ search: propSearch || undefined });
        if (!cancelled) setPropOptions(res);
      } catch {
        if (!cancelled) setPropOptions([]);
      } finally {
        if (!cancelled) setLoadingProps(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [propSearch, propComboOpen]);

  const isMultiUnit = selectedProperty?.property_type === 'متعدد الوحدات';
  // The units endpoint already returns only this property's units, so no extra filtering.
  const propertyUnits = units;

  const updateField = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const pickClient = (client: Client) => {
    updateField('client_id', client.id);
    setSelectedClient(client);
    // Combobox rows come from /clients, which returns the whole record — this
    // one's email is authoritative, and any in-flight fetch is now stale.
    clientEmailRequestRef.current = client.id;
    setClientEmailKnown(true);
    setClientComboOpen(false);
  };

  const pickProperty = (property: PropertyOption) => {
    updateField('property_id', property.id);
    updateField('unit_id', '');
    setSelectedProperty(property);
    setPropComboOpen(false);
  };

  // The link can only be emailed to a client who has an email on file, so drop
  // that channel when the selected client has none (or no client is picked yet).
  // While the answer is still unknown the option stays — see hydrateClientEmail.
  const emailChannelAvailable = !clientEmailKnown || !!selectedClient?.email?.trim();
  const availableLinkChannels = useMemo(
    () => linkChannels.filter(c => c.value !== 'email' || emailChannelAvailable),
    [emailChannelAvailable],
  );

  // Fall back to واتساب if the client loses the email option after it was chosen.
  useEffect(() => {
    if (!emailChannelAvailable && form.payment_link_channel === 'email') {
      updateField('payment_link_channel', 'whatsapp');
    }
  }, [emailChannelAvailable, form.payment_link_channel]);

  // Lazy-load units whenever the selected property changes (and on edit-prefill).
  useEffect(() => {
    if (!form.property_id) { setUnits([]); return; }
    let active = true;
    setLoadingUnits(true);
    unitsService.list(form.property_id)
      .then(list => { if (active) setUnits(list); })
      .catch(() => { if (active) setUnits([]); })
      .finally(() => { if (active) setLoadingUnits(false); });
    return () => { active = false; };
  }, [form.property_id]);

  // Load the office's gateway accounts once per opening. Only the payment-link
  // branch uses them, but the method can be switched while the drawer is open.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingGatewayAccounts(true);
    settingsService.listPaymentGatewayOptions()
      .then(list => {
        if (!active) return;
        setGatewayAccounts(list);
        // With a single configured account there is nothing to choose — preselect
        // it so the office is not forced through a one-option dropdown.
        if (list.length === 1) {
          setForm(prev => prev.payment_gateway_id ? prev : { ...prev, payment_gateway_id: String(list[0].id) });
        }
      })
      .catch(() => { if (active) setGatewayAccounts([]); })
      .finally(() => { if (active) setLoadingGatewayAccounts(false); });
    return () => { active = false; };
  }, [open]);

  const isPaymentLink = form.collection_method === 'payment_link';

  /** Add/remove one gateway, keeping the stored order stable across toggles. */
  const toggleGateway = (gateway: PaymentLinkGateway) => setForm(prev => ({
    ...prev,
    payment_link_gateways: prev.payment_link_gateways.includes(gateway)
      ? prev.payment_link_gateways.filter(g => g !== gateway)
      : linkGateways.filter(g => g === gateway || prev.payment_link_gateways.includes(g)),
  }));

  const buildCollection = (withInvoice: boolean): Collection => {
    const selectedUnit = propertyUnits.find(u => u.id === form.unit_id);
    const invoiceFlag = withInvoice || form.has_invoice;
    return {
      id: collection?.id || `col-${Date.now()}`,
      collection_number: collection?.collection_number || `تحصيل-${String(Date.now()).slice(-3)}`,
      collection_type: form.collection_type,
      client_id: form.client_id,
      client_name: selectedClient?.full_name || '',
      client_phone: selectedClient?.phone || '',
      property_id: form.property_id || undefined,
      property_name: selectedProperty?.name || undefined,
      unit_id: form.unit_id || undefined,
      unit_number: selectedUnit?.unit_number || undefined,
      broker: form.broker || undefined,
      beneficiary: form.beneficiary,
      amount: form.amount,
      collection_method: form.collection_method,
      // A payment link has no payment date yet — it is set when the client pays.
      payment_date: isPaymentLink ? '' : form.payment_date,
      payment_method: form.payment_method,
      ...(isPaymentLink && {
        payment_link_expiry_days: Number(form.payment_link_expiry_days),
        payment_link_reminder_days: Number(form.payment_link_reminder_days),
        payment_link_gateways: form.payment_link_gateways,
        payment_link_channel: form.payment_link_channel,
        payment_gateway_id: form.payment_gateway_id || undefined,
        payment_gateway_name: gatewayAccounts.find(g => String(g.id) === form.payment_gateway_id)?.name,
      }),
      ...(!isPaymentLink && form.payment_method === 'شيك' && { check_number: form.check_number, check_bank: form.check_bank, check_date: form.check_date }),
      ...(!isPaymentLink && form.payment_method === 'تحويل بنكي' && { transfer_bank: form.transfer_bank, transfer_transaction_number: form.transfer_transaction_number, transfer_date: form.transfer_date }),
      ...(!isPaymentLink && form.payment_method === 'بطاقة ائتمان' && { card_type: form.card_type, card_transaction_number: form.card_transaction_number, card_last4: form.card_last4 }),
      notes: form.notes || undefined,
      attachments: collection?.attachments || [],
      has_invoice: invoiceFlag,
      invoice_number: invoiceFlag ? (collection?.invoice_number || `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`) : undefined,
      created_at: collection?.created_at || new Date().toISOString().split('T')[0],
    };
  };

  // A manual collection needs the date it was received; a link needs somewhere to
  // pay. The gateway account is only demanded once the office has configured one —
  // otherwise the form would be unsaveable until someone visits the settings screen.
  const canSave = !!form.client_id && form.amount > 0
    && (isPaymentLink
      ? form.payment_link_gateways.length > 0 && (gatewayAccounts.length === 0 || !!form.payment_gateway_id)
      : !!form.payment_date);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:w-[520px] p-0 h-dvh flex flex-col gap-0">
          <SheetHeader className="p-6 pb-0 shrink-0">
            <SheetTitle>{isEdit ? 'تعديل التحصيل' : 'تسجيل تحصيل جديد'}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0 px-6 py-4">
            <div className="space-y-4">
              {/* Section 1: بيانات التحصيل */}
              <h4 className="font-bold text-sm text-primary">بيانات التحصيل</h4>
              <div>
                <Label>نوع التحصيل *</Label>
                <Select value={form.collection_type} onValueChange={v => updateField('collection_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {collectionTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {hideClientAndProperty && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                  <div><span className="text-muted-foreground">العميل: </span>{selectedClient?.full_name || '—'}</div>
                  {selectedProperty && (
                    <div><span className="text-muted-foreground">العقار: </span>{selectedProperty.name}</div>
                  )}
                </div>
              )}
              {!hideClientAndProperty && (<>
                <div>
                  <Label>العميل *</Label>
                  <Popover open={clientComboOpen} onOpenChange={setClientComboOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={clientComboOpen} className="w-full justify-between font-normal">
                        <span className={cn('truncate', !selectedClient && 'text-muted-foreground')}>
                          {selectedClient ? `${selectedClient.full_name} — ${selectedClient.phone}` : 'اختر العميل'}
                        </span>
                        <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="بحث عن عميل..." value={clientSearch} onValueChange={setClientSearch} />
                        <CommandList>
                          {loadingClients ? (
                            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                              <Loader2 className="me-2 h-4 w-4 animate-spin" /> جاري البحث...
                            </div>
                          ) : (
                            <>
                              <CommandEmpty>لا يوجد عملاء</CommandEmpty>
                              <CommandGroup>
                                {clientOptions.map(c => (
                                  <CommandItem key={c.id} value={c.id} onSelect={() => pickClient(c)}>
                                    <Check className={cn('me-2 h-4 w-4', form.client_id === c.id ? 'opacity-100' : 'opacity-0')} />
                                    {c.full_name} — {c.phone}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button variant="link" size="sm" className="mt-1 p-0 h-auto text-primary" onClick={() => setQuickAddOpen(true)}>
                    <Plus size={14} className="ml-1" />
                    إضافة عميل جديد
                  </Button>
                </div>
                <div>
                  <Label>العقار</Label>
                  <Popover open={propComboOpen} onOpenChange={setPropComboOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={propComboOpen} className="w-full justify-between font-normal">
                        <span className={cn('truncate', !selectedProperty && 'text-muted-foreground')}>
                          {selectedProperty ? `${selectedProperty.name}${selectedProperty.address ? ` — ${selectedProperty.address}` : ''}` : 'اختر العقار (اختياري)'}
                        </span>
                        <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="بحث عن عقار..." value={propSearch} onValueChange={setPropSearch} />
                        <CommandList>
                          {loadingProps ? (
                            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                              <Loader2 className="me-2 h-4 w-4 animate-spin" /> جاري البحث...
                            </div>
                          ) : (
                            <>
                              <CommandEmpty>لا يوجد عقارات</CommandEmpty>
                              <CommandGroup>
                                {propOptions.map(p => (
                                  <CommandItem key={p.id} value={p.id} onSelect={() => pickProperty(p)}>
                                    <Check className={cn('me-2 h-4 w-4', form.property_id === p.id ? 'opacity-100' : 'opacity-0')} />
                                    {p.property_code} - {p.name} — {p.address}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {isMultiUnit && (
                  <div>
                    <Label>الوحدة</Label>
                    <Select value={form.unit_id} onValueChange={v => updateField('unit_id', v)} disabled={loadingUnits}>
                      <SelectTrigger><SelectValue placeholder={loadingUnits ? 'جارٍ تحميل الوحدات...' : 'اختر الوحدة'} /></SelectTrigger>
                      <SelectContent>
                        {propertyUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unit_number}{u.unit_type ? ` — ${u.unit_type}` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>)}
              <div>
                <Label>الوسيط</Label>
                <Input value={form.broker} onChange={e => updateField('broker', e.target.value)} />
              </div>
              <div>
                <Label>المستفيد *</Label>
                <RadioGroup value={form.beneficiary} onValueChange={v => updateField('beneficiary', v)} className="flex gap-4 mt-1">
                  {(paymentBeneficiaries as Beneficiary[]).map(b => (
                    <div key={b} className="flex items-center gap-2">
                      <RadioGroupItem value={b} id={`ben-${b}`} />
                      <Label htmlFor={`ben-${b}`} className="cursor-pointer">{b}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <Separator />

              {/* Section 2: بيانات الدفع */}
              <h4 className="font-bold text-sm text-primary">بيانات الدفع</h4>

              <div>
                <Label>طريقة التحصيل *</Label>
                <RadioGroup
                  value={form.collection_method}
                  onValueChange={v => updateField('collection_method', v)}
                  className="grid gap-2 mt-1"
                >
                  {collectionMethods.map(({ value, title, hint, icon: Icon }) => (
                    <Label
                      key={value}
                      htmlFor={`cm-${value}`}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50',
                        form.collection_method === value && 'border-primary bg-primary/5',
                      )}
                    >
                      <RadioGroupItem value={value} id={`cm-${value}`} className="mt-0.5" />
                      <Icon size={18} className="mt-0.5 shrink-0 text-primary" />
                      <span className="space-y-0.5">
                        <span className="block font-medium">{title}</span>
                        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div>
                <Label>المبلغ *</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={form.amount || ''} onChange={e => updateField('amount', Number(e.target.value))} />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">د.ك</span>
                </div>
              </div>
              {/* ── Manual: the money is already in hand ─────────────────── */}
              {!isPaymentLink && (<>
                <div>
                  <Label>تاريخ الدفع *</Label>
                  <Input type="date" value={form.payment_date} onChange={e => updateField('payment_date', e.target.value)} />
                </div>
                <div>
                  <Label>طريقة الدفع *</Label>
                  <Select value={form.payment_method} onValueChange={v => updateField('payment_method', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {form.payment_method === 'شيك' && (
                  <div className="space-y-3 bg-muted/50 p-3 rounded-lg">
                    <div>
                      <Label>رقم الشيك</Label>
                      <Input value={form.check_number} onChange={e => updateField('check_number', e.target.value)} />
                    </div>
                    <div>
                      <Label>اسم البنك</Label>
                      <Input value={form.check_bank} onChange={e => updateField('check_bank', e.target.value)} />
                    </div>
                    <div>
                      <Label>تاريخ الشيك</Label>
                      <Input type="date" value={form.check_date} onChange={e => updateField('check_date', e.target.value)} />
                    </div>
                  </div>
                )}

                {form.payment_method === 'تحويل بنكي' && (
                  <div className="space-y-3 bg-muted/50 p-3 rounded-lg">
                    <div>
                      <Label>اسم البنك المحول منه</Label>
                      <Input value={form.transfer_bank} onChange={e => updateField('transfer_bank', e.target.value)} />
                    </div>
                    <div>
                      <Label>رقم العملية</Label>
                      <Input value={form.transfer_transaction_number} onChange={e => updateField('transfer_transaction_number', e.target.value)} />
                    </div>
                    <div>
                      <Label>تاريخ التحويل</Label>
                      <Input type="date" value={form.transfer_date} onChange={e => updateField('transfer_date', e.target.value)} />
                    </div>
                  </div>
                )}

                {form.payment_method === 'بطاقة ائتمان' && (
                  <div className="space-y-3 bg-muted/50 p-3 rounded-lg">
                    <div>
                      <Label>نوع البطاقة</Label>
                      <Select value={form.card_type} onValueChange={v => updateField('card_type', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {cardTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>رقم العملية</Label>
                      <Input value={form.card_transaction_number} onChange={e => updateField('card_transaction_number', e.target.value)} />
                    </div>
                    <div>
                      <Label>آخر 4 أرقام</Label>
                      <Input dir="ltr" maxLength={4} value={form.card_last4} onChange={e => updateField('card_last4', e.target.value)} className="text-left" />
                    </div>
                  </div>
                )}
              </>)}

              {/* ── Payment link: the client pays it themselves ──────────── */}
              {isPaymentLink && (
                <div className="space-y-3 bg-muted/50 p-3 rounded-lg">
                  <div>
                    <Label>صلاحية الرابط *</Label>
                    <Select value={form.payment_link_expiry_days} onValueChange={v => updateField('payment_link_expiry_days', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {linkExpiryOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>تذكير قبل الانتهاء</Label>
                    <Select value={form.payment_link_reminder_days} onValueChange={v => updateField('payment_link_reminder_days', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {linkReminderOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label> طرق الدفع المتاحة للعميل *</Label>
                    {/* Multi-select: the client picks from whichever gateways are enabled here. */}
                    <Popover open={gatewayComboOpen} onOpenChange={setGatewayComboOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={gatewayComboOpen}
                          className="w-full justify-between font-normal bg-background"
                        >
                          <span className={cn('truncate', !form.payment_link_gateways.length && 'text-muted-foreground')}>
                            {form.payment_link_gateways.length
                              ? form.payment_link_gateways.join('، ')
                              : 'اختر طرق الدفع'}
                          </span>
                          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandList>
                            <CommandGroup>
                              {linkGateways.map(g => (
                                <CommandItem key={g} value={g} onSelect={() => toggleGateway(g)}>
                                  <Checkbox
                                    checked={form.payment_link_gateways.includes(g)}
                                    className="me-2 pointer-events-none"
                                  />
                                  {g}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Which of the office's configured gateway accounts issues the link. */}
                  <div>
                    <Label>بوابة الدفع *</Label>
                    {loadingGatewayAccounts ? (
                      <div className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> جاري تحميل البوابات...
                      </div>
                    ) : gatewayAccounts.length === 0 ? (
                      <p className="rounded-md border border-dashed bg-background p-2.5 text-xs text-muted-foreground">
                        لا توجد بوابات دفع مضافة — أضفها من الإعدادات ← بوابات الدفع
                      </p>
                    ) : (
                      <Select
                        value={form.payment_gateway_id}
                        onValueChange={v => updateField('payment_gateway_id', v)}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="اختر بوابة الدفع" />
                        </SelectTrigger>
                        <SelectContent>
                          {gatewayAccounts.map(g => (
                            <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div>
                    <Label>إرسال الرابط عبر *</Label>
                    <RadioGroup
                      value={form.payment_link_channel}
                      onValueChange={v => updateField('payment_link_channel', v)}
                      className="grid gap-2 mt-1"
                    >
                      {availableLinkChannels.map(({ value, label, icon: Icon }) => (
                        <Label
                          key={value}
                          htmlFor={`lc-${value}`}
                          className={cn(
                            'flex items-center gap-3 rounded-lg border bg-background p-2.5 cursor-pointer transition-colors hover:bg-muted/50',
                            form.payment_link_channel === value && 'border-primary bg-primary/5',
                          )}
                        >
                          <RadioGroupItem value={value} id={`lc-${value}`} />
                          <Icon size={16} className="shrink-0 text-primary" />
                          <span className="font-medium">{label}</span>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">سيتم تسجيله بحالة بانتظار الدفع</p>
                      <p className="text-xs text-amber-800">
                        يتحول تلقائيًا لـ«مدفوع» فور دفع العميل — دون تكرار السجل
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              {/* Section 3: الفاتورة والمرفقات */}
              <h4 className="font-bold text-sm text-primary">الفاتورة والمرفقات</h4>
              <div className="flex items-center gap-2">
                <Checkbox id="invoice" checked={form.has_invoice} onCheckedChange={v => updateField('has_invoice', !!v)} />
                <Label htmlFor="invoice" className="cursor-pointer">إنشاء فاتورة رسمية</Label>
              </div>
              {form.has_invoice && (
                <p className="text-sm text-green-600">سيتم إنشاء فاتورة رسمية عند الحفظ</p>
              )}
              <div>
                <Label>الملاحظات</Label>
                <Textarea value={form.notes} onChange={e => updateField('notes', e.target.value)} rows={3} />
              </div>
              <div>
                <Label>المرفقات</Label>
                {/* Existing attachments (edit only) — each removable */}
                {isEdit && (
                  attachmentsLoading ? (
                    <div className="py-3 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto" size={18} /></div>
                  ) : existingAttachments.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {existingAttachments.map(att => (
                        <div key={att.id} className="relative group aspect-square rounded-lg overflow-hidden border">
                          {isImageName(att.file_name) ? (
                            <img src={att.url} alt={att.file_name} className="w-full h-full object-cover" />
                          ) : (
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground hover:bg-muted/50"
                            >
                              <FileText size={20} />
                              <span className="w-full truncate text-[10px]">{att.file_name}</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(att.id)}
                            disabled={deletingAttachmentId === att.id}
                            className="absolute top-1 left-1 bg-destructive/90 text-destructive-foreground rounded-full p-1 hover:bg-destructive disabled:opacity-50"
                            aria-label="حذف المرفق"
                          >
                            {deletingAttachmentId === att.id ? <Loader2 className="animate-spin" size={12} /> : <X size={12} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => setSelectedAttachments(e.target.files ? Array.from(e.target.files) : [])}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) setSelectedAttachments(Array.from(e.dataTransfer.files)); }}
                  onDragOver={e => e.preventDefault()}
                  className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  {selectedAttachments.length > 0 ? (
                    <p className="text-sm">تم اختيار {selectedAttachments.length} {selectedAttachments.length === 1 ? 'ملف' : 'ملفات'}</p>
                  ) : (
                    <>
                      <p className="text-sm">اسحب الملفات هنا أو انقر للاختيار</p>
                      <p className="text-xs mt-1">صور الشيك، إيصال التحويل، الخ</p>
                    </>
                  )}
                </div>
                {isEdit && (
                  <p className="text-xs text-muted-foreground mt-1">الملفات الجديدة تُضاف إلى المرفقات الحالية عند الحفظ.</p>
                )}
              </div>
            </div>
          </ScrollArea>
          <div className="shrink-0 flex items-center gap-3 p-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t">
            <Button onClick={() => { onSave(buildCollection(false), false, selectedAttachments); onOpenChange(false); }} disabled={!canSave}>
              حفظ التحصيل
            </Button>
            <Button variant="outline" className="border-green-500 text-green-600 hover:bg-green-50" onClick={() => { onSave(buildCollection(true), true, selectedAttachments); onOpenChange(false); }} disabled={!canSave}>
              حفظ وإصدار فاتورة
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          </div>
        </SheetContent>
      </Sheet>
      <QuickAddClientDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} onClientAdded={onClientAdded} />
    </>
  );
};

export default CollectionFormDrawer;
