import { useEffect } from 'react';
import { settingsService } from '@/services/settings';

/** Fallback tab title used before branding loads or when office_name is unset. */
const DEFAULT_TITLE = 'مكتب العقارات - نظام إدارة';

/**
 * Sets the browser-tab title from `office_name`, the page description from
 * `office_description`, and the tab favicon from `office_favicon` — falling back
 * to `office_logo` when no dedicated icon was uploaded (all from the settings
 * table, via GET /api/public/branding). Runs app-wide (including the login
 * screen) since branding is public.
 *
 * Note this does NOT drive the WhatsApp/Telegram link preview: those crawlers
 * read the raw HTML without running JavaScript, so they never see these updates.
 * The preview tags are baked into index.html at build time by
 * vite-plugins/branding-meta.ts.
 */
export function useDocumentBranding(): void {
  useEffect(() => {
    settingsService
      .branding()
      .then((b) => {
        if (b.office_name) {
          document.title = b.office_name;
        }
        if (b.office_description) {
          setMetaContent('name', 'description', b.office_description);
        }
        const icon = b.office_favicon ?? b.office_logo;
        if (icon) {
          setFavicon(icon);
        }
      })
      .catch(() => {
        // Branding is optional — keep the default title/favicon.
      });
  }, []);
}

/** Set a <meta> tag's content, creating the tag if the page has none. */
function setMetaContent(attr: 'name' | 'property', key: string, value: string): void {
  let meta = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
  }
  meta.content = value;
}

/**
 * Point the tab favicon at the given URL. Every existing icon link is dropped
 * first — leaving `rel="shortcut icon"` or the bundler's default in place makes
 * some browsers keep showing the old one — and a fresh <link> is appended.
 */
export function setFavicon(url: string): void {
  document
    .querySelectorAll('link[rel~="icon"]')
    .forEach((el) => el.remove());

  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = url;
  document.head.appendChild(link);
}

export { DEFAULT_TITLE };
