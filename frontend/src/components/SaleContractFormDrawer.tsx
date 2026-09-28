import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, FileText, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
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
import { SaleContract, SaleContractDocument, SaleDocumentType, PaymentMethod, Unit } from '@/types';
import { useLookups } from '@/contexts/LookupsContext';
import { SaleContractDocuments, SALE_DOCUMENT_SLOTS, saleContractsService } from '@/services/saleContracts';
import { unitsService } from '@/services/units';
import { clientsService, ClientOption } from '@/services/clients';
import { propertiesService, PropertyOption, propertyOptionLabel } from '@/services/properties';

interface SaleContractFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: SaleContract | null;
  onSave: (contract: SaleContract, asDraft: boolean, documents: SaleContractDocuments) => Promise<void>;
}

const SaleContractFormDrawer: React.FC<SaleContractFormDrawerProps> = ({
  open, onOpenChange, contract, onSave,
}) => {
  const isEdit = !!contract;

  // Payment methods from the backend lookup table (contract subset).
  const { paymentMethodsFor } = useLookups();
  const paymentMethods = paymentMethodsFor('contract');
  const [saving, setSaving] = useState(false);

  // ── Units: lazy-loaded when property is selected ────────────────────────
  const [units, setUnits] = useState<Unit[]>([]);

  // The picked property, kept whole rather than looked up from a list — the
  // options endpoint returns a capped page, so the selection is not guaranteed
  // to be in it. Drives the unit selector, المالك, and the saved payload.
  const [selectedProperty, setSelectedProperty] = useState<PropertyOption | null>(null);

  // The buyer is not chosen here — it is read off the selected property, so all
  // this holds is the resolved client for display (and its `type`, which decides
  // the company document slots).
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [loadingBuyer, setLoadingBuyer]     = useState(false);

  const [form, setForm] = useState({
    contract_number: '',
    property_id: '', unit_id: '', buyer_id: '',
    contract_date: '', delivery_date: '', total_amount: 0,
    payment_method: 'نقدي' as PaymentMethod,
    down_payment: undefined as number | undefined,
    notes: '',
  });

  // Document uploads: newly-picked files keyed by slot type, plus the contract's
  // already-persisted documents (edit mode, shown with a replace/delete option).
  const [docFiles, setDocFiles] = useState<SaleContractDocuments>({});
  const [existingDocs, setExistingDocs] = useState<SaleContractDocument[]>([]);

  useEffect(() => {
    if (contract) {
      setForm({
        contract_number: contract.contract_number || '',
        property_id: contract.property_id,
        unit_id: contract.unit_id || '',
        buyer_id: contract.buyer_id,
        contract_date: contract.contract_date,
        delivery_date: contract.delivery_date || '',
        total_amount: contract.total_amount,
        payment_method: contract.payment_method,
        down_payment: contract.down_payment,
        notes: contract.notes || '',
      });
      // Seed the trigger label from the contract itself — the buyer will not be
      // in the capped option list until the user searches for them.
      setSelectedClient({
        id: contract.buyer_id,
        full_name: contract.buyer_name,
        phone: contract.buyer_phone,
        type: 'فرد',
      });
      setExistingDocs(contract.documents ?? []);
    } else {
      setForm({
        contract_number: '',
        property_id: '', unit_id: '', buyer_id: '',
        contract_date: '', delivery_date: '', total_amount: 0,
        payment_method: 'نقدي', down_payment: undefined, notes: '',
      });
      setSelectedClient(null);
      setExistingDocs([]);
    }
    setDocFiles({});
  }, [contract, open]);

  // Hydrate the buyer's real `type` when editing — the contract payload has the
  // name and phone but not the type, and شركة is what decides whether the
  // company-only document slots are required below.
  useEffect(() => {
    const id = contract?.buyer_id;
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

  // ── Fetch units when property changes ───────────────────────────────────
  useEffect(() => {
    if (!form.property_id) { setUnits([]); return; }
    unitsService.list(form.property_id).then(setUnits).catch(() => setUnits([]));
  }, [form.property_id]);

  /**
   * Backend-searched property options: مباع sale listings that have no contract
   * yet, capped server-side. `include` keeps the contract's own property in the
   * list even though it is contracted by definition — without it, editing a
   * contract would blank its property field.
   */
  const fetchProperties = useCallback(
    (search: string) => propertiesService.options({
      listing_type: 'بيع',
      status: 'مباع',
      has_contract: false,
      search: search || undefined,
      include: contract?.property_id,
    }),
    [contract],
  );

  const isMultiUnit = selectedProperty?.property_type === 'متعدد الوحدات';

  const updateField = (field: string, value: unknown) => setForm(prev => ({ ...prev, [field]: value }));

  /**
   * Adopt the buyer recorded on the picked property — the only way this form
   * gets a buyer. The property payload carries only the client id (the same
   * `tenant_id` column holds the buyer on a sale listing), so the client is
   * fetched for its name, phone, and `type`, the last of which drives the
   * company document slots below. A property with no buyer clears the field,
   * which blocks saving: fix it on the property itself.
   */
  const adoptPropertyBuyer = async (buyerId?: string) => {
    updateField('buyer_id', buyerId ?? '');
    setSelectedClient(null);
    if (!buyerId) return;
    setLoadingBuyer(true);
    try {
      const opts = await clientsService.options({ include: buyerId, limit: 0 });
      const found = opts.find(o => o.id === buyerId);
      if (found) setSelectedClient(found);
    } catch {
      // The id is already on the form, so the contract still saves against the
      // right client — only the display name is missing.
    } finally {
      setLoadingBuyer(false);
    }
  };

  // ── Documents ──────────────────────────────────────────────────────────────
  const isCompany = selectedClient?.type === 'شركة';

  const existingByType = useMemo(() => {
    const map: Partial<Record<SaleDocumentType, SaleContractDocument>> = {};
    existingDocs.forEach(d => { map[d.type] = d; });
    return map;
  }, [existingDocs]);

  // Company-only slots appear when the buyer is a company, or when the contract
  // already has a document of that type (so it stays visible/editable on edit).
  const visibleSlots = SALE_DOCUMENT_SLOTS.filter(
    s => !s.companyOnly || isCompany || existingByType[s.type],
  );

  const pickDoc = (type: SaleDocumentType, file?: File) =>
    setDocFiles(prev => {
      const next = { ...prev };
      if (file) next[type] = file; else delete next[type];
      return next;
    });

  const handleDeleteDoc = async (doc: SaleContractDocument) => {
    if (!contract) return;
    try {
      await saleContractsService.removeDocument(contract.id, doc.id);
      setExistingDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success('تم حذف المستند');
    } catch {
      toast.error('فشل حذف المستند');
    }
  };

  // Every visible slot must be satisfied: a newly-picked file always counts; when
  // editing, an already-persisted document counts too.
  const docsComplete = visibleSlots.every(s => docFiles[s.type] || (isEdit && existingByType[s.type]));

  const buildContract = (asDraft: boolean): SaleContract => {
    const selectedUnit = units.find(u => u.id === form.unit_id);
    return {
      id: contract?.id || `sc-${Date.now()}`,
      // Empty → backend auto-generates a unique SC-YYYY-NNNN number.
      contract_number: form.contract_number.trim(),
      property_id: form.property_id,
      property_name: selectedProperty?.name || '',
      unit_id: form.unit_id || undefined,
      unit_number: selectedUnit?.unit_number || undefined,
      owner_name: selectedProperty?.owner_name || '',
      buyer_id: form.buyer_id,
      buyer_name: selectedClient?.full_name || '',
      buyer_phone: selectedClient?.phone || '',
      created_at: contract?.created_at || new Date().toISOString().split('T')[0],
      contract_date: form.contract_date,
      delivery_date: form.delivery_date || undefined,
      total_amount: form.total_amount,
      payment_method: form.payment_method,
      down_payment: form.down_payment,
      notes: form.notes || undefined,
      status: asDraft ? 'مسودة' : 'نشط',
    };
  };

  const canSave = !!(form.property_id && form.buyer_id && form.contract_date && form.total_amount > 0 && docsComplete);

  const handleSaveClick = async (asDraft: boolean) => {
    setSaving(true);
    try {
      await onSave(buildContract(asDraft), asDraft, docFiles);
      onOpenChange(false);
    } catch {
      // error handled + toasted by the caller; keep drawer open
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:w-[520px] p-0 h-dvh flex flex-col gap-0">
          <SheetHeader className="p-6 pb-0 shrink-0">
            <SheetTitle>{isEdit ? 'تعديل عقد بيع' : 'إضافة عقد بيع'}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0 px-6 py-4">
            <div className="space-y-4">
              <h4 className="font-bold text-sm text-primary">بيانات العقار</h4>
              <div>
                <Label>العقار *</Label>
                <AsyncSearchableSelect
                  value={form.property_id}
                  onSelect={p => {
                    setSelectedProperty(p);
                    updateField('property_id', p.id);
                    updateField('unit_id', '');
                    adoptPropertyBuyer(p.tenant_id);
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
                  <Label>الوحدة</Label>
                  <SearchableSelect
                    value={form.unit_id}
                    onValueChange={v => updateField('unit_id', v)}
                    options={units.map(u => ({ value: u.id, label: u.unit_type ? `${u.unit_number} — ${u.unit_type}` : u.unit_number }))}
                    placeholder="اختر الوحدة"
                    searchPlaceholder="بحث عن وحدة..."
                    emptyText="لا توجد وحدات"
                  />
                </div>
              )}
              <div>
                <Label>المالك</Label>
                <Input value={selectedProperty?.owner_name || ''} readOnly className="bg-muted" />
              </div>

              <Separator />

              <h4 className="font-bold text-sm text-primary">بيانات المشتري</h4>
              {/* Read-only: the buyer comes from the property record, so there is
                  nothing to pick here. Change it on the property itself. */}
              <div>
                <Label>المشتري *</Label>
                <Input
                  value={selectedClient?.full_name ?? ''}
                  readOnly
                  className="bg-muted"
                  placeholder={form.property_id ? 'لا يوجد مشترٍ مسجل على هذا العقار' : 'اختر العقار أولاً'}
                />
                {loadingBuyer && (
                  <p className="mt-1 flex items-center text-xs text-muted-foreground">
                    <Loader2 className="me-1 h-3 w-3 animate-spin" /> جاري تحميل بيانات المشتري...
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
                  <Label>تاريخ العقد *</Label>
                  <Input type="date" value={form.contract_date} onChange={e => updateField('contract_date', e.target.value)} />
                </div>
                <div>
                  <Label>تاريخ التسليم</Label>
                  <Input type="date" value={form.delivery_date} onChange={e => updateField('delivery_date', e.target.value)} />
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
                <Label>طريقة السداد *</Label>
                <Select value={form.payment_method} onValueChange={v => updateField('payment_method', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الدفعة المقدمة (عربون)</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" value={form.down_payment || ''} onChange={e => updateField('down_payment', e.target.value ? Number(e.target.value) : undefined)} />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">د.ك</span>
                </div>
              </div>
              <div>
                <Label>الملاحظات</Label>
                <Textarea value={form.notes} onChange={e => updateField('notes', e.target.value)} rows={3} />
              </div>

              <Separator />

              {/* المستندات */}
              <h4 className="font-bold text-sm text-primary">المستندات</h4>
              {!form.buyer_id && (
                <p className="text-xs text-muted-foreground">اختر المشتري أولاً لتحديد المستندات المطلوبة.</p>
              )}
              {isCompany && (
                <p className="text-xs text-muted-foreground">المشتري شركة — يلزم إرفاق مستندات إضافية.</p>
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
            <Button onClick={() => handleSaveClick(false)} disabled={!canSave || saving}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : 'حفظ العقد'}
            </Button>
          {/*  <Button variant="outline" className="border-amber-500 text-amber-600 hover:bg-amber-50" onClick={() => handleSaveClick(true)} disabled={!canSave || saving}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : 'حفظ كمسودة'}
            </Button> */}
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default SaleContractFormDrawer;
