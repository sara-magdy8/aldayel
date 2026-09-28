import { Collection } from '@/types';

/**
 * Getting a payment link to the client.
 *
 * Only WhatsApp is handled here: we open WhatsApp (web or the desktop/mobile
 * app, whichever the browser is set up to handle wa.me) with the client's number
 * and the message pre-filled, and the office presses send. Email is sent by the
 * backend instead — it owns the mailer and the client's address.
 */

/** Clients are Kuwaiti unless their stored number already carries a country code. */
const DEFAULT_COUNTRY_CODE = '965';

/** Local Kuwaiti numbers are 8 digits — anything longer already has a prefix. */
const LOCAL_NUMBER_LENGTH = 8;

/**
 * Reduce a stored phone to the digits-only international form wa.me expects.
 *
 * Numbers are typed by hand, so they arrive as `965-5001-2345`, `+965 5001 2345`,
 * `0096550012345` or a bare `50012345`. Returns null when nothing usable is left.
 */
export function toWhatsAppNumber(phone?: string | null): string | null {
  let digits = (phone ?? '').replace(/\D/g, '');

  // International prefixes: `00` (dialled) — a leading `+` is already gone above.
  if (digits.startsWith('00')) digits = digits.slice(2);
  // A local number written with a trunk `0`, e.g. `05001 2345`.
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');

  if (digits.length === LOCAL_NUMBER_LENGTH) digits = DEFAULT_COUNTRY_CODE + digits;

  // Shorter than a local number means the field held junk, not a phone.
  return digits.length >= LOCAL_NUMBER_LENGTH ? digits : null;
}

/** True when this collection is a payment link the office chose to WhatsApp. */
export function isWhatsAppPaymentLink(collection: {
  collection_method?: string;
  payment_link_channel?: string;
}): boolean {
  return collection.collection_method === 'payment_link'
    && collection.payment_link_channel === 'whatsapp';
}

/** True when this collection is a payment link the office chose to email. */
export function isEmailPaymentLink(collection: {
  collection_method?: string;
  payment_link_channel?: string;
}): boolean {
  return collection.collection_method === 'payment_link'
    && collection.payment_link_channel === 'email';
}

/**
 * True when this link has passed its expiry date and can no longer be paid.
 *
 * The date is computed by the backend, which is also what turns the client away
 * at /pay/{token} — so both sides agree on when a link is dead. An unpaid link
 * with no expiry set never dies, and a settled one is history, not a dead link.
 */
export function isPaymentLinkExpired(collection: Collection): boolean {
  return collection.collection_method === 'payment_link'
    && collection.payment_status !== 'paid'
    && !!collection.payment_link_expires_at
    && new Date(collection.payment_link_expires_at) < new Date();
}

/** The Arabic message the client receives alongside the link. */
export function buildPaymentLinkMessage(collection: Collection): string {
  const lines = [
    `مرحباً ${collection.client_name || ''}`.trim() + '،',
    `مطلوب سداد مبلغ ${collection.amount.toLocaleString()} د.ك`
      + (collection.collection_type ? ` (${collection.collection_type})` : ''),
    '',
    'يمكنك الدفع مباشرة عبر الرابط التالي:',
    collection.payment_link_url ?? '',
  ];

  // ISO in, plain `YYYY-MM-DD` out — a localised date would render in
  // Arabic-Indic digits, which reads badly next to a Latin-digit amount.
  if (collection.payment_link_expires_at) {
    lines.push('', `الرابط صالح حتى ${collection.payment_link_expires_at.slice(0, 10)}`);
  }

  return lines.join('\n');
}

/**
 * Claim a tab while the user's click is still the active gesture.
 *
 * Browsers block `window.open` once an await has run, so the tab has to be taken
 * up front and pointed at the real URL after the save responds. `noopener` is
 * deliberately omitted — it would make `open` return null, leaving nothing to
 * navigate; the reference is severed manually in `sendPaymentLinkViaWhatsApp`.
 */
export function openPendingTab(): Window | null {
  return window.open('', '_blank');
}

/**
 * Point the reserved tab at WhatsApp for this collection.
 *
 * Returns false — and disposes of the tab — when the link or the client's phone
 * turned out to be unusable, so the caller can tell the office to share it by hand.
 */
export function sendPaymentLinkViaWhatsApp(collection: Collection, pending: Window | null): boolean {
  const number = toWhatsAppNumber(collection.client_phone);
  if (!collection.payment_link_url || !number) {
    closePendingTab(pending);
    return false;
  }

  const href = `https://wa.me/${number}?text=${encodeURIComponent(buildPaymentLinkMessage(collection))}`;

  if (pending && !pending.closed) {
    // Cut the opener before navigating — wa.me should not keep a handle back here.
    pending.opener = null;
    pending.location.replace(href);
  } else {
    // The tab was blocked or closed; try a direct open as a best effort.
    window.open(href, '_blank', 'noopener');
  }
  return true;
}

/** Discard a reserved tab that will not be used (save failed, nothing to send). */
export function closePendingTab(pending: Window | null): void {
  if (pending && !pending.closed) pending.close();
}
