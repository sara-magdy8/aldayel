import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Loader2, FileText, Plus, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect, MultiSearchableSelect } from '@/components/ui/searchable-select';
import { AsyncSearchableSelect } from '@/components/ui/async-searchable-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Property, ListingType, PropertyCategory, PropertyStatus, PropertyType, Client, ClientType } from '@/types';
import { useLookups } from '@/contexts/LookupsContext';
import { clientsService, ClientOption } from '@/services/clients';
import { propertiesService, PropertyAttachmentDto } from '@/services/properties';
import QuickAddClientDialog from './QuickAddClientDialog';

interface PropertyFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property | null;
  listingType: ListingType;
  onSave: (property: Property, attachments: File[]) => void;
}

const isImage = (mime: string) => mime.startsWith('image/');

// Sentinel for the "no selection" option — Radix Select forbids empty-string values.
/** Sentinel for the "بدون تحديد" item — Radix Select has no empty-string value. */
const NONE_OPTION = '__none__';

/** Which client field the quick-add dialog is currently filling. */
type QuickAddTarget = 'owner' | 'broker' | 'manager' | 'tenant';

/** The client type each target expects, so the dialog opens preset to it. */
const QUICK_ADD_TYPE: Record<QuickAddTarget, ClientType> = {
  owner: 'فرد',
  broker: 'وسيط',
  manager: 'مسؤول العقار',
  // A tenant may be فرد or شركة; the dialog's own type picker covers the latter.
  tenant: 'فرد',
};

