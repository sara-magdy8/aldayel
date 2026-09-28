<?php
/**
 * SPA shell with live link-preview tags.
 *
 * WhatsApp/Telegram/Twitter crawlers do not run JavaScript, so the branding the
 * React app applies at runtime (src/hooks/useDocumentBranding.ts) is invisible to
 * them — the tags have to be in the HTML as served. This script reads index.html,
 * substitutes office_name / office_description / office_logo from the settings
 * table, and serves the result, so changing them in الإعدادات updates the shared
 * link preview with no rebuild and no redeploy.
 *
 * Deploy: upload alongside index.html (Vite copies it into dist/ automatically),
 * then point Apache at it — see .htaccess notes in the README section below.
 *
 * Failure is always non-fatal: if the API is unreachable the untouched index.html
 * is served, which still carries whatever the build baked in.
 */

// Same-origin path to the Laravel API. Hardcoded rather than derived from
// HTTP_HOST, which is client-controlled and could be poisoned into pointing the
// fetch at another host.
const BRANDING_ENDPOINT = 'https://aldayel.net/apis/public/api/public/branding';

// Seconds to reuse a fetched response. Keeps the API off the critical path for
// ordinary page loads; a settings change shows up within this window.
const CACHE_TTL = 300;

// Kept outside the web root so it is never served as a file.
const CACHE_FILE = 'aldayel-branding-cache.json';

const SHELL_FILE = __DIR__ . '/index.html';

$html = @file_get_contents(SHELL_FILE);
if ($html === false) {
    http_response_code(500);
    exit('index.html not found');
}

$branding = load_branding();
if ($branding) {
    $html = inject_branding($html, $branding);
}

header('Content-Type: text/html; charset=UTF-8');
// Short, so an edited description propagates quickly, but non-zero so repeat
// visits and crawler retries do not re-render every time.
header('Cache-Control: public, max-age=60');
echo $html;

// ── Branding ────────────────────────────────────────────────────────────────

/**
 * Branding as [office_name, office_description, office_logo], from the local
 * cache when fresh, otherwise from the API. Returns null only when there is
 * nothing usable at all — a stale cache beats no branding.
 */
function load_branding(): ?array
{
    $cachePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . CACHE_FILE;

    $cached = @file_get_contents($cachePath);
    if ($cached !== false) {
        $decoded = json_decode($cached, true);
        if (is_array($decoded) && isset($decoded['at'], $decoded['data']) && (time() - $decoded['at']) < CACHE_TTL) {
            return $decoded['data'];
        }
    }

    $fresh = fetch_branding();
    if ($fresh !== null) {
        @file_put_contents($cachePath, json_encode(['at' => time(), 'data' => $fresh]));
        return $fresh;
    }

    // API down: fall back to the stale cache rather than dropping the tags.
    if (isset($decoded['data']) && is_array($decoded['data'])) {
        return $decoded['data'];
    }

    return null;
}

/** One GET against the branding endpoint. Null on any failure. */
function fetch_branding(): ?array
{
    $context = stream_context_create([
        'http' => ['timeout' => 3, 'ignore_errors' => true],
    ]);

    $body = @file_get_contents(BRANDING_ENDPOINT, false, $context);
    if ($body === false) {
        return null;
    }

    $data = json_decode($body, true);

    return is_array($data) ? $data : null;
}

// ── HTML rewriting ──────────────────────────────────────────────────────────

/** Apply the branding values to the shell's title and preview meta tags. */
function inject_branding(string $html, array $branding): string
{
    $title       = trim((string) ($branding['office_name'] ?? ''));
    $description = trim((string) ($branding['office_description'] ?? ''));
    $image       = trim((string) ($branding['office_logo'] ?? ''));

    // An unset field leaves whatever the build baked in, rather than blanking it.
    if ($title !== '') {
        $html = preg_replace('#<title>.*?</title>#is', '<title>' . esc_text($title) . '</title>', $html, 1);
        $html = set_meta($html, 'property', 'og:title', $title);
    }
    if ($description !== '') {
        $html = set_meta($html, 'name', 'description', $description);
        $html = set_meta($html, 'property', 'og:description', $description);
    }
    if ($image !== '') {
        $html = set_meta($html, 'property', 'og:image', $image);
        $html = set_meta($html, 'name', 'twitter:image', $image);
    }

    return $html;
}

/**
 * Set a meta tag's content, replacing the existing tag when present and
 * appending before </head> when not. Replacing matters: the build already
 * injects og:image, and a second one would leave crawlers picking between two.
 */
function set_meta(string $html, string $attr, string $key, string $value): string
{
    $pattern = '#(<meta\s+' . preg_quote($attr, '#') . '=["\']' . preg_quote($key, '#') . '["\'][^>]*content=["\'])[^"\']*(["\'])#i';

    if (preg_match($pattern, $html)) {
        return preg_replace($pattern, '${1}' . esc_replacement(esc_attr($value)) . '${2}', $html, 1);
    }

    $tag = '<meta ' . $attr . '="' . $key . '" content="' . esc_attr($value) . '" />';

    return preg_replace('#</head>#i', '  ' . $tag . "\n  </head>", $html, 1);
}

function esc_attr(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function esc_text(string $value): string
{
    return htmlspecialchars($value, ENT_NOQUOTES, 'UTF-8');
}

/** Protect `$` and `\` in a replacement string from preg_replace backreferences. */
function esc_replacement(string $value): string
{
    return str_replace(['\\', '$'], ['\\\\', '\\$'], $value);
}
