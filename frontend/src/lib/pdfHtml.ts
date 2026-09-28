import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Renders an HTML fragment to a multi-page A4 PDF and triggers a download.
 *
 * Arabic text is rendered by the browser (correct shaping, joining and bidi)
 * and snapshotted into the PDF as an image via html2canvas. This sidesteps
 * jsPDF's lack of Arabic font + shaping support, which produced garbled output
 * like "þ”þôþäþ³þ".
 *
 * @param bodyHtml  inner HTML for the A4 page (already styled, RTL)
 * @param filename  output file name (with or without ".pdf")
 */
export const renderHtmlToPdf = async (bodyHtml: string, filename: string): Promise<void> => {
  // A4 at 96dpi is 794 x 1123px. We fix the width and let height grow.
  const PAGE_WIDTH_PX = 794;

  const container = document.createElement('div');
  container.dir = 'rtl';
  container.lang = 'ar';
  container.style.cssText = [
    `width:${PAGE_WIDTH_PX}px`,
    'position:fixed',
    'top:0',
    'left:-10000px', // off-screen but still laid out & rendered
    'background:#ffffff',
    'box-sizing:border-box',
    "font-family:'Cairo','Tajawal','Segoe UI',Tahoma,Arial,sans-serif",
    'color:#1e1e1e',
  ].join(';');
  container.innerHTML = bodyHtml;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2, // crisp text
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidthMm = doc.internal.pageSize.getWidth();   // 210
    const pageHeightMm = doc.internal.pageSize.getHeight();  // 297

    // Full image height in mm, scaled to page width.
    const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;

    let heightLeft = imgHeightMm;
    let position = 0;
    const imgData = canvas.toDataURL('image/png');

    doc.addImage(imgData, 'PNG', 0, position, pageWidthMm, imgHeightMm);
    heightLeft -= pageHeightMm;

    // Add extra pages by shifting the same tall image upward.
    while (heightLeft > 0) {
      position -= pageHeightMm;
      doc.addPage();
      doc.addImage(imgData, 'PNG', 0, position, pageWidthMm, imgHeightMm);
      heightLeft -= pageHeightMm;
    }

    const name = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
    doc.save(name);
  } finally {
    document.body.removeChild(container);
  }
};

/** Escapes a value for safe interpolation into the HTML templates. */
export const esc = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};
