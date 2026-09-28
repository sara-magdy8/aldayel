import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Copy, MapPin, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Property } from '@/types';
import { propertiesService, PropertyAttachmentDto } from '@/services/properties';
import { mockUnits } from '@/data/mockProperties';
import { formatDateTime } from '@/lib/utils';

const isImage = (mime: string) => mime.startsWith('image/');

const statusColors: Record<string, string> = {
  'متاح': 'bg-green-100 text-green-800',
  'محجوز': 'bg-amber-100 text-amber-800',
  'مؤجر': 'bg-blue-100 text-blue-800',
  'مباع': 'bg-gray-100 text-gray-800',
};

const unitStatusColors: Record<string, string> = {
  'متاح': 'bg-green-100 text-green-800',
  'محجوز': 'bg-amber-100 text-amber-800',
  'مؤجر': 'bg-blue-100 text-blue-800',
  'مباع': 'bg-gray-100 text-gray-800',
};

interface PropertyViewDrawerProps {
  property: Property | null;
  onClose: () => void;
  onUpdate: (property: Property) => void;
}

const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
};

const LinkRow = ({ label, href }: { label: string; href?: string | null }) => {
  if (!href) return null;
  return (
    <div className="flex justify-between py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary text-sm truncate max-w-[60%]">
        فتح الرابط
      </a>
    </div>
  );
};

