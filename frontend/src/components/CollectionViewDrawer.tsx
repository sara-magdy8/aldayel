import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FileText } from 'lucide-react';
import { Collection } from '@/types';
import { exportInvoicePDF } from '@/lib/invoicePdf';

const typeColors: Record<string, string> = {
  'عمولة': 'bg-purple-100 text-purple-800',
  'إيجار (دفعة دورية)': 'bg-blue-100 text-blue-800',
  'عربون': 'bg-amber-100 text-amber-800',
  'دفعة نقدية': 'bg-green-100 text-green-800',
  'أخرى': 'bg-gray-100 text-gray-800',
};

// Attachments are stored as bare URLs; infer "is image" from the URL extension.
const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);
const fileNameFromUrl = (url: string) => {
  try {
    return decodeURIComponent(url.split('?')[0].split('/').pop() || 'مرفق');
  } catch {
    return 'مرفق';
  }
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

interface Props {
  collection: Collection | null;
  onClose: () => void;
  onCreateInvoice?: (collection: Collection) => void;
}

const CollectionViewDrawer: React.FC<Props> = ({ collection, onClose, onCreateInvoice }) => {
  if (!collection) return null;

  const handleExportOrCreate = () => {
    if (!collection.has_invoice && onCreateInvoice) {
      onCreateInvoice(collection);
    }
    exportInvoicePDF(collection);
  };

  return (
    <Sheet open={!!collection} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[520px] p-0 h-dvh flex flex-col gap-0">
        <SheetHeader className="p-6 pb-0 shrink-0">
          <SheetTitle className="flex items-center gap-3">
            {collection.collection_number}
            <Badge variant="secondary" className={typeColors[collection.collection_type]}>{collection.collection_type}</Badge>
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <h4 className="font-bold text-sm mb-2 text-primary">بيانات العميل</h4>
          <InfoRow label="الاسم" value={collection.client_name} />
          <InfoRow label="الهاتف" value={collection.client_phone} />

          <Separator className="my-4" />
          <h4 className="font-bold text-sm mb-2 text-primary">بيانات العقار</h4>
          <InfoRow label="العقار" value={collection.property_name || '—'} />
          {collection.unit_number && <InfoRow label="الوحدة" value={collection.unit_number} />}

          <Separator className="my-4" />
          <h4 className="font-bold text-sm mb-2 text-primary">بيانات الدفع</h4>
          <InfoRow label="المبلغ" value={`${collection.amount.toLocaleString()} د.ك`} />
          <InfoRow label="تاريخ الدفع" value={collection.payment_date?.slice(0, 10)} />
          <InfoRow label="طريقة الدفع" value={collection.payment_method} />
          <InfoRow label="المستفيد" value={collection.beneficiary} />
          <InfoRow label="الوسيط" value={collection.broker} />

          {collection.payment_method === 'شيك' && (
            <>
              <Separator className="my-4" />
              <h4 className="font-bold text-sm mb-2 text-primary">تفاصيل الشيك</h4>
              <InfoRow label="رقم الشيك" value={collection.check_number} />
              <InfoRow label="اسم البنك" value={collection.check_bank} />
              <InfoRow label="تاريخ الشيك" value={collection.check_date} />
            </>
          )}

          {collection.payment_method === 'تحويل بنكي' && (
            <>
              <Separator className="my-4" />
              <h4 className="font-bold text-sm mb-2 text-primary">تفاصيل التحويل</h4>
              <InfoRow label="اسم البنك" value={collection.transfer_bank} />
              <InfoRow label="رقم العملية" value={collection.transfer_transaction_number} />
              <InfoRow label="تاريخ التحويل" value={collection.transfer_date} />
            </>
          )}

          {collection.payment_method === 'بطاقة ائتمان' && (
            <>
              <Separator className="my-4" />
              <h4 className="font-bold text-sm mb-2 text-primary">تفاصيل البطاقة</h4>
              <InfoRow label="نوع البطاقة" value={collection.card_type} />
              <InfoRow label="رقم العملية" value={collection.card_transaction_number} />
              <InfoRow label="آخر 4 أرقام" value={collection.card_last4} />
            </>
          )}

          <Separator className="my-4" />
          <InfoRow label="الملاحظات" value={collection.notes} />

          {collection.attachments && collection.attachments.length > 0 && (
            <>
              <Separator className="my-4" />
              <h4 className="font-bold text-sm mb-2 text-primary">المرفقات</h4>
              <div className="grid grid-cols-3 gap-2">
                {collection.attachments.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square rounded-lg overflow-hidden border block hover:opacity-90 transition-opacity"
                    title={fileNameFromUrl(url)}
                  >
                    {isImageUrl(url) ? (
                      <img src={url} alt={fileNameFromUrl(url)} className="w-full h-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground">
                        <FileText size={20} />
                        <span className="w-full truncate text-[10px]">{fileNameFromUrl(url)}</span>
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </>
          )}

          <Separator className="my-4" />
          <h4 className="font-bold text-sm mb-2 text-primary">حالة الفاتورة</h4>
          <div className="py-2">
            {collection.has_invoice ? (
              <Badge className="bg-green-100 text-green-800">✅ صادرة — {collection.invoice_number}</Badge>
            ) : (
              <Badge variant="secondary" className="bg-gray-100 text-gray-600">لم تصدر بعد</Badge>
            )}
          </div>

          <div className="mt-6">
            <Button variant="outline" className="w-full gap-2" onClick={handleExportOrCreate}>
              <FileText size={16} />
              {collection.has_invoice ? 'تصدير الفاتورة PDF' : 'إنشاء فاتورة وتصدير'}
            </Button>
          </div>
          <div className="h-6" />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default CollectionViewDrawer;
