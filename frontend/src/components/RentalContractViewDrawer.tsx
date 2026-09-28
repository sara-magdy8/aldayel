import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FileText } from 'lucide-react';
import { RentalContract, RentalDocumentType } from '@/types';
import { RENTAL_DOCUMENT_SLOTS } from '@/services/rentalContracts';
import { exportRentalContractPDF } from '@/lib/contractPdf';

const statusColors: Record<string, string> = {
  'مسودة': 'bg-amber-100 text-amber-800',
  'نشط': 'bg-green-100 text-green-800',
  'منتهي': 'bg-gray-100 text-gray-800',
  'ملغي': 'bg-red-100 text-red-800',
};

/** Arabic label per document slot type, e.g. civil_id → "بطاقة مدنية". */
const documentLabels: Record<RentalDocumentType, string> = RENTAL_DOCUMENT_SLOTS.reduce(
  (acc, slot) => ({ ...acc, [slot.type]: slot.label }),
  {} as Record<RentalDocumentType, string>,
);

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
  contract: RentalContract | null;
  onClose: () => void;
}

const RentalContractViewDrawer: React.FC<Props> = ({ contract, onClose }) => {
  if (!contract) return null;

  return (
    <Sheet open={!!contract} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[520px] p-0 h-dvh flex flex-col gap-0">
        <SheetHeader className="p-6 pb-0 shrink-0">
          <SheetTitle className="flex items-center gap-3">
            {contract.contract_number}
            <Badge variant="secondary" className={statusColors[contract.status]}>{contract.status}</Badge>
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <h4 className="font-bold text-sm mb-2 text-primary">بيانات العقار</h4>
          <InfoRow label="العقار" value={contract.property_name} />
          {contract.unit_number && <InfoRow label="الوحدة" value={contract.unit_number} />}
          <InfoRow label="المالك" value={contract.owner_name} />

          <Separator className="my-4" />
          <h4 className="font-bold text-sm mb-2 text-primary">بيانات المستأجر</h4>
          <InfoRow label="الاسم" value={contract.tenant_name} />
          <InfoRow label="الهاتف" value={contract.tenant_phone} />

          <Separator className="my-4" />
          <h4 className="font-bold text-sm mb-2 text-primary">بيانات العقد</h4>
          <InfoRow label="تاريخ البدء" value={contract.start_date} />
          <InfoRow label="تاريخ الانتهاء" value={contract.end_date} />
          <InfoRow label="المبلغ الإجمالي" value={`${contract.total_amount} د.ك`} />
          <InfoRow label="فترة السداد" value={contract.payment_period} />
          <InfoRow label="طريقة السداد" value={contract.payment_method} />
          <InfoRow label="التأمين" value={contract.deposit_amount ? `${contract.deposit_amount} د.ك` : undefined} />
          <InfoRow label="الملاحظات" value={contract.notes} />
          <InfoRow label="تاريخ الإنشاء" value={contract.created_at} />

          {contract.documents && contract.documents.length > 0 && (
            <>
              <Separator className="my-4" />
              <h4 className="font-bold text-sm mb-2 text-primary">المستندات</h4>
              <div className="space-y-2">
                {contract.documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <FileText size={16} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{documentLabels[doc.type] ?? doc.type}</p>
                      <p className="truncate text-xs text-muted-foreground">{doc.file_name}</p>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}

          <div className="mt-6">
            <Button variant="outline" className="w-full gap-2" onClick={() => exportRentalContractPDF(contract)}>
              <FileText size={16} />
              تصدير PDF
            </Button>
          </div>
          <div className="h-6" />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default RentalContractViewDrawer;
