import { renderHtmlToPdf, esc } from './pdfHtml';

interface ReportSummary {
  label: string;
  value: string;
}

interface ReportColumn {
  header: string;
  key: string;
}

export const exportReportPDF = (
  title: string,
  filters: string[],
  columns: ReportColumn[],
  rows: Record<string, string>[],
  summaryData: ReportSummary[]
): Promise<void> => {
  const exportDate = new Date().toLocaleDateString('ar-EG');

  const filtersHtml =
    filters.length > 0
      ? `<div class="section-title">الفلاتر المطبقة:</div>
         <ul class="filters">${filters.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
         <hr class="rule" />`
      : '';

  const summaryHtml =
    summaryData.length > 0
      ? `<div class="section-title accent">ملخص:</div>
         <div class="summary">${summaryData
           .map(
             (s) =>
               `<div class="summary-item"><span class="s-label">${esc(s.label)}:</span> <span class="s-value">${esc(s.value)}</span></div>`
           )
           .join('')}</div>
         <hr class="rule" />`
      : '';

  const tableHtml =
    columns.length > 0 && rows.length > 0
      ? `<table>
           <thead><tr>${columns.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr></thead>
           <tbody>${rows
             .map(
               (row, i) =>
                 `<tr style="background:${i % 2 === 0 ? '#f5f7fa' : '#ffffff'}">${columns
                   .map((c) => `<td>${esc(row[c.key] || '—')}</td>`)
                   .join('')}</tr>`
             )
             .join('')}</tbody>
         </table>`
      : '';

  const html = `
    <style>
      .pad { padding: 28px 32px; }
      .header { text-align:center; }
      .header .office { font-size:30px; font-weight:700; color:#1e40af; }
      .header .title { font-size:22px; font-weight:700; color:#1e3a5f; margin-top:6px; }
      .header .meta { color:#646464; font-size:12px; margin-top:8px; }
      .rule { border:0; border-top:1px solid #c8c8c8; margin:14px 0; }
      .section-title { font-size:15px; font-weight:700; margin:6px 0; }
      .section-title.accent { color:#1e40af; }
      .filters { margin:6px 24px; font-size:13px; color:#505050; }
      .summary { display:flex; flex-wrap:wrap; gap:8px 28px; font-size:14px; }
      .summary-item .s-label { color:#505050; }
      .summary-item .s-value { color:#1e1e1e; font-weight:600; }
      table { width:100%; border-collapse:collapse; margin-top:8px; }
      th { background:#1e40af; color:#fff; font-size:12px; padding:7px 6px; text-align:center; }
      td { font-size:11px; padding:6px; text-align:center; border-bottom:1px solid #eee; }
      .footer { text-align:center; color:#969696; font-size:11px; margin-top:28px; }
    </style>
    <div class="pad">
      <div class="header">
        <div class="office">مكتب العقارات</div>
        <div class="title">${esc(title)}</div>
        <div class="meta">تاريخ التصدير: ${esc(exportDate)}</div>
      </div>
      <hr class="rule" />
      ${filtersHtml}
      ${summaryHtml}
      ${tableHtml}
      <div class="footer">تم إنشاء هذا التقرير بتاريخ ${esc(exportDate)} — مكتب العقارات</div>
    </div>
  `;

  return renderHtmlToPdf(html, title);
};
