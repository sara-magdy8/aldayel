import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Property } from '@/types';
import { settingsService } from '@/services/settings';
import { propertiesService, PropertyViewData } from '@/services/properties';
import { Soum, soumsService } from '@/services/soums';
import QRCode from 'qrcode';

/**
 * Client-facing property detail sheet exported as a downloadable PDF file.
 *
 * jsPDF's native text engine does not shape Arabic/RTL correctly, so instead we
 * render a styled RTL HTML node off-screen, rasterise it with html2canvas, and
 * slice the bitmap across A4 pages into the PDF. Arabic renders natively (the
 * browser shapes it) and the result downloads directly — no print dialog.
 *
 * Images are passed in as base64 data URIs (fetched via the API) so the canvas
 * is never tainted by cross-origin storage files.
 */

interface PropertyPdfOptions {
  /** Image data URIs (base64) to include in the sheet. */
  images?: string[];
  /** Office / agency name shown in the header. */
  officeName?: string;
  /** Office logo as a base64 data URI (for embedding in the canvas). */
  officeLogo?: string | null;
  /** السومات — printed only when the sale property opts in (show_soum_in_pdf). */
  soums?: Soum[];
  /** QR code (data URI) for location_link, so a printed sheet can still reach it. */
  locationQr?: string | null;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A label/value row — skipped entirely when the value is empty. */
function row(label: string, value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `<tr><td class="lbl">${esc(label)}</td><td class="val">${esc(value)}</td></tr>`;
}

/**
 * A label/link row — skipped when empty.
 *
 * The URL text is wrapped in a `[data-pdf-link]` span so that, once the sheet
 * has been rasterised, we can measure where that text landed and stamp a real
 * clickable link annotation over it (see `collectLinkBoxes`).
 */
function linkRow(label: string, href?: string | null, text?: string, qr?: string | null): string {
  if (!href) return '';
  return `<tr><td class="lbl">${esc(label)}</td><td class="val link"><span data-pdf-link="${esc(
    normalizeUrl(href),
  )}">${esc(text ?? href)}</span>${qr ? `<img class="qr" src="${qr}" alt="" />` : ''}</td></tr>`;
}

/** PDF link annotations need an absolute URL — assume https when no scheme is given. */
function normalizeUrl(href: string): string {
  const trimmed = href.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function buildHtml(view: PropertyViewData, options: PropertyPdfOptions): string {
  const isRental = view.listing_type === 'إيجار';
  const officeName = options.officeName ?? 'مكتب العقارات';
  const officeLogo = options.officeLogo ?? null;
  const images = options.images ?? [];

  // `price` arrives already resolved by the backend presenter (rent for rentals).
  const priceRow = row(
    isRental ? 'مبلغ الإيجار' : 'السعر',
    view.price != null ? `${view.price.toLocaleString()} د.ك` : undefined,
  );

  const lastSoum = isRental ? undefined : lastSoumAmount(options.soums ?? []);
  // With no price set, the last bid stands in for it and takes its label.
  const soumRow = row(view.price == null ? 'السعر' : 'السوم',lastSoum != null ? `${lastSoum.toLocaleString()} د.ك` : undefined);

  const imagesHtml = images.length
    ? `<div class="section"><h2>الصور</h2><div class="imgs">${images.map(src => `<img src="${src}" />`).join('')}</div></div>`
    : '';

  const printedAt = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  return `
  <div class="header">
    <div class="brand">
      ${officeLogo ? `<img class="logo" src="${officeLogo}" alt="" />` : ''}
      <div class="office">${esc(officeName)}</div>
    </div>
    <div class="doc">تفاصيل العقار</div>
  </div>

  <h1>${esc(view.name)}</h1>
  <div class="status">${esc(view.status)}</div>

  <div class="section">
    <h2>البيانات الأساسية</h2>
    <table>
      ${row('نوع العرض', view.listing_type)}
      ${row('نوع العقار', view.property_type)}
      ${row('التصنيف', view.category)}
      ${row(isRental ? 'النشاط' : 'حالة الإشغال', view.activity)}
      ${!isRental ? row('حالة البناء', view.building_status) : ''}
      ${row('العنوان', view.address)}
      ${row('المساحة', view.area != null ? `${view.area} م²` : undefined)}
      ${priceRow}
      ${soumRow}
      ${isRental ? row('فترة السماح', view.grace_period) : ''}
      ${row('رقم التواصل', view.contact)}
      ${linkRow('رابط الموقع', view.location_link, 'انقر هنا للوصول لرابط الموقع', options.locationQr)}
    </table>
  </div>

  ${view.description ? `<div class="section"><h2>المواصفات</h2><div class="desc">${esc(view.description)}</div></div>` : ''}
  ${view.conditions ? `<div class="section"><h2>الشروط</h2><div class="desc">${esc(view.conditions)}</div></div>` : ''}

  ${imagesHtml}

  <div class="footer">تم إنشاء هذا المستند في ${esc(printedAt)}</div>`;
}

/**
 * The amount of the most recently recorded bid — highest id, since ids follow
 * insertion order (soum_date is user-entered and can be back-dated).
 */
function lastSoumAmount(soums: Soum[]): number | undefined {
  if (!soums.length) return undefined;
  return soums.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a)).amount;
}

