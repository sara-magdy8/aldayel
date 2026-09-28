import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Client, ClientRequest, Collection, Property } from '@/types';

const statusColors: Record<string, string> = {
  'نشط': 'bg-green-100 text-green-800',
  'غير نشط': 'bg-gray-100 text-gray-800',
};

const requestStatusColors: Record<string, string> = {
  'جديد': 'bg-blue-100 text-blue-800',
  'قيد المتابعة': 'bg-amber-100 text-amber-800',
  'مكتمل': 'bg-green-100 text-green-800',
};

const InfoRow = ({ label, value }: { label: string; value?: string | number | null }) => {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
};

interface ClientViewDrawerProps {
  client: Client | null;
  onClose: () => void;
  /** Pass mock / static lists — used only when preloadedProperties is absent. */
  properties?: Property[];
  /** Pass mock / static lists — used only when preloadedRequests is absent. */
  requests?: ClientRequest[];
  /** Pre-filtered properties from the API show endpoint — skips local filter. */
  preloadedProperties?: Record<string, unknown>[];
  /** Pre-filtered requests from the API show endpoint — skips local filter. */
  preloadedRequests?: Record<string, unknown>[];
  /** Pass mock / static lists — used only when preloadedCollections is absent. */
  collections?: Collection[];
  /** Pre-filtered collections from the API show endpoint — skips local filter. */
  preloadedCollections?: Collection[];
}

const ClientViewDrawer: React.FC<ClientViewDrawerProps> = ({
  client,
  onClose,
  properties = [],
  requests = [],
  preloadedProperties,
  preloadedRequests,
  collections = [],
  preloadedCollections,
}) => {
  if (!client) return null;

  const linkedProperties = preloadedProperties
    ? (preloadedProperties as unknown as Property[])
    : properties.filter(p => p.owner_name === client.full_name);

  const linkedRequests = preloadedRequests
    ? (preloadedRequests as unknown as ClientRequest[])
    : requests.filter(r => r.client_id === client.id);

  const linkedCollections = preloadedCollections
    ?? collections.filter(c => c.client_id === client.id);

  const collectionsTotal = linkedCollections.reduce((sum, c) => sum + Number(c.amount || 0), 0);

  return (
    <Sheet open={!!client} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[520px] p-0 h-dvh flex flex-col gap-0">
        <SheetHeader className="p-6 pb-0 shrink-0">
          <SheetTitle className="flex items-center gap-3">
            {client.full_name}
            <Badge variant="secondary" className={statusColors[client.status]}>{client.status}</Badge>
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="space-y-1">
            <InfoRow label="رقم الهاتف" value={client.phone} />
            <InfoRow label="البريد الإلكتروني" value={client.email} />
            <InfoRow label="نوع العميل" value={client.type} />
            <InfoRow label="اسم ممثل الشركة" value={client.company_rep_name} />
            <InfoRow label="رقم هاتف الممثل" value={client.company_rep_phone} />
            <InfoRow label="الحالة" value={client.status} />
            <InfoRow label="الملاحظات" value={client.notes} />
            <InfoRow label="تاريخ الإضافة" value={client.created_at} />
          </div>

          <Separator className="my-4" />
          <h4 className="font-bold text-sm mb-3">العقارات المرتبطة ({linkedProperties.length})</h4>
          {linkedProperties.length > 0 ? (
            <div className="grid gap-2">
              {linkedProperties.map(p => (
                <div key={p.id} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{p.name}</span>
                    <span className="text-muted-foreground text-xs mr-2">{p.category} — {p.address}</span>
                  </div>
                  <Badge variant="secondary" className={p.status === 'متاح' ? 'bg-green-100 text-green-800' : p.status === 'محجوز' ? 'bg-amber-100 text-amber-800' : p.status === 'مؤجر' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}>{p.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد عقارات مرتبطة</p>
          )}

          <Separator className="my-4" />
          <h4 className="font-bold text-sm mb-3">الطلبات المرتبطة ({linkedRequests.length})</h4>
          {linkedRequests.length > 0 ? (
            <div className="grid gap-2">
              {linkedRequests.map(r => (
                <div key={r.id} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{r.request_type} — {r.category}</span>
                    {(r.governorate || r.area_name) && <span className="text-muted-foreground text-xs mr-2">{[r.governorate, r.area_name].filter(Boolean).join(' - ')}</span>}
                  </div>
                  <Badge variant="secondary" className={requestStatusColors[r.status]}>{r.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد طلبات مرتبطة</p>
          )}

          <Separator className="my-4" />
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-sm">التحصيلات المرتبطة ({linkedCollections.length})</h4>
            {linkedCollections.length > 0 && (
              <span className="text-sm font-medium text-green-700">{collectionsTotal.toLocaleString()} د.ك</span>
            )}
          </div>
          {linkedCollections.length > 0 ? (
            <div className="grid gap-2">
              {linkedCollections.map(c => (
                <div key={c.id} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{c.collection_number} — {c.collection_type}</span>&nbsp;&nbsp;
                    <span className="text-muted-foreground text-xs mr-2">{[c.property_name, c.payment_method, c.payment_date].filter(Boolean).join(' - ')}</span>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800 text-center">{Number(c.amount || 0).toLocaleString()} د.ك</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد تحصيلات مرتبطة</p>
          )}
          <div className="h-6" />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default ClientViewDrawer;
