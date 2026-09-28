import { Collection } from '@/types';
import { renderHtmlToPdf, esc } from './pdfHtml';
import { settingsService } from '@/services/settings';

export const exportInvoicePDF = async (collection: Collection): Promise<void> => {
  // Office branding (name + logo) from the settings table. Optional — fall back
  // to the default title and no logo if the request fails.
  const branding = await settingsService.branding().catch(() => null);
  const officeName = branding?.office_name || 'مكتب العقارات';
  // Prefer the base64 data URI: html2canvas can render it without hitting the
  // cross-origin /storage URL (which taints the canvas and drops the logo).
  const officeLogo = branding?.office_logo_data || null;

  const invoiceNumber =
    collection.invoice_number ||
    `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const issueDate = new Date().toLocaleDateString('ar-EG');

  // Readable date + time, e.g. "٦ يوليو ٢٠٢٦، ٣:٤٥ م" — falls back to the raw
  // value if it isn't a parseable date.
  const createdAt = (() => {
    const d = new Date(collection.created_at);
    if (isNaN(d.getTime())) return collection.created_at;
    return d.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  })();

  const rows: [string, string][] = [
    ['نوع التحصيل', collection.collection_type],
    ['المبلغ', `${collection.amount.toLocaleString()} د.ك`],
    ['تاريخ الإنشاء', createdAt],
    ['طريقة الدفع', collection.payment_method],
    ['المستفيد', collection.beneficiary],
    ['الوسيط', collection.broker || '—'],
    ['الملاحظات', collection.notes || '—'],
  ];

  const propertyLine = collection.property_name
    ? `<div class="info-line">العقار: ${esc(collection.property_name)}${
        collection.unit_number ? ` / ${esc(collection.unit_number)}` : ''
      }</div>`
    : '';

  const tableRows = rows
    .map(
      ([label, value], i) => `
        <tr style="background:${i % 2 === 0 ? '#fafafa' : '#ffffff'}">
          <td class="cell-label">${esc(label)}</td>
          <td class="cell-value">${esc(value)}</td>
        </tr>`
    )
    .join('');

  const html = `
    <style>
      .pad { padding: 32px 36px; }
      .head { display:flex; justify-content:space-between; align-items:center; }
      .head .brand { display:flex; align-items:center; gap:12px; }
      .head .logo { height:56px; width:56px; object-fit:contain; }
      .head .office { font-size:30px; font-weight:700; color:#1e40af; }
      .head .title { font-size:24px; font-weight:700; color:#1e3a5f; }
      .meta { display:flex; justify-content:space-between; color:#646464; font-size:13px; margin-top:8px; }
      .rule { border:0; border-top:1px solid #c8c8c8; margin:14px 0; }
      .info-box { background:#f5f5f5; border-radius:6px; padding:14px 18px; margin:18px 0; }
      .info-line { font-size:15px; margin:4px 0; }
      table { width:100%; border-collapse:collapse; margin-top:8px; }
      th { background:#1e40af; color:#fff; font-size:14px; padding:9px 12px; }
      td { font-size:14px; padding:9px 12px; }
      .cell-label { color:#646464; width:50%; }
      .cell-value { color:#1e1e1e; }
      .total { background:#1e40af; color:#fff; font-size:19px; font-weight:700;
               text-align:center; padding:16px; border-radius:6px; margin-top:24px; }
      .signs { display:flex; justify-content:space-between; margin-top:48px; font-size:16px; }
      .sign { text-align:center; }
      .sign .pad-line { border-top:1px solid #969696; margin-top:42px; width:170px; }
      .sign .stamp { border:1px solid #969696; width:140px; height:54px; margin-top:8px; }
      .footer { text-align:center; color:#969696; font-size:12px; margin-top:40px; }
    </style>
    <div class="pad">
      <div class="head">
        <div class="brand">
          ${officeLogo ? `<img class="logo" src="${esc(officeLogo)}" alt="" />` : ''}
          <div class="office">${esc(officeName)}</div>
        </div>
        <div class="title">فاتورة رسمية</div>
      </div>
      <div class="meta">
        <div>رقم الفاتورة: ${esc(invoiceNumber)}</div>
        <div>تاريخ الإصدار: ${esc(issueDate)}</div>
      </div>
      <hr class="rule" />

      <div class="info-box">
        <div class="info-line">اسم العميل: ${esc(collection.client_name)}</div>
        <div class="info-line">رقم الهاتف: ${esc(collection.client_phone)}</div>
        ${propertyLine}
      </div>

      <table>
        <thead>
          <tr><th>البيان</th><th>التفاصيل</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <div class="total">الإجمالي المدفوع: ${esc(collection.amount.toLocaleString())} د.ك</div>

      <div class="signs">
        <div class="sign">توقيع المستلم<div class="pad-line"></div></div>
        <div class="sign">ختم المكتب<div class="stamp"></div></div>
      </div>

      <div class="footer">${esc(officeName)} — شكراً لتعاملكم معنا</div>
    </div>
  `;

  return renderHtmlToPdf(html, `فاتورة-${collection.collection_number}`);
};