const PropertyViewDrawer: React.FC<PropertyViewDrawerProps> = ({ property, onClose, onUpdate }) => {
  const [attachments, setAttachments] = useState<PropertyAttachmentDto[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  // Load the property's persisted attachments (with urls/names) when it opens.
  useEffect(() => {
    if (!property) { setAttachments([]); return; }
    let cancelled = false;
    setAttachmentsLoading(true);
    (async () => {
      try {
        const list = await propertiesService.getAttachments(property.id);
        if (!cancelled) setAttachments(list);
      } catch {
        if (!cancelled) setAttachments([]);
      } finally {
        if (!cancelled) setAttachmentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [property?.id]);

  if (!property) return null;

  const isRental = property.listing_type === 'إيجار';
  const units = mockUnits.filter(u => u.property_id === property.id);
  const publicUrl = `${window.location.origin}/view/${property.public_link_token}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success('تم نسخ الرابط');
  };

  const togglePublicLink = (enabled: boolean) => {
    onUpdate({ ...property, public_link_enabled: enabled });
  };

  const toggleOption = (field: 'public_show_price' | 'public_show_location' | 'public_show_contact', checked: boolean) => {
    onUpdate({ ...property, [field]: checked });
  };

  return (
    <Sheet open={!!property} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[520px] p-0 h-dvh flex flex-col gap-0">
        <SheetHeader className="p-6 pb-0 shrink-0">
          <SheetTitle className="flex items-center gap-3">
            {property.name}
            <Badge variant="secondary" className={statusColors[property.status]}>{property.status}</Badge>
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="space-y-1">
            <InfoRow label="نوع العقار" value={property.property_type} />
            <InfoRow label="التصنيف" value={property.category} />
            <InfoRow label="تم التصوير من قبل" value={property.filmed_by} />
            {!isRental && <InfoRow label="حالة البناء" value={property.building_status} />}
            <InfoRow label="الأولوية" value={property.priority ? 'نعم' : 'لا'} />
            <InfoRow label={isRental ? 'النشاط' : 'حالة الاشغال' } value={property.activity} />
            <InfoRow label="نوع العرض" value={property.listing_type} />
            <InfoRow label="اسم المالك" value={property.owner_name} />
            <InfoRow label="رقم القسيمة" value={property.plot_number} />
            <InfoRow label="العنوان" value={property.address} />
            <InfoRow label="المساحة" value={property.area ? `${property.area} م²` : undefined} />
            {isRental && <InfoRow label="مبلغ الإيجار" value={property.rent_amount ? `${property.rent_amount} د.ك` : undefined} />}
            {!isRental && <InfoRow label="السعر" value={property.price ? `${property.price.toLocaleString()} د.ك` : undefined} />}
            <InfoRow label="المواصفات" value={property.description} />
            <InfoRow label="الشروط" value={property.conditions} />
            {isRental && <InfoRow label="فترة السماح" value={property.grace_period} />}
            <InfoRow label="اسم الحارس" value={property.guard_name} />
            <InfoRow label="رقم الحارس" value={property.guard_phone} />
            <InfoRow label="الوسيط" value={property.broker_name} />
            <InfoRow label="رقم هاتف الوسيط" value={property.broker_phone_num} />
            <InfoRow label="مسؤول العقار" value={property.manager_name} />
            <InfoRow label="رقم هاتف مسؤول العقار" value={property.manager_phone_num} />
            <InfoRow label="العمولة" value={property.commission ? `${property.commission} د.ك` : undefined} />
             <InfoRow label="تاريخ الإضافة" value={formatDateTime(property.created_at)} />
            <InfoRow label="الملاحظات" value={property.notes} />
            {property.location_link && (
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground text-sm">الموقع</span>
                <a href={property.location_link} target="_blank" rel="noopener noreferrer" className="text-primary text-sm flex items-center gap-1">
                  <MapPin size={14} /> عرض على الخريطة
                </a>
              </div>
            )}
          </div>

          {/* Marketing info — always shown, since حالة التسويق is a stored flag. */}
          <>
            <Separator className="my-4" />
            <h4 className="font-bold text-sm mb-2">بيانات التسويق</h4>
            <div className="space-y-2">
              <InfoRow label="حالة التسويق" value={property.marketing_status ? 'تم' : 'لم يتم'} />
              <LinkRow label="رابط فورسيل " href={property.forsale_link} />
              <LinkRow label="رابط انستقرام" href={property.instagram_link} />
              <LinkRow label="رابط واتساب" href={property.whatsapp_link} />
            </div>
          </>

          {/* Tenant info */}
          {isRental && property.status === 'مؤجر' && (
            <>
              <Separator className="my-4" />
              <h4 className="font-bold text-sm mb-2">معلومات المستأجر</h4>
              <InfoRow label="اسم المستأجر" value={property.tenant_name} />
              <InfoRow label="تاريخ البداية" value={property.tenant_start} />
              <InfoRow label="تاريخ الانتهاء" value={property.tenant_end} />
            </>
          )}

          {/* Sale info */}
          {!isRental && property.status === 'مباع' && (
            <>
              <Separator className="my-4" />
              {/* The buyer rides on the same client link as the tenant — see the
                  form drawer's مباع block. */}
              <InfoRow label="اسم المشتري" value={property.tenant_name} />
              <InfoRow label="تاريخ البيع" value={property.sale_date} />
            </>
          )}

          {/* Units section */}
          {property.property_type === 'متعدد الوحدات' && units.length > 0 && (
            <>
              <Separator className="my-4" />
              <h4 className="font-bold text-sm mb-3">الوحدات ({units.length})</h4>
              <div className="grid gap-2">
                {units.map(u => (
                  <div key={u.id} className="border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm">{u.unit_number}</span>
                      <span className="text-muted-foreground text-xs mr-2">{u.unit_type || u.activity || '-'} — {u.floor}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{u.price} د.ك</span>
                      <Badge variant="secondary" className={unitStatusColors[u.status] || ''}>{u.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Attachments */}
          {(attachmentsLoading || attachments.length > 0) && (
            <>
              <Separator className="my-4" />
              <h4 className="font-bold text-sm mb-3">المرفقات{attachments.length > 0 ? ` (${attachments.length})` : ''}</h4>
              {attachmentsLoading ? (
                <div className="py-3 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto" size={18} /></div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {attachments.map(att => (
                    <a
                      key={att.id}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative aspect-square rounded-lg overflow-hidden border block"
                      title={att.file_name}
                    >
                      {isImage(att.file_type) ? (
                        <img src={att.url} alt={att.file_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground hover:bg-muted/50">
                          <FileText size={20} />
                          <span className="w-full truncate text-[10px]">{att.file_name}</span>
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Public link settings */}
          <Separator className="my-4" />
          <h4 className="font-bold text-sm mb-3">إعدادات رابط المشاهدة</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>تفعيل الرابط</Label>
              <Switch checked={property.public_link_enabled} onCheckedChange={togglePublicLink} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={property.public_show_price} onCheckedChange={(c) => toggleOption('public_show_price', !!c)} id="show-price" />
              <Label htmlFor="show-price" className="cursor-pointer">عرض السعر</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={property.public_show_location} onCheckedChange={(c) => toggleOption('public_show_location', !!c)} id="show-loc" />
              <Label htmlFor="show-loc" className="cursor-pointer">عرض الموقع بدقة</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={property.public_show_contact} onCheckedChange={(c) => toggleOption('public_show_contact', !!c)} id="show-contact" />
              <Label htmlFor="show-contact" className="cursor-pointer">عرض رقم التواصل</Label>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">الرابط</Label>
              <div className="flex gap-2 mt-1">
                <Input value={publicUrl} readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={handleCopyLink}><Copy size={16} /></Button>
              </div>
            </div>
          </div>
          <div className="h-6" />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default PropertyViewDrawer;
