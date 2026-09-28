import { loadEnv, type Plugin } from 'vite';

/**
 * Rewrites the link-preview meta tags in index.html from the office branding
 * stored in the settings table.
 *
 * Why this runs at build time rather than in the app: WhatsApp, Telegram and the
 * like fetch the raw HTML and never execute JavaScript, so anything the React app
 * sets after mount (see src/hooks/useDocumentBranding.ts) is invisible to them.
 * The tags have to already be in the served HTML, so we bake them in here.
 *
 * Consequence worth knowing: the preview reflects the settings as of the last
 * build. Changing office_name/description/logo updates the app immediately but
 * the shared-link preview only after a redeploy.
 *
 * If the API is unreachable the build is NOT failed — index.html keeps its static
 * defaults and a warning is printed.
 */

interface Branding {
  office_name: string | null;
  office_description: string | null;
  office_logo: string | null;
  office_favicon: string | null;
}

const FETCH_TIMEOUT_MS = 5000;

export function brandingMeta(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = (env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
  // Absolute page URL for og:url — crawlers require absolute, and only the
  // deployment knows its own domain. Optional: omitted when unset.
  const siteUrl = (env.VITE_SITE_URL ?? '').replace(/\/+$/, '');

  // One fetch per process, shared by every index.html transform (the dev server
  // transforms on each page load).
  let pending: Promise<Branding | null> | undefined;

  return {
    name: 'branding-meta',
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        if (!apiBase) return html;

        pending ??= fetchBranding(apiBase);
        const branding = await pending;
        if (!branding) return html;

        const title = branding.office_name?.trim();
        const description = branding.office_description?.trim();
        const image = branding.office_logo?.trim();

        let out = html;
        if (title) {
          out = replaceTitle(out, title);
          out = replaceMeta(out, 'property', 'og:title', title);
        }
        if (description) {
          out = replaceMeta(out, 'name', 'description', description);
          out = replaceMeta(out, 'property', 'og:description', description);
        }

        const extra: string[] = [];
        if (image) {
          // office_logo comes back from the API already absolute (asset()), which
          // is what crawlers need — they do not resolve relative image URLs.
          extra.push(metaTag('property', 'og:image', image));
          extra.push(metaTag('name', 'twitter:image', image));
        }
        if (siteUrl) {
          extra.push(metaTag('property', 'og:url', siteUrl));
        }

        // Tab icon, baked in so it is right on first paint instead of only after
        // useDocumentBranding runs. Falls back to the logo, same as the app does.
        const favicon = branding.office_favicon?.trim() || image;
        if (favicon) {
          extra.push(`<link rel="icon" href="${escapeAttr(favicon)}" />`);
        }

        // Printed so a stale value is visible in the build output instead of only
        // surfacing once a link is shared. A field left unset in the settings table
        // is skipped above, which leaves index.html's fallback in place — say so
        // rather than reporting it as applied.
      //  const unset = '(unset — keeping the default from index.html)';
       // console.info(
       //   `[branding-meta] baked into index.html:\n` +
       //     `  title:       ${title || unset}\n` +
       //     `  description: ${description || unset}\n` +
       //     `  image:       ${image || unset}`,
       // );

        return extra.length ? out.replace('</head>', `  ${extra.join('\n  ')}\n  </head>`) : out;
      },
    },
  };
}

async function fetchBranding(apiBase: string): Promise<Branding | null> {
  const url = `${apiBase}/public/branding`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Branding;
  } catch (err) {
    console.warn(
      `[branding-meta] could not read branding from ${url} (${(err as Error).message}). ` +
        'index.html keeps its default link-preview tags.',
    );
    return null;
  }
}

/** Escape a value for use inside a double-quoted HTML attribute. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape a value for use as HTML text content. */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function metaTag(attr: 'name' | 'property', key: string, value: string): string {
  return `<meta ${attr}="${key}" content="${escapeAttr(value)}" />`;
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeText(title)}</title>`);
}

/**
 * Swap the `content` of an existing `<meta name|property="key">`. Tags absent from
 * index.html are left alone rather than appended — the defaults there are the
 * contract for what this plugin may overwrite.
 */
function replaceMeta(html: string, attr: 'name' | 'property', key: string, value: string): string {
  const pattern = new RegExp(`(<meta\\s+${attr}=["']${key}["'][^>]*content=["'])[^"']*(["'])`, 'i');
  return html.replace(pattern, `$1${escapeAttr(value)}$2`);
}
