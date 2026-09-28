import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Phone, User } from 'lucide-react';
import { ClientRequest } from '@/types';

const statusColors: Record<string, string> = {
  'جديد': 'bg-blue-100 text-blue-800',
  'قيد المتابعة': 'bg-amber-100 text-amber-800',
  'مكتمل': 'bg-green-100 text-green-800',
};

const requestTypeColors: Record<string, string> = {
  'شراء': 'bg-purple-100 text-purple-800',
  'إيجار': 'bg-blue-100 text-blue-800',
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

interface RequestViewDrawerProps {
  request: ClientRequest | null;
  onClose: () => void;
}

const RequestViewDrawer: React.FC<RequestViewDrawerProps> = ({ request, onClose }) => {
  if (!request) return null;

  return (
    <Sheet open={!!request} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[520px] p-0 h-dvh flex flex-col gap-0">
        <SheetHeader className="p-6 pb-0 shrink-0">
          <SheetTitle>تفاصيل الطلب</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {/* Client card */}
          <div className="border rounded-lg p-4 mb-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-muted">
              <User size={20} className="text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">{request.client_name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1" dir="ltr">
                <Phone size={12} /> {request.client_phone}
              </p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-center mb-4">
            <Badge variant="secondary" className={`text-base px-4 py-1 ${statusColors[request.status]}`}>{request.status}</Badge>
          </div>

          <div className="space-y-1">
            <InfoRow label="نوع الطلب" value={request.request_type} />
            <InfoRow label="التصنيف" value={request.category} />
            <InfoRow label="النشاط" value={request.activity} />
            <InfoRow label="المحافظة" value={request.governorate} />
            <InfoRow label="المنطقة" value={request.area_name} />
            <InfoRow label="المساحة" value={request.area ? `${request.area} م²` : undefined} />
            <InfoRow label="السعر" value={request.price != null ? `${request.price} د.ك` : undefined} />
            <InfoRow label="الوسيط" value={request.broker_name} />
            <InfoRow label="رقم هاتف الوسيط" value={request.broker_phone_num} />
            <InfoRow label="الملاحظات" value={request.notes} />
            <InfoRow label="تاريخ الطلب" value={request.created_at} />
          </div>
          <div className="h-6" />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default RequestViewDrawer;