const STYLES = `
  * { box-sizing: border-box; }
  #pdf-root {
    font-family: "Segoe UI", Tahoma, "Traditional Arabic", Arial, sans-serif;
    color: #1f2937; line-height: 1.6; width: 794px; padding: 40px; background: #fff;
  }
  #pdf-root .header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 3px solid #0f766e; padding-bottom: 16px; margin-bottom: 20px;
  }
  #pdf-root .brand { display: flex; align-items: center; gap: 12px; }
  #pdf-root .logo { height: 52px; width: 52px; object-fit: contain; }
  #pdf-root .office { font-size: 22px; font-weight: 700; color: #0f766e; }
  #pdf-root .doc { font-size: 13px; color: #6b7280; }
  #pdf-root h1 { font-size: 24px; margin: 0 0 6px; }
  #pdf-root .status {
    display: inline-block; font-size: 13px; font-weight: 600; line-height: 1;
     color: #047857; margin-bottom: 8px; margin-top: 10px;
  }
  #pdf-root .section { margin-top: 20px; }
  #pdf-root h2 { font-size: 15px; color: #0f766e; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 0 0 8px; }
  #pdf-root table { width: 100%; border-collapse: collapse; }
  #pdf-root td { padding: 7px 4px; vertical-align: top; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  #pdf-root td.lbl { color: #6b7280; width: 38%; }
  #pdf-root td.val { font-weight: 600; }
  #pdf-root td.val.link { color: #0f766e; word-break: break-all; font-weight: 500; text-decoration: underline; }
  #pdf-root td.val.link .qr { display: block; width: 110px; height: 110px; margin-top: 8px; }
  #pdf-root .desc { font-size: 14px; white-space: pre-wrap; }
  #pdf-root .imgs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  #pdf-root .imgs img { width: 100%; height: 160px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb; }
  #pdf-root .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
`;

/** Build the off-screen node, giving embedded images time to decode. */
async function renderNode(html: string): Promise<HTMLElement> {
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'pdf-root';
  root.setAttribute('dir', 'rtl');
  root.setAttribute('lang', 'ar');
  root.style.position = 'fixed';
  root.style.left = '-10000px';
  root.style.top = '0';
  root.innerHTML = html;
  document.body.appendChild(root);

  // Wait for all <img> to finish decoding so none rasterise blank.
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); }),
    ),
  );

  return root;
}

/** A link's position within the rendered sheet, in CSS pixels relative to its top-left. */
interface LinkBox {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Measure every `[data-pdf-link]` span while the node is still in the document. */
function collectLinkBoxes(root: HTMLElement): LinkBox[] {
  const rootRect = root.getBoundingClientRect();
  return Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-link]')).map(el => {
    const r = el.getBoundingClientRect();
    return {
      url: el.dataset.pdfLink as string,
      x: r.left - rootRect.left,
      y: r.top - rootRect.top,
      w: r.width,
      h: r.height,
    };
  });
}

export async function downloadPropertyPdf(property: Property, options: PropertyPdfOptions = {}): Promise<void> {
  // Fetch the canonical view data from the backend — the single source shared
  // with the public share link — so the PDF never re-derives fields locally.
  const view = await propertiesService.getViewData(property.id);

  // Generated locally (no network), so a failure only drops the QR.
  if (options.locationQr === undefined && view.location_link) {
    const locationQr = await QRCode.toDataURL(normalizeUrl(view.location_link), { margin: 10, width: 220 }).catch(() => null);
    options = { ...options, locationQr };
  }

  // السومات stay off the shared view data (the public link must never show
  // them); they are fetched here, fresh, and only when the property opts in.
  if (options.soums === undefined && property.show_soum_in_pdf && view.listing_type !== 'إيجار') {
    const soums = await soumsService.list(property.id).catch(() => []);
    options = { ...options, soums };
  }

  // Pull the office name + logo (base64) from settings unless the caller supplied them.
  if (options.officeName === undefined || options.officeLogo === undefined) {
    const branding = await settingsService.branding().catch(() => null);
    options = {
      ...options,
      officeName: options.officeName ?? branding?.office_name ?? undefined,
      officeLogo: options.officeLogo ?? branding?.office_logo_data ?? null,
    };
  }

  const root = await renderNode(buildHtml(view, options));
  try {
    const linkBoxes = collectLinkBoxes(root);
    const rootWidthPx = root.getBoundingClientRect().width;
    const canvas = await html2canvas(root, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
      heightLeft -= pageH;
    }

    // The sheet is a bitmap, so URLs are not clickable on their own. Re-project
    // each measured link box from CSS pixels into page millimetres and stamp a
    // link annotation over it. The bitmap is laid out at a constant scale across
    // pages, so a box's page is simply its offset divided by the page height.
    const pxToMm = imgW / rootWidthPx;
    const pageCount = pdf.getNumberOfPages();
    for (const box of linkBoxes) {
      const xMm = box.x * pxToMm;
      const wMm = box.w * pxToMm;
      const yMm = box.y * pxToMm;
      const hMm = box.h * pxToMm;

      // A box may straddle a page break — annotate the slice on each page it touches.
      const firstPage = Math.floor(yMm / pageH);
      const lastPage = Math.floor((yMm + hMm) / pageH);
      for (let p = Math.max(firstPage, 0); p <= Math.min(lastPage, pageCount - 1); p++) {
        const top = Math.max(yMm, p * pageH) - p * pageH;
        const bottom = Math.min(yMm + hMm, (p + 1) * pageH) - p * pageH;
        if (bottom - top <= 0) continue;
        pdf.setPage(p + 1);
        pdf.link(xMm, top, wMm, bottom - top, { url: box.url });
      }
    }

    const safeName =(property.name || 'property').replace(/[\\/:*?"<>|]/g, '_').trim();
    pdf.save(`${safeName}.pdf`);
  } finally {
    root.remove();
  }
}
