import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { AsyncSearchableSelect } from '@/components/ui/async-searchable-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, FileText, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { RentalContract, RentalContractDocument, RentalDocumentType, PaymentPeriod, PaymentMethod, Unit } from '@/types';
import { useLookups } from '@/contexts/LookupsContext';
import { RentalContractFormData, RentalContractDocuments, RENTAL_DOCUMENT_SLOTS, rentalContractsService } from '@/services/rentalContracts';
import { unitsService } from '@/services/units';
import { clientsService, ClientOption } from '@/services/clients';
import { propertiesService, PropertyOption, propertyOptionLabel } from '@/services/properties';

interface RentalContractFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: RentalContract | null;
  onSave: (data: RentalContractFormData, asDraft: boolean, documents: RentalContractDocuments) => Promise<void>;
}

const RentalContractFormDrawer: React.FC<RentalContractFormDrawerProps> = ({
  open, onOpenChange, contract, onSave,
}) => {
  const isEdit = !!contract;

  // Option lists from the backend lookup tables.
  const { paymentTerms: paymentPeriods, paymentMethodsFor } = useLookups();
  const paymentMethods = paymentMethodsFor('contract');
  const [saving, setSaving] = useState(false);

  // Units loaded from API when property changes
  const [propertyUnits, setPropertyUnits] = useState<Unit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  // The picked property, kept whole rather than looked up from a list — the
  // options endpoint returns a capped page, so the selection is not guaranteed
  // to be in it. Drives the unit selector and the read-only المالك field.
  const [selectedProperty, setSelectedProperty] = useState<PropertyOption | null>(null);

  // The tenant is not chosen here — it is read off the selected property, so all
  // this holds is the resolved client for display (and its `type`, which decides
  // the company document slots).
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(false);

  const [form, setForm] = useState({
    contract_number: '',
    property_id: '', unit_id: '', tenant_id: '',
    start_date: '', end_date: '', total_amount: 0,
    payment_period: 'شهري' as PaymentPeriod,
    payment_method: 'نقدي' as PaymentMethod,
    deposit_amount: undefined as number | undefined,
    notes: '',
  });

  // Document uploads: newly-picked files keyed by slot type, plus the contract's
  // already-persisted documents (edit mode, shown with a replace/delete option).
  const [docFiles, setDocFiles] = useState<RentalContractDocuments>({});
  const [existingDocs, setExistingDocs] = useState<RentalContractDocument[]>([]);

  // Populate form when editing
  useEffect(() => {
    if (contract) {
      setForm({
        contract_number: contract.contract_number || '',
        property_id: contract.property_id,
        unit_id: contract.unit_id || '',
        tenant_id: contract.tenant_id,
        start_date: contract.start_date,
        end_date: contract.end_date,
        total_amount: contract.total_amount,
        payment_period: contract.payment_period,
        payment_method: contract.payment_method,
        deposit_amount: contract.deposit_amount,
        notes: contract.notes || '',
      });
      // Seed the trigger label from the contract itself so it shows immediately;
      // the real `type` arrives from the hydration effect below.
      setSelectedClient({
        id: contract.tenant_id,
        full_name: contract.tenant_name,
        phone: contract.tenant_phone,
        type: 'فرد',
      });
      setExistingDocs(contract.documents ?? []);
    } else {
      setForm({
        contract_number: '',
        property_id: '', unit_id: '', tenant_id: '',
        start_date: '', end_date: '', total_amount: 0,
        payment_period: 'شهري', payment_method: 'نقدي',
        deposit_amount: undefined, notes: '',
      });
      setSelectedClient(null);
      setExistingDocs([]);
    }
    setDocFiles({});
  }, [contract, open]);

  // Hydrate the tenant's real `type` when editing — the contract payload has the
  // name and phone but not the type, and شركة is what decides whether the
  // company-only document slots are required below.
  useEffect(() => {
    const id = contract?.tenant_id;
    if (!open || !id) return;
    let cancelled = false;
    clientsService.options({ include: id, limit: 0 })
      .then(opts => {
        const found = opts.find(o => o.id === id);
        if (found && !cancelled) setSelectedClient(found);
      })
      .catch(() => { /* the seeded name/phone above still render */ });
    return () => { cancelled = true; };
  }, [contract, open]);

  // Hydrate the selected property when editing: the form needs its owner and
  // property_type before the user ever opens the dropdown, and the contract
  // payload carries neither. limit=0 asks for that one row and nothing else.
  useEffect(() => {
    const id = contract?.property_id;
    if (!open || !id) {
      setSelectedProperty(null);
      return;
    }
    let cancelled = false;
    propertiesService.options({ include: id, limit: 0 })
      .then(opts => { if (!cancelled) setSelectedProperty(opts.find(o => o.id === id) ?? null); })
      .catch(() => { /* the field still shows the contract's property name */ });
    return () => { cancelled = true; };
  }, [contract, open]);

  // Load units when a property is selected
  useEffect(() => {
    if (!form.property_id) {
      setPropertyUnits([]);
      return;
    }
    setLoadingUnits(true);
    unitsService.list(form.property_id)
      .then(setPropertyUnits)
      .catch(() => setPropertyUnits([]))
      .finally(() => setLoadingUnits(false));
  }, [form.property_id]);

  /**
   * Backend-searched property options: مؤجر rentals that have no contract yet,
   * capped server-side. `include` keeps the contract's own property in the list
   * even though it is contracted by definition — without it, editing a contract
   * would blank its property field.
   */
  const fetchProperties = useCallback(
    (search: string) => propertiesService.options({
      listing_type: 'إيجار',
      status: 'مؤجر',
      has_contract: false,
      search: search || undefined,
      include: contract?.property_id,
    }),
    [contract],
  );

  const isMultiUnit = selectedProperty?.property_type === 'متعدد الوحدات';

  const updateField = (field: string, value: unknown) => setForm(prev => ({ ...prev, [field]: value }));

  /**
   * Adopt the tenant recorded on the picked property — the only way this form
   * gets a tenant. The property payload carries only the id, so the client is
   * fetched for its name, phone, and `type`, the last of which drives the
   * company document slots below. A property with no tenant clears the field,
   * which blocks saving: fix it on the property itself.
   */
  const adoptPropertyTenant = async (tenantId?: string) => {
    updateField('tenant_id', tenantId ?? '');
    setSelectedClient(null);
    if (!tenantId) return;
    setLoadingTenant(true);
    try {
      const opts = await clientsService.options({ include: tenantId, limit: 0 });
      const found = opts.find(o => o.id === tenantId);
      if (found) setSelectedClient(found);
    } catch {
      // The id is already on the form, so the contract still saves against the
      // right client — only the display name is missing.
    } finally {
      setLoadingTenant(false);
    }
  };

  // ── Documents ──────────────────────────────────────────────────────────────
  const isCompany = selectedClient?.type === 'شركة';

  const existingByType = useMemo(() => {
    const map: Partial<Record<RentalDocumentType, RentalContractDocument>> = {};
    existingDocs.forEach(d => { map[d.type] = d; });
    return map;
  }, [existingDocs]);

  // Company-only slots appear when the tenant is a company, or when the contract
  // already has a document of that type (so it stays visible/editable on edit).
  const visibleSlots = RENTAL_DOCUMENT_SLOTS.filter(
    s => !s.companyOnly || isCompany || existingByType[s.type],
  );

  const pickDoc = (type: RentalDocumentType, file?: File) =>
    setDocFiles(prev => {
      const next = { ...prev };
      if (file) next[type] = file; else delete next[type];
      return next;
    });

  const handleDeleteDoc = async (doc: RentalContractDocument) => {
    if (!contract) return;
    try {
      await rentalContractsService.removeDocument(contract.id, doc.id);
      setExistingDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success('تم حذف المستند');
    } catch {
      toast.error('فشل حذف المستند');
    }
  };

  // Every visible slot must be satisfied: a newly-picked file always counts; when
  // editing, an already-persisted document counts too.
  const docsComplete = visibleSlots.every(s => docFiles[s.type] || (isEdit && existingByType[s.type]));

  const canSave = !!(form.property_id && form.tenant_id && form.start_date && form.end_date && form.total_amount > 0 && docsComplete);

  const buildFormData = (asDraft: boolean): RentalContractFormData => ({
    // Empty → backend auto-generates a unique RC-YYYY-NNNN number.
    contract_number: form.contract_number.trim() || undefined,
    property_id: form.property_id,
    unit_id: form.unit_id || null,
    tenant_id: form.tenant_id,
    start_date: form.start_date,
    end_date: form.end_date,
    total_amount: form.total_amount,
    payment_period: form.payment_period,
    payment_method: form.payment_method,
    deposit_amount: form.deposit_amount ?? null,
    notes: form.notes || undefined,
    status: asDraft ? 'مسودة' : 'نشط',
  });

  const handleSubmit = async (asDraft: boolean) => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave(buildFormData(asDraft), asDraft, docFiles);
      onOpenChange(false);
    } catch {
      // error toast is shown by the parent page; drawer stays open
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:w-[520px] p-0 h-dvh flex flex-col gap-0">
          <SheetHeader className="p-6 pb-0 shrink-0">
            <SheetTitle>{isEdit ? 'تعديل عقد إيجار' : 'إضافة عقد إيجار'}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0 px-6 py-4">
            <div className="space-y-4">
              {/* Section 1: بيانات العقار */}
              <h4 className="font-bold text-sm text-primary">بيانات العقار</h4>
              <div>
                <Label>العقار *</Label>
                <AsyncSearchableSelect
                  value={form.property_id}
                  onSelect={p => {
                    setSelectedProperty(p);
                    updateField('property_id', p.id);
                    updateField('unit_id', '');
                    adoptPropertyTenant(p.tenant_id);
                  }}
                  fetchOptions={fetchProperties}
                  optionValue={p => p.id}
                  optionLabel={propertyOptionLabel}
                  // Before the dropdown is opened there are no options to look the
                  // label up in; on edit the contract's own name stands in.
                  selectedLabel={selectedProperty ? propertyOptionLabel(selectedProperty) : contract?.property_name}
                  placeholder="اختر العقار"
                  searchPlaceholder="بحث عن عقار..."
                  emptyText="لا توجد عقارات"
                />
              </div>
              {isMultiUnit && (
                <div>
                  <Label>الوحدة {loadingUnits && <Loader2 className="inline animate-spin ms-1" size={12} />}</Label>
                  <SearchableSelect
                    value={form.unit_id}
                    onValueChange={v => updateField('unit_id', v)}
                    options={propertyUnits.map(u => ({ value: u.id, label: u.unit_type ? `${u.unit_number} — ${u.unit_type}` : u.unit_number }))}
                    placeholder="اختر الوحدة"
                    searchPlaceholder="بحث عن وحدة..."
                    emptyText="لا توجد وحدات"
                    disabled={loadingUnits}
                  />
                </div>
              )}
              <div>
                <Label>المالك</Label>
                <Input value={selectedProperty?.owner_name || ''} readOnly className="bg-muted" />
              </div>

              <Separator />

              {/* Section 2: بيانات المستأجر */}
              <h4 className="font-bold text-sm text-primary">بيانات المستأجر</h4>
              {/* Read-only: the tenant comes from the property record, so there is
                  nothing to pick here. Change it on the property itself. */}
              <div>
                <Label>المستأجر *</Label>
                <Input
                  value={selectedClient?.full_name ?? ''}
                  readOnly
                  className="bg-muted"
                  placeholder={form.property_id ? 'لا يوجد مستأجر مسجل على هذا العقار' : 'اختر العقار أولاً'}
                />
                {loadingTenant && (
                  <p className="mt-1 flex items-center text-xs text-muted-foreground">
                    <Loader2 className="me-1 h-3 w-3 animate-spin" /> جاري تحميل بيانات المستأجر...
                  </p>
                )}
              </div>
              {selectedClient && (
                <div>
                  <Label>رقم الهاتف</Label>
                  <Input value={selectedClient.phone} readOnly className="bg-muted" dir="ltr" />
                </div>
              )}

              <Separator />

              {/* Section 3: بيانات العقد */}
              <h4 className="font-bold text-sm text-primary">بيانات العقد</h4>
              <div>
                <Label>رقم العقد</Label>
                <Input
                  value={form.contract_number}
                  onChange={e => updateField('contract_number', e.target.value)}
                  placeholder="اتركه فارغاً للتوليد التلقائي"
                />
                <p className="mt-1 text-xs text-muted-foreground">اتركه فارغاً وسيتم توليد رقم فريد تلقائياً.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>تاريخ البدء *</Label>
                  <Input type="date" value={form.start_date} onChange={e => updateField('start_date', e.target.value)} />
                </div>
                <div>
                  <Label>تاريخ الانتهاء *</Label>
                  <Input type="date" value={form.end_date} onChange={e => updateField('end_date', e.target.value)} />
                </div>
              </div>
              <div>
                <Label>المبلغ الإجمالي *</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={form.total_amount || ''} onChange={e => updateField('total_amount', Number(e.target.value))} />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">د.ك</span>
                </div>
              </div>
              <div>
                <Label>فترة السداد *</Label>
                <Select value={form.payment_period} onValueChange={v => updateField('payment_period', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentPeriods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>طريقة السداد *</Label>
                <Select value={form.payment_method} onValueChange={v => updateField('payment_method', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>التأمين (عربون)</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={form.deposit_amount || ''} onChange={e => updateField('deposit_amount', e.target.value ? Number(e.target.value) : undefined)} />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">د.ك</span>
                </div>
              </div>
              <div>
                <Label>الملاحظات</Label>
                <Textarea value={form.notes} onChange={e => updateField('notes', e.target.value)} rows={3} />
              </div>

              <Separator />

              {/* Section 4: المستندات */}
              <h4 className="font-bold text-sm text-primary">المستندات</h4>
              {!form.tenant_id && (
                <p className="text-xs text-muted-foreground">اختر المستأجر أولاً لتحديد المستندات المطلوبة.</p>
              )}
              {isCompany && (
                <p className="text-xs text-muted-foreground">المستأجر شركة — يلزم إرفاق مستندات إضافية.</p>
              )}
              {visibleSlots.map(slot => {
                const picked = docFiles[slot.type];
                const existing = existingByType[slot.type];
                const required = !slot.companyOnly || isCompany;
                return (
                  <div key={slot.type} className="space-y-1.5">
                    <Label>
                      {slot.label}
                      {required && <span className="text-destructive"> *</span>}
                    </Label>

                    {/* Existing persisted document (edit mode) — replaceable/removable */}
                    {existing && !picked && (
                      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                        <a
                          href={existing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary truncate"
                        >
                          <FileText size={16} className="shrink-0" />
                          <span className="truncate">{existing.file_name}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteDoc(existing)}
                          className="text-destructive hover:text-destructive/80 shrink-0"
                          aria-label="حذف المستند"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                      <Upload size={16} className="shrink-0" />
                      <span className="truncate">
                        {picked ? picked.name : existing ? 'استبدال الملف' : 'انقر لاختيار ملف'}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,application/pdf"
                        onChange={e => pickDoc(slot.type, e.target.files?.[0])}
                      />
                    </label>
                    {picked && (
                      <button
                        type="button"
                        onClick={() => pickDoc(slot.type, undefined)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        إلغاء الملف المختار
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="shrink-0 flex items-center gap-3 p-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t">
            <Button onClick={() => handleSubmit(false)} disabled={!canSave || saving}>
              {saving ? <Loader2 className="animate-spin me-1" size={16} /> : null}
              حفظ العقد
            </Button>
           {/* <Button
              variant="outline"
              className="border-amber-500 text-amber-600 hover:bg-amber-50"
              onClick={() => handleSubmit(true)}
              disabled={!canSave || saving}
            >
              حفظ كمسودة
            </Button> */}
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default RentalContractFormDrawer;