const PropertyFormDrawer: React.FC<PropertyFormDrawerProps> = ({ open, onOpenChange, property, listingType, onSave }) => {
  const isEdit = !!property;
  const isRental = listingType === 'إيجار';

  // Option lists from the backend lookup tables. التصنيف والنشاط are kept as two
  // lists — rental and sale — so this form only offers its own side's.
  const { filmedBy: filmedByOptions, buildingStatuses, governorates, areas, propertyStatusesFor, propertyCatsFor, activitiesFor } = useLookups();
  const categories = propertyCatsFor(listingType);
  const activityOptions = activitiesFor(listingType);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTarget, setQuickAddTarget] = useState<QuickAddTarget>('owner');

  const [codeLoading, setCodeLoading] = useState(false);

  const [selectedAttachments, setSelectedAttachments] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<PropertyAttachmentDto[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Partial<Property>>({
    name: '',
    property_code: '',
    property_type: 'مستقل',
    // Filled from this side's list once the lookups land — see the effect below.
    category: '',
    filmed_by: '',
    building_status: '',
    priority: false,
    activities: [],
    owner_id: undefined,
    owner_name: '',
    plot_number: '',
    governorate_id: undefined,
    area_id: undefined,
    address: '',
    area: undefined,
    rent_amount: undefined,
    price: undefined,
    location_link: '',
    description: '',
    conditions: '',
    grace_period: '',
    guard_name: '',
    guard_phone: '',
    broker_id: undefined,
    manager_id: undefined,
    forsale_link: '',
    instagram_link: '',
    whatsapp_link: '',
    marketing_status: false,
    show_soum_in_pdf: false,
    commission: undefined,
    notes: '',
    status: 'متاح',
    tenant_id: undefined,
    tenant_name: '',
    tenant_start: '',
    tenant_end: '',
    sale_date: '',
  });

  useEffect(() => {
    if (property) {
      setForm({ ...property });
    } else {
      setForm({
        // category is left blank here and filled by the effect below, which waits
        // for this side's list rather than assuming a name both sides share.
        name: '', property_code: '', property_type: 'مستقل', category: '', filmed_by: '', building_status: '', priority: false, activities: [], owner_id: undefined, owner_name: '', plot_number: '',
        governorate_id: undefined, area_id: undefined, address: '', area: undefined, rent_amount: undefined, price: undefined, location_link: '',
        description: '', conditions: '', grace_period: '', guard_name: '', guard_phone: '',
        broker_id: undefined, manager_id: undefined,
        forsale_link: '', instagram_link: '', whatsapp_link: '', marketing_status: false, show_soum_in_pdf: false, commission: undefined,
        notes: '', status: 'متاح', tenant_id: undefined, tenant_name: '', tenant_start: '', tenant_end: '', sale_date: '',
      });
    }
  }, [property, open]);

  // Default a new property to the first category of its own side's list, once
  // that list is known — the drawer can open before the lookups have landed, and
  // the two sides no longer share a category that could be hard-coded here.
  useEffect(() => {
    if (property || !open || form.category || !categories.length) return;
    setForm(prev => ({ ...prev, category: categories[0] }));
  }, [property, open, form.category, categories]);

  // Fetch the next free code from the backend and drop it into the field. The
  // value is only a suggestion — the field stays editable.
  const applyNextCode = async (token?: { cancelled: boolean }) => {
    setCodeLoading(true);
    try {
      const code = await propertiesService.nextCode(listingType);
      if (!token?.cancelled) setForm(prev => ({ ...prev, property_code: code }));
    } catch {
      // Non-critical: the user can still type a code manually.
    } finally {
      if (!token?.cancelled) setCodeLoading(false);
    }
  };

  // Prefill a generated code when the drawer opens for a new property. Editing
  // an existing one keeps its stored code. Keyed on the listing type as well
  // because each type has its own counter — the same drawer opened from the بيع
  // tab must suggest from the بيع series, not the إيجار one.
  useEffect(() => {
    if (!open || property) return;
    const token = { cancelled: false };
    applyNextCode(token);
    return () => { token.cancelled = true; };
  }, [open, property, listingType]);

  // Reset newly-picked files, then load the property's persisted attachments
  // (with ids) so they can be previewed/removed.
  useEffect(() => {
    if (!open) return;
    setSelectedAttachments([]);
    setExistingAttachments([]);
    if (!property) return;
    let cancelled = false;
    setAttachmentsLoading(true);
    (async () => {
      try {
        const list = await propertiesService.getAttachments(property.id);
        if (!cancelled) setExistingAttachments(list);
      } catch {
        // Non-critical: the form still works for field edits and new uploads.
      } finally {
        if (!cancelled) setAttachmentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, property]);

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!property) return;
    setDeletingAttachmentId(attachmentId);
    try {
      await propertiesService.deleteAttachment(property.id, attachmentId);
      setExistingAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch {
      // Surface failures via the page-level toast on save; keep the drawer usable.
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const updateField = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  // Picking a governorate resets the area, since areas are scoped to a governorate.
  const handleGovernorateChange = (value: string) => {
    setForm(prev => ({ ...prev, governorate_id: Number(value), area_id: undefined }));
  };

  // Areas belonging to the currently selected governorate.
  const areasForGovernorate = form.governorate_id
    ? areas.filter(a => a.governorate_id === form.governorate_id)
    : [];

  /**
   * Backend-searched client options, capped server-side. The owner may be any
   * client; الوسيط / مسؤول العقار are narrowed to their own type by the query
   * rather than by filtering a fully-loaded list.
   */
  // Not memoised: AsyncSearchableSelect holds the fetcher in a ref, so a fresh
  // closure each render costs nothing and re-triggers nothing.
  const fetchClientsOfType = (types?: ClientType[]) => (search: string) =>
    clientsService.options({ search: search || undefined, type: types });

  const fetchCompanyIndividualClient = fetchClientsOfType(['شركة', 'فرد']);
  const fetchBrokers = fetchClientsOfType(['وسيط']);
  const fetchManagers = fetchClientsOfType(['مسؤول العقار']);
  // المستأجر is a person or a company — never a وسيط / مسؤول عقار.
  const fetchTenants = fetchClientsOfType(['فرد', 'شركة']);

  // The phone rides along in the الوسيط / مسؤول العقار labels since the separate
  // phone fields are gone.
  const clientLabel = (c: ClientOption) => (c.phone ? `${c.full_name} — ${c.phone}` : c.full_name);

  const handleOwnerChange = (client: ClientOption) => {
    setForm(prev => ({ ...prev, owner_id: client.id, owner_name: client.full_name }));
  };

  // The name is mirrored only so the trigger keeps its label; the backend
  // derives `tenant_name` from the id and ignores whatever we send for it.
  const handleTenantChange = (client?: ClientOption) => {
    setForm(prev => ({ ...prev, tenant_id: client?.id, tenant_name: client?.full_name }));
  };

  /**
   * Point a client field at a client, or clear it. The name/phone are mirrored
   * onto the form so the saved object stays readable before the backend echoes
   * the resolved values back — and so the trigger keeps its label without the
   * selection having to be present in the current page of search results.
   */
  const handleClientFieldChange = (field: 'broker' | 'manager', client?: ClientOption) => {
    setForm(prev => ({
      ...prev,
      [`${field}_id`]: client?.id,
      [`${field}_name`]: client?.full_name,
      [`${field}_phone_num`]: client?.phone,
    }));
  };

  // Newly quick-added client: select it for whichever field opened the dialog.
  // No local list to insert into — the next search hits the backend, which has it.
  const handleClientAdded = (client: Client) => {
    if (quickAddTarget === 'owner') {
      setForm(prev => ({ ...prev, owner_id: client.id, owner_name: client.full_name }));
      return;
    }
    // No `tenant_phone_num` on the property, so the generic branch below does not fit.
    if (quickAddTarget === 'tenant') {
      setForm(prev => ({ ...prev, tenant_id: client.id, tenant_name: client.full_name }));
      return;
    }
    setForm(prev => ({
      ...prev,
      [`${quickAddTarget}_id`]: client.id,
      [`${quickAddTarget}_name`]: client.full_name,
      [`${quickAddTarget}_phone_num`]: client.phone,
    }));
  };

  const openQuickAdd = (target: QuickAddTarget) => {
    setQuickAddTarget(target);
    setQuickAddOpen(true);
  };

  const handleSubmit = () => {
    const saved: Property = {
      id: property?.id || '',
      name: form.name || '',
      property_code: form.property_code || '',
      // بيع only ever ships مستقل: a sale property cannot be متعدد الوحدات, so
      // the form hides the picker and an old سجل carrying it is corrected here.
      property_type: isRental ? ((form.property_type as PropertyType) || 'مستقل') : 'مستقل',
      listing_type: listingType,
      category: (form.category || categories[0]) as PropertyCategory,
      filmed_by: form.filmed_by || undefined,
      // بيع only: a rental carries no حالة البناء, and the backend nulls it anyway.
      building_status: isRental ? undefined : (form.building_status || undefined),
      priority: form.priority ?? false,
      activities: form.activities || [],
      owner_id: form.owner_id,
      owner_name: form.owner_name || '',
      plot_number: form.plot_number || '',
      area: form.area,
      governorate_id: form.governorate_id,
      area_id: form.area_id,
      governorate: form.governorate,
      area_name: form.area_name,
      address: form.address || '',
      location_link: form.location_link,
      description: form.description,
      guard_name: form.guard_name,
      guard_phone: form.guard_phone,
      broker_id: form.broker_id,
      manager_id: form.manager_id,
      broker_name: form.broker_name,
      broker_phone_num: form.broker_phone_num,
      manager_name: form.manager_name,
      manager_phone_num: form.manager_phone_num,
      forsale_link: form.forsale_link,
      instagram_link: form.instagram_link,
      whatsapp_link: form.whatsapp_link,
      marketing_status: form.marketing_status ?? false,
      show_soum_in_pdf: form.show_soum_in_pdf ?? false,
      commission: form.commission,
      notes: form.notes,
      status: (form.status as PropertyStatus) || 'متاح',
      rent_amount: form.rent_amount,
      price: form.price,
      conditions: form.conditions,
      grace_period: form.grace_period,
      tenant_id: form.tenant_id,
      tenant_name: form.tenant_name,
      tenant_start: form.tenant_start,
      tenant_end: form.tenant_end,
      sale_date: form.sale_date,
      attachments: property?.attachments || [],
      public_link_token: property?.public_link_token || '',
      public_link_enabled: property?.public_link_enabled || false,
      public_show_price: property?.public_show_price ?? true,
      public_show_location: property?.public_show_location ?? true,
      public_show_contact: property?.public_show_contact ?? true,
      created_at: property?.created_at || '',
    };
    onSave(saved, selectedAttachments);
  };

  const statuses = propertyStatusesFor(listingType);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* A flex column so the footer is laid out as a sibling the scroll area
          cannot push off-screen; gap-0 cancels the sheetVariants gap-4. h-dvh
          rather than the variant's h-full because on mobile the fixed-position
          containing block is the toolbar-expanded viewport, which is taller than
          what is actually visible. */}
      <SheetContent side="right" className="w-full sm:w-[520px] p-0 h-dvh flex flex-col gap-0">
        <SheetHeader className="p-6 pb-0 shrink-0">
          <SheetTitle>{isEdit ? `تعديل عقار ${isRental ? 'إيجار' : 'بيع'}` : `إضافة عقار ${isRental ? 'إيجار' : 'بيع'}`}</SheetTitle>
        </SheetHeader>
        {/* flex-1 + min-h-0: take whatever is left between header and footer.
            min-h-0 is required — a flex item defaults to min-height:auto and would
            refuse to shrink below its content, re-creating the overflow. */}
        <ScrollArea className="flex-1 min-h-0 px-6 py-4">
          <div className="space-y-4">
            {/* 1. اسم العقار */}
            <div>
              <Label>اسم العقار *</Label>
              <Input value={form.name || ''} onChange={e => updateField('name', e.target.value)} />
            </div>

            {/* كود العقار — يُولَّد تلقائيًا ويمكن تعديله */}
            <div>
              <Label>كود العقار *</Label>
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={form.property_code || ''}
                  onChange={e => updateField('property_code', e.target.value)}
                  placeholder={codeLoading ? 'جارٍ توليد الكود…' : 'مثال: P-101'}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="توليد كود جديد"
                  disabled={codeLoading}
                  onClick={() => applyNextCode()}
                >
                  {codeLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* 2. نوع العقار — إيجار فقط. عقارات البيع دائماً مستقلة، فلا يُعرض
                الخيار ويُحفظ النوع "مستقل" في handleSubmit. */}
            {isRental && (
              <div>
                <Label>نوع العقار *</Label>
                <RadioGroup value={form.property_type || 'مستقل'} onValueChange={v => updateField('property_type', v)} className="flex gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="مستقل" id="type-single" />
                    <Label htmlFor="type-single" className="cursor-pointer">مستقل</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="متعدد الوحدات" id="type-multi" />
                    <Label htmlFor="type-multi" className="cursor-pointer">متعدد الوحدات</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* 3. التصنيف */}
            <div>
              <Label>التصنيف *</Label>
              <Select value={form.category || ''} onValueChange={v => updateField('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* تم التصوير من قبل */}
            <div>
              <Label>تم التصوير من قبل</Label>
              <Select
                value={form.filmed_by || NONE_OPTION}
                onValueChange={v => updateField('filmed_by', v === NONE_OPTION ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_OPTION}>بدون تحديد</SelectItem>
                  {filmedByOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* الأولوية */}
            <div>
              <Label>الأولوية</Label>
              <Select
                value={form.priority ? 'yes' : 'no'}
                onValueChange={v => updateField('priority', v === 'yes')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">نعم</SelectItem>
                  <SelectItem value="no">لا</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* النشاط — يمكن اختيار أكثر من نشاط */}
            <div>
              <Label>{isRental ? 'النشاط' : 'حالة الاشغال'}</Label>
              <MultiSearchableSelect
                value={form.activities || []}
                onValueChange={v => updateField('activities', v)}
                options={activityOptions}
                placeholder="اختر"
                searchPlaceholder="بحث عن نشاط..."
              />
            </div>

            {/* 4. المالك */}
            <div>
              <Label>المالك *</Label>
              {/* Backend-searched — the client table can outgrow any dropdown. */}
              <AsyncSearchableSelect
                value={form.owner_id ? String(form.owner_id) : ''}
                onSelect={handleOwnerChange}
                fetchOptions={fetchCompanyIndividualClient}
                optionValue={c => c.id}
                optionLabel={c => c.full_name}
                // The owner is not necessarily in the current page of results.
                selectedLabel={form.owner_name}
                placeholder="اختر المالك"
                searchPlaceholder="ابحث باسم العميل..."
                emptyText="لا يوجد عميل مطابق"
              />
              <Button variant="link" size="sm" className="mt-1 p-0 h-auto text-primary" onClick={() => openQuickAdd('owner')}>
                <Plus size={14} className="ml-1" />
                إضافة عميل جديد
              </Button>
            </div>

            {/* 5. رقم القسيمة */}
            <div>
              <Label>رقم القسيمة *</Label>
              <Input value={form.plot_number || ''} onChange={e => updateField('plot_number', e.target.value)} />
            </div>

            {/* 6. المحافظة */}
            <div>
              <Label>المحافظة *</Label>
              <SearchableSelect
                value={form.governorate_id ? String(form.governorate_id) : ''}
                onValueChange={handleGovernorateChange}
                options={governorates.map(g => ({ value: String(g.id), label: g.name }))}
                placeholder="اختر المحافظة"
                searchPlaceholder="بحث عن محافظة..."
              />
            </div>

            {/* 7. المنطقة */}
            <div>
              <Label>المنطقة *</Label>
              <SearchableSelect
                value={form.area_id ? String(form.area_id) : ''}
                onValueChange={v => updateField('area_id', Number(v))}
                options={areasForGovernorate.map(a => ({ value: String(a.id), label: a.name }))}
                placeholder={form.governorate_id ? 'اختر المنطقة' : 'اختر المحافظة أولاً'}
                searchPlaceholder="بحث عن منطقة..."
                disabled={!form.governorate_id}
              />
            </div>

            {/* حالة البناء — عقارات البيع only */}
            {!isRental && (
              <div>
                <Label>حالة البناء</Label>
                <Select
                  value={form.building_status || NONE_OPTION}
                  onValueChange={v => updateField('building_status', v === NONE_OPTION ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_OPTION}>بدون تحديد</SelectItem>
                    {buildingStatuses.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 7. المساحة */}
            <div>
              <Label>المساحة</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={form.area || ''} onChange={e => updateField('area', e.target.value ? Number(e.target.value) : undefined)} />
                <span className="text-sm text-muted-foreground whitespace-nowrap">م²</span>
              </div>
            </div>

            {/* 8. مبلغ الإيجار / السعر */}
            {isRental ? (
              <div>
                <Label>مبلغ الإيجار *</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={form.rent_amount || ''} onChange={e => updateField('rent_amount', e.target.value ? Number(e.target.value) : undefined)} />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">د.ك</span>
                </div>
              </div>
            ) : (
              <div>
                <Label>السعر</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={form.price || ''} onChange={e => updateField('price', e.target.value ? Number(e.target.value) : undefined)} />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">د.ك</span>
                </div>
              </div>
            )}

            {/* 9. رابط الموقع */}
            <div>
              <Label>رابط الموقع</Label>
              <Input type="url" value={form.location_link || ''} onChange={e => updateField('location_link', e.target.value)} placeholder="https://" />
            </div>

            {/* 10. المواصفات */}
            <div>
              <Label>المواصفات</Label>
              <Textarea value={form.description || ''} onChange={e => updateField('description', e.target.value)} rows={3} />
            </div>

            {/* 11. الشروط */}
            <div>
              <Label>الشروط</Label>
              <Textarea value={form.conditions || ''} onChange={e => updateField('conditions', e.target.value)} rows={2} />
            </div>

            {/* فترة السماح — إيجار فقط */}
            {isRental && (
              <div>
                <Label>فترة السماح</Label>
                <Input value={form.grace_period || ''} onChange={e => updateField('grace_period', e.target.value)} />
              </div>
            )}

            {/* الحارس — يظهر في حالتي الإيجار والبيع */}
            <div>
              <Label>اسم الحارس</Label>
              <Input value={form.guard_name || ''} onChange={e => updateField('guard_name', e.target.value)} />
            </div>
            <div>
              <Label>رقم الحارس</Label>
              <Input value={form.guard_phone || ''} onChange={e => updateField('guard_phone', e.target.value)} />
            </div>

            {/* العمولة */}
            <div>
              <Label>العمولة</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={form.commission || ''} onChange={e => updateField('commission', e.target.value ? Number(e.target.value) : undefined)} />
                <span className="text-sm text-muted-foreground whitespace-nowrap">د.ك</span>
              </div>
            </div>

            {/* الوسيط — عميل من نوع "وسيط"; رقم الهاتف يأتي من بطاقة العميل */}
            <div>
              <Label>الوسيط</Label>
              <AsyncSearchableSelect
                value={form.broker_id ? String(form.broker_id) : ''}
                onSelect={c => handleClientFieldChange('broker', c)}
                onClear={() => handleClientFieldChange('broker')}
                fetchOptions={fetchBrokers}
                optionValue={c => c.id}
                optionLabel={clientLabel}
                selectedLabel={form.broker_name}
                placeholder="اختر الوسيط"
                searchPlaceholder="ابحث باسم الوسيط..."
                emptyText="لا يوجد وسيط مطابق"
              />
              <Button variant="link" size="sm" className="mt-1 p-0 h-auto text-primary" onClick={() => openQuickAdd('broker')}>
                <Plus size={14} className="ml-1" />
                إضافة وسيط جديد
              </Button>
            </div>

            {/* مسؤول العقار — عميل من نوع "مسؤول العقار" */}
            <div>
              <Label>مسؤول العقار</Label>
              <AsyncSearchableSelect
                value={form.manager_id ? String(form.manager_id) : ''}
                onSelect={c => handleClientFieldChange('manager', c)}
                onClear={() => handleClientFieldChange('manager')}
                fetchOptions={fetchManagers}
                optionValue={c => c.id}
                optionLabel={clientLabel}
                selectedLabel={form.manager_name}
                placeholder="اختر مسؤول العقار"
                searchPlaceholder="ابحث باسم المسؤول..."
                emptyText="لا يوجد مسؤول مطابق"
              />
              <Button variant="link" size="sm" className="mt-1 p-0 h-auto text-primary" onClick={() => openQuickAdd('manager')}>
                <Plus size={14} className="ml-1" />
                إضافة مسؤول عقار جديد
              </Button>
            </div>

            {/* بيانات التسويق */}
            <div className="space-y-4 p-4 bg-muted rounded-lg">
              <h3 className="text-sm font-semibold">بيانات التسويق</h3>
              <div>
                <Label>رابط فورسيل </Label>
                <Input type="url" value={form.forsale_link || ''} onChange={e => updateField('forsale_link', e.target.value)} placeholder="https://" />
              </div>
              <div>
                <Label>رابط انستقرام</Label>
                <Input type="url" value={form.instagram_link || ''} onChange={e => updateField('instagram_link', e.target.value)} placeholder="https://" />
              </div>
              <div>
                <Label>رابط واتساب</Label>
                <Input type="url" value={form.whatsapp_link || ''} onChange={e => updateField('whatsapp_link', e.target.value)} placeholder="https://" />
              </div>
              {/* حالة التسويق — يحددها المستخدم يدويًا (تم / لم يتم) */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <Label htmlFor="marketing-status" className="cursor-pointer">حالة التسويق</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="marketing-status"
                    checked={!!form.marketing_status}
                    onCheckedChange={v => updateField('marketing_status', v)}
                  />
                  <span className="text-sm text-muted-foreground">{form.marketing_status ? 'تم' : 'لم يتم'}</span>
                </div>
              </div>
            </div>

            {/* الملاحظات */}
            <div>
              <Label>الملاحظات</Label>
              <Textarea value={form.notes || ''} onChange={e => updateField('notes', e.target.value)} rows={2} />
            </div>


            {/* الحالة */}
            <div>
              <Label>الحالة *</Label>
              <Select value={form.status || 'متاح'} onValueChange={v => updateField('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Conditional: tenant fields for مؤجر */}
            {isRental && form.status === 'مؤجر' && (
              <div className="p-4 bg-muted rounded-lg">
                <Label>اسم المستأجر</Label>
                {/* Picked from the clients table (فرد / شركة). The property row
                    stores the name only, so the name doubles as the option value —
                    that keeps a legacy free-typed name showing on the trigger. */}
                <AsyncSearchableSelect
                  value={form.tenant_id ? String(form.tenant_id) : ''}
                  onSelect={c => handleTenantChange(c)}
                  onClear={() => handleTenantChange()}
                  fetchOptions={fetchTenants}
                  optionValue={c => c.id}
                  optionLabel={clientLabel}
                  selectedLabel={form.tenant_name}
                  placeholder="اختر المستأجر"
                  searchPlaceholder="ابحث باسم العميل..."
                  emptyText="لا يوجد عميل مطابق"
                />
                <Button variant="link" size="sm" className="mt-1 p-0 h-auto text-primary" onClick={() => openQuickAdd('tenant')}>
                  <Plus size={14} className="ml-1" />
                  إضافة عميل جديد
                </Button>
              </div>
            )}

            {/* Conditional: sale date for مباع */}
            {!isRental && form.status === 'مباع' && (
              <div className="p-4 bg-muted rounded-lg">
                <Label>اسم المشتري</Label>
                {/* The buyer shares the property's single client link (`tenant_id`)
                    with the tenant: a property is either مؤجر or مباع, never both,
                    so only one of the two labels is ever in play. */}
                <AsyncSearchableSelect
                  value={form.tenant_id ? String(form.tenant_id) : ''}
                  onSelect={c => handleTenantChange(c)}
                  onClear={() => handleTenantChange()}
                  fetchOptions={fetchTenants}
                  optionValue={c => c.id}
                  optionLabel={clientLabel}
                  selectedLabel={form.tenant_name}
                  placeholder="اختر المشتري"
                  searchPlaceholder="ابحث باسم العميل..."
                  emptyText="لا يوجد عميل مطابق"
                />
                <Button variant="link" size="sm" className="mt-1 p-0 h-auto text-primary" onClick={() => openQuickAdd('tenant')}>
                  <Plus size={14} className="ml-1" />
                  إضافة عميل جديد
                </Button>
              </div>
            )}

            {/* إظهار السوم في PDF — عقارات البيع فقط (الإيجار لا سوم له) */}
            {!isRental && (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="show-soum-in-pdf" className="cursor-pointer">إظهار السوم في PDF العقار</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-soum-in-pdf"
                    checked={!!form.show_soum_in_pdf}
                    onCheckedChange={v => updateField('show_soum_in_pdf', v)}
                  />
                  <span className="text-sm text-muted-foreground">{form.show_soum_in_pdf ? 'نعم' : 'لا'}</span>
                </div>
              </div>
            )}


            {/* المرفقات */}
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
                        {isImage(att.file_type) ? (
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
                    <p className="text-xs mt-1">صور ومستندات</p>
                  </>
                )}
              </div>
              {isEdit && (
                <p className="text-xs text-muted-foreground mt-1">الملفات الجديدة تُضاف إلى المرفقات الحالية عند الحفظ.</p>
              )}
            </div>
          </div>
        </ScrollArea>
        {/* Extra bottom padding on phones: the sheet is pinned to the bottom of the
            viewport, where the browser's own toolbar / home indicator overlays it and
            hides the actions. env(safe-area-inset-bottom) clears the indicator; it is
            0 on devices that have none, so desktop spacing is unaffected. */}
        <div className="shrink-0 flex items-center gap-3 p-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t">
          <Button onClick={handleSubmit}>حفظ</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </div>
      </SheetContent>
      <QuickAddClientDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onClientAdded={handleClientAdded}
        defaultType={QUICK_ADD_TYPE[quickAddTarget]}
      />
    </Sheet>
  );
};

export default PropertyFormDrawer;
