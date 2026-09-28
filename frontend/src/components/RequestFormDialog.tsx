import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect, MultiSearchableSelect } from '@/components/ui/searchable-select';
import { AsyncSearchableSelect } from '@/components/ui/async-searchable-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Plus, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Client, ClientRequest, ClientType, RequestCategory, RequestStatus, RequestType } from '@/types';
import { useLookups } from '@/contexts/LookupsContext';
import { clientsService, ClientOption } from '@/services/clients';
import QuickAddClientDialog from './QuickAddClientDialog';

/**
 * A request is raised by the person looking to rent or buy — never by a وسيط or
 * a مسؤول عقار, who appear on the request in their own field.
 */
const REQUEST_CLIENT_TYPES: ClientType[] = ['فرد', 'شركة'];

interface RequestFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ClientRequest | null;
  clients: ClientOption[];
  /** When set, new requests default to (and lock to) this type; the type picker is hidden. */
  lockedType?: RequestType;
  onSave: (request: ClientRequest) => void | Promise<void>;
  onClientAdded: (client: Client) => void;
}

const RequestFormDialog: React.FC<RequestFormDialogProps> = ({ open, onOpenChange, request, clients, lockedType, onSave, onClientAdded }) => {
  const isEdit = !!request;

  // Option lists from the backend lookup tables (requests link to property_cats + activities).
  const { requestStatuses, governorates, areas, propertyCatsFor, activitiesFor } = useLookups();
  const [clientId, setClientId] = useState('');
  const [requestType, setRequestType] = useState<RequestType>('إيجار');
  const [categories, setCategories] = useState<RequestCategory[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [governorateId, setGovernorateId] = useState<number | undefined>();
  // المنطقة — several areas per request. Held as strings because that is what the
  // select works in; converted back to ids on save.
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [area, setArea] = useState<number | undefined>();
  const [price, setPrice] = useState<number | undefined>();
  const [brokerId, setBrokerId] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<RequestStatus>('جديد');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  /** Which field the quick-add dialog is filling: the request's client, or its broker. */
  const [quickAddTarget, setQuickAddTarget] = useState<'client' | 'broker'>('client');
  const [clientSearch, setClientSearch] = useState('');

  // التصنيف والنشاط are kept as two lists — a شراء request draws on the sale side's,
  // an إيجار request on the rental side's — so both follow the type picker.
  const allCategories = propertyCatsFor(requestType) as RequestCategory[];
  const activityOptions = activitiesFor(requestType);

  // Switching the type switches the lists under the selections, so anything the
  // new side does not offer is dropped rather than silently submitted and rejected.
  // Only an actual change prunes: on open the selections come from the request
  // being edited, and the lists may not have loaded yet.
  const lastType = useRef<RequestType | null>(null);
  useEffect(() => {
    const changed = lastType.current !== null && lastType.current !== requestType;
    lastType.current = requestType;
    if (!changed) return;
    setCategories(prev => prev.filter(c => allCategories.includes(c)));
    setActivities(prev => prev.filter(a => activityOptions.includes(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestType]);

  // الوسيط trigger text. Held alongside the id because the broker need not be in
  // the current page of search results — on edit it comes from the request itself.
  const [brokerLabel, setBrokerLabel] = useState('');

  // Backend-driven client combobox state
  const [comboOpen, setComboOpen] = useState(false);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>(clients);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);

  useEffect(() => {
    if (request) {
      setClientId(request.client_id);
      setRequestType(request.request_type);
      setCategories([request.category]);
      setActivities(request.activities || []);
      setGovernorateId(request.governorate_id);
      setAreaIds((request.area_ids ?? []).map(String));
      setArea(request.area);
      setPrice(request.price);
      setBrokerId(request.broker_id || '');
      // The request already carries the resolved broker name/phone, so the
      // trigger needs no lookup of its own.
      setBrokerLabel(request.broker_id
        ? [request.broker_name, request.broker_phone_num].filter(Boolean).join(' — ')
        : '');
      setNotes(request.notes || '');
      setStatus(request.status);
      // Seed the trigger label from the request itself — the client will not be
      // in the capped option list until the user searches for them.
      setSelectedClient({
        id: request.client_id,
        full_name: request.client_name,
        phone: request.client_phone,
        type: 'فرد',
      });
    } else {
      setClientId(''); setRequestType(lockedType ?? 'إيجار'); setCategories([]); setActivities([]); setGovernorateId(undefined);
      setAreaIds([]); setArea(undefined); setPrice(undefined); setBrokerId(''); setNotes(''); setStatus('جديد');
      setBrokerLabel('');
      setSelectedClient(null);
    }
    setClientSearch('');
  }, [request, open, lockedType]);

  // Keep the option list in sync with the prop (e.g. after a client is quick-added),
  // without resetting the form/selection — that only happens on open/request change above.
  // Filtered here as well as in the query below: the prop is the page's unfiltered
  // list, and it is what shows in the moment before the first search returns.
  useEffect(() => {
    setClientOptions(clients.filter(c => REQUEST_CLIENT_TYPES.includes(c.type)));
  }, [clients]);

  // الوسيط — clients narrowed to that type by the query rather than by filtering
  // a fully-loaded list. Not memoised: AsyncSearchableSelect holds the fetcher in
  // a ref, so a fresh closure each render re-triggers nothing.
  const fetchBrokers = (search: string) =>
    clientsService.options({ search: search || undefined, type: ['وسيط'] });

  const brokerOptionLabel = (b: ClientOption) =>
    b.phone ? `${b.full_name} — ${b.phone}` : b.full_name;

  const pickBroker = (broker?: ClientOption) => {
    setBrokerId(broker?.id ?? '');
    setBrokerLabel(broker ? brokerOptionLabel(broker) : '');
  };

  // Debounced backend search — queries clients/options so results aren't limited
  // to the client list's page size, and carry none of its payload.
  useEffect(() => {
    if (!comboOpen) return;
    let cancelled = false;
    setLoadingClients(true);
    const t = setTimeout(async () => {
      try {
        const res = await clientsService.options({ search: clientSearch || undefined, type: REQUEST_CLIENT_TYPES });
        if (!cancelled) setClientOptions(res);
      } catch {
        if (!cancelled) setClientOptions([]);
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [clientSearch, comboOpen]);

  const toggleCategory = (cat: RequestCategory) => {
    setCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  // Picking a governorate resets the areas, since areas are scoped to a governorate.
  const handleGovernorateChange = (value: string) => {
    setGovernorateId(value ? Number(value) : undefined);
    setAreaIds([]);
  };

  const areasForGovernorate = governorateId
    ? areas.filter(a => a.governorate_id === governorateId)
    : [];

  const pickClient = (client: ClientOption) => {
    setClientId(client.id);
    setSelectedClient(client);
    setComboOpen(false);
  };

  const handleSave = () => {
    if (!clientId || categories.length === 0 || !selectedClient) return;
    onSave({
      id: request?.id || `r-${Date.now()}`,
      client_id: clientId,
      client_name: selectedClient.full_name,
      client_phone: selectedClient.phone,
      request_type: requestType,
      category: categories[0],
      activities,
      governorate_id: governorateId,
      area_ids: areaIds.map(Number),
      area: area,
      price: price,
      broker_id: brokerId || undefined,
      notes: notes || undefined,
      status: isEdit ? status : 'جديد',
      created_at: request?.created_at || new Date().toISOString().split('T')[0],
    });
    onOpenChange(false);
  };

  const handleQuickAdd = (client: Client) => {
    // A newly added وسيط belongs in the broker selection, not in the request's
    // client field. No local list to insert into — the next search hits the
    // backend, which already has it.
    if (quickAddTarget === 'broker') {
      pickBroker(client);
      return;
    }
    onClientAdded(client);
    pickClient(client);
  };

  const openQuickAdd = (target: 'client' | 'broker') => {
    setQuickAddTarget(target);
    setQuickAddOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'تعديل الطلب' : 'إضافة طلب جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Status (edit only) */}
            {isEdit && (
              <div>
                <Label>الحالة</Label>
                <Select value={status} onValueChange={v => setStatus(v as RequestStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {requestStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Client */}
            <div>
              <Label>العميل *</Label>
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className={cn('truncate', !selectedClient && 'text-muted-foreground')}>
                      {selectedClient ? `${selectedClient.full_name} — ${selectedClient.phone}` : 'اختر عميل'}
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
                                <Check className={cn('me-2 h-4 w-4', clientId === c.id ? 'opacity-100' : 'opacity-0')} />
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
              <Button variant="link" size="sm" className="mt-1 p-0 h-auto text-primary" onClick={() => openQuickAdd('client')}>
                <Plus size={14} className="ml-1" />
                إضافة عميل جديد
              </Button>
            </div>

            {/* Request type — hidden when the page is scoped to a single type */}
            {!lockedType && (
              <div>
                <Label>نوع الطلب *</Label>
                <RadioGroup value={requestType} onValueChange={v => setRequestType(v as RequestType)} className="flex gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="إيجار" id="req-rent" />
                    <Label htmlFor="req-rent" className="cursor-pointer">إيجار</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="شراء" id="req-buy" />
                    <Label htmlFor="req-buy" className="cursor-pointer">شراء</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Category tags */}
            <div>
              <Label>التصنيف *</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {allCategories.map(cat => (
                  <Badge
                    key={cat}
                    variant={categories.includes(cat) ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => toggleCategory(cat)}
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Activity — يمكن اختيار أكثر من نشاط */}
            <div>
              <Label>النشاط</Label>
              <MultiSearchableSelect
                value={activities}
                onValueChange={setActivities}
                options={activityOptions}
                placeholder="اختر النشاط"
                searchPlaceholder="بحث عن نشاط..."
              />
            </div>

            <div>
              <Label>المحافظة</Label>
              <SearchableSelect
                value={governorateId ? String(governorateId) : ''}
                onValueChange={handleGovernorateChange}
                options={governorates.map(g => ({ value: String(g.id), label: g.name }))}
                placeholder="اختر المحافظة"
                searchPlaceholder="بحث عن محافظة..."
              />
            </div>
            {/* المنطقة — يمكن اختيار أكثر من منطقة داخل نفس المحافظة */}
            <div>
              <Label>المنطقة</Label>
              <MultiSearchableSelect
                value={areaIds}
                onValueChange={setAreaIds}
                options={areasForGovernorate.map(a => ({ value: String(a.id), label: a.name }))}
                placeholder={governorateId ? 'اختر المنطقة' : 'اختر المحافظة أولاً'}
                searchPlaceholder="بحث عن منطقة..."
                disabled={!governorateId}
              />
            </div>
            <div>
              <Label>المساحة</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={area || ''} onChange={e => setArea(e.target.value ? Number(e.target.value) : undefined)} />
                <span className="text-sm text-muted-foreground whitespace-nowrap">م²</span>
              </div>
            </div>
            <div>
              <Label>السعر</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={price ?? ''}
                  onChange={e => setPrice(e.target.value ? Number(e.target.value) : undefined)}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">د.ك</span>
              </div>
            </div>
            {/* الوسيط — عميل من نوع "وسيط" */}
            <div>
              <Label>الوسيط</Label>
              <AsyncSearchableSelect
                value={brokerId}
                onSelect={pickBroker}
                onClear={() => pickBroker()}
                fetchOptions={fetchBrokers}
                optionValue={b => b.id}
                optionLabel={brokerOptionLabel}
                selectedLabel={brokerLabel}
                placeholder="اختر الوسيط"
                searchPlaceholder="ابحث باسم الوسيط..."
                emptyText="لا يوجد وسيط مطابق"
              />
              <Button variant="link" size="sm" className="mt-1 p-0 h-auto text-primary" onClick={() => openQuickAdd('broker')}>
                <Plus size={14} className="ml-1" />
                إضافة وسيط جديد
              </Button>
            </div>
            <div>
              <Label>الملاحظات</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={!clientId || categories.length === 0}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickAddClientDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onClientAdded={handleQuickAdd}
        defaultType={quickAddTarget === 'broker' ? 'وسيط' : 'فرد'}
      />
    </>
  );
};

export default RequestFormDialog;
