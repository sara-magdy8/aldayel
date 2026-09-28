import { RentalContract, SaleContract } from '@/types';
import { renderHtmlToPdf, esc } from './pdfHtml';
import { settingsService } from '@/services/settings';

/** Office name + inline (base64) logo from settings, with safe fallbacks. */
const loadBranding = async (): Promise<{ officeName: string; officeLogo: string | null }> => {
  const b = await settingsService.branding().catch(() => null);
  return {
    officeName: b?.office_name || 'مكتب العقارات',
    officeLogo: b?.office_logo_data || null,
  };
};

const sharedStyles = `
  <style>
    .pad { padding: 32px 36px; }
    .header { text-align:center; }
    .header .logo { height:64px; width:64px; object-fit:contain; margin:0 auto 8px; display:block; }
    .header .office { font-size:30px; font-weight:700; color:#1e40af; }
    .header .ctype { font-size:24px; font-weight:700; color:#1e3a5f; margin-top:6px; }
    .header .meta { color:#646464; font-size:13px; margin-top:10px; }
    .rule { border:0; border-top:1px solid #c8c8c8; margin:16px 0; }
    .row { display:flex; font-size:15px; margin:7px 0; }
    .row .label { color:#646464; width:160px; }
    .row .value { color:#1e1e1e; }
    .signs { display:flex; justify-content:space-between; margin-top:56px; font-size:16px; }
    .sign { text-align:center; }
    .sign .line { border-top:1px solid #969696; margin-top:42px; width:200px; }
    .footer { text-align:center; color:#969696; font-size:12px; margin-top:40px; }
  </style>
`;

interface Field {
  label: string;
  value: string;
}

const fieldRow = ({ label, value }: Field): string =>
  `<div class="row"><div class="label">${esc(label)}:</div><div class="value">${esc(value)}</div></div>`;

const buildContractHtml = (
  contractType: string,
  contractNumber: string,
  groups: Field[][],
  secondPartyLabel: string,
  officeName: string,
  officeLogo: string | null
): string => {
  const issueDate = new Date().toLocaleDateString('ar-EG');
  const body = groups
    .map((group) => group.filter((f) => f.value !== '').map(fieldRow).join(''))
    .filter((g) => g !== '')
    .join('<hr class="rule" />');

  return `
    ${sharedStyles}
    <div class="pad">
      <div class="header">
        ${officeLogo ? `<img class="logo" src="${esc(officeLogo)}" alt="" />` : ''}
        <div class="office">${esc(officeName)}</div>
        <div class="ctype">${esc(contractType)}</div>
        <div class="meta">رقم العقد: ${esc(contractNumber)} &nbsp;|&nbsp; تاريخ الإصدار: ${esc(issueDate)}</div>
      </div>
      <hr class="rule" />
      ${body}
      <div class="signs">
        <div class="sign">توقيع المالك<div class="line"></div></div>
        <div class="sign">توقيع ${esc(secondPartyLabel)}<div class="line"></div></div>
      </div>
      <div class="footer">${esc(officeName)} — جميع الحقوق محفوظة</div>
    </div>
  `;
};

export const exportRentalContractPDF = async (contract: RentalContract): Promise<void> => {
  const { officeName, officeLogo } = await loadBranding();
  const html = buildContractHtml(
    'عقد إيجار',
    contract.contract_number,
    [
      [
        { label: 'العقار', value: contract.property_name },
        { label: 'الوحدة', value: contract.unit_number || '' },
        { label: 'المالك', value: contract.owner_name },
      ],
      [
        { label: 'المستأجر', value: contract.tenant_name },
        { label: 'الهاتف', value: contract.tenant_phone },
      ],
      [
        { label: 'تاريخ البدء', value: contract.start_date },
        { label: 'تاريخ الانتهاء', value: contract.end_date },
        { label: 'المبلغ الإجمالي', value: `${contract.total_amount} د.ك` },
        { label: 'فترة السداد', value: contract.payment_period },
        { label: 'طريقة السداد', value: contract.payment_method },
        { label: 'التأمين', value: contract.deposit_amount ? `${contract.deposit_amount} د.ك` : '' },
        { label: 'الملاحظات', value: contract.notes || '' },
      ],
    ],
    'المستأجر',
    officeName,
    officeLogo
  );

  return renderHtmlToPdf(html, `عقد-${contract.contract_number}`);
};

export const exportSaleContractPDF = async (contract: SaleContract): Promise<void> => {
  const { officeName, officeLogo } = await loadBranding();
  const html = buildContractHtml(
    'عقد بيع',
    contract.contract_number,
    [
      [
        { label: 'العقار', value: contract.property_name },
        { label: 'الوحدة', value: contract.unit_number || '' },
        { label: 'المالك', value: contract.owner_name },
      ],
      [
        { label: 'المشتري', value: contract.buyer_name },
        { label: 'الهاتف', value: contract.buyer_phone },
      ],
      [
        { label: 'تاريخ العقد', value: contract.contract_date },
        { label: 'تاريخ التسليم', value: contract.delivery_date || '' },
        { label: 'المبلغ الإجمالي', value: `${contract.total_amount.toLocaleString()} د.ك` },
        { label: 'طريقة السداد', value: contract.payment_method },
        { label: 'الدفعة المقدمة', value: contract.down_payment ? `${contract.down_payment.toLocaleString()} د.ك` : '' },
        { label: 'الملاحظات', value: contract.notes || '' },
      ],
    ],
    'المشتري',
    officeName,
    officeLogo
  );

  return renderHtmlToPdf(html, `عقد-${contract.contract_number}`);
};
