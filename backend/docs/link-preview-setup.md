# WhatsApp / Telegram link preview for share links

Sharing `https://aldayel.net/view/<token>` should preview as:

```
مركز الدايل العقاري            ← og:title, the office name (same for every link)
مستقل — كود العقار: 10          ← og:description, this property's type and code
```

## Why a server change was needed

The React app is a static build with a single `index.html`. `vite-plugins/branding-meta.ts`
bakes the office name, description and logo into its `og:` tags **at build time**, so every
URL on the site — every `/view/<token>` included — serves the same preview. WhatsApp,
Telegram and Facebook fetch the raw HTML and never run JavaScript, so nothing the React page
sets after mount is visible to them.

The only thing that can vary the preview per token is the server answering the request.
`GET /view/{token}` on this API (`LinkPreviewController`) returns a small HTML document with
the right `og:` tags, read from the property/unit the token resolves to.

## How the two apps sit on the server

Both live under the same domain:

| URL | What serves it |
| --- | --- |
| `https://aldayel.net/` | the React build (static files + `.htaccess`) |
| `https://aldayel.net/apis/public/` | this Laravel app (matches `VITE_API_BASE_URL`) |

So the preview route's real address is
`https://aldayel.net/apis/public/view/<token>`, and the frontend's `.htaccess` has to hand
`/view/*` over to it — **for crawlers only**. Real visitors must keep getting the SPA,
otherwise they land on the preview stub instead of the property page.

## Frontend `.htaccess` (document root of the React build)

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    # Crawlers asking for a share link get the server-rendered og: tags from
    # Laravel. Internal rewrite, not [P] — no mod_proxy needed, and the request
    # never leaves the server.
    RewriteCond %{HTTP_USER_AGENT} (facebookexternalhit|WhatsApp|Twitterbot|TelegramBot|LinkedInBot|Slackbot|Discordbot|Pinterest|SkypeUriPreview|vkShare|redditbot|Googlebot|bingbot|Applebot|Embedly|Iframely) [NC]
    RewriteRule ^view/(.*)$ /apis/public/view/$1 [L]

    # Existing files/directories
    RewriteCond %{REQUEST_FILENAME} -f [OR]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    # React SPA fallback. The exclusion matters: after the rewrite above, Apache
    # re-runs this file against /apis/public/view/… and without it the fallback
    # would swallow the request and serve index.html instead of Laravel.
    RewriteCond %{REQUEST_URI} !^/apis/
    RewriteRule ^ index.html [L]
</IfModule>
```

### Why the image URL is not built with `asset()`

An internal rewrite leaves `REQUEST_URI` as `/view/{token}` while the script Apache actually
runs is `/apis/public/index.php`. Laravel derives its base path by comparing the two, they do
not match, and the base comes out empty — so `asset('storage/…')` returns
`https://aldayel.net/storage/…`, with no `/apis/public`. That URL hits the frontend's SPA
fallback and returns `index.html`, so the crawler receives an HTML page where an image should
be and renders the card without a picture.

`LinkPreviewController::storageUrl()` therefore builds the URL from `SCRIPT_NAME`, which Apache
sets from the real file it ran and which survives the rewrite. Symptom to recognise:

```bash
# should print image/png or image/jpeg — text/html means the prefix is missing
curl -sI "$(curl -sA WhatsApp https://aldayel.net/view/<token> | grep -oP '(?<=og:image" content=")[^"]+')" | grep -i content-type
```

Two mistakes that produce exactly the "nothing changed" symptom:

- **Rewriting to `https://aldayel.net/view/$1`** — that is the frontend's own URL, so the
  request comes straight back to the SPA. The target must be the `/apis/public/` path.
- **Omitting the `!^/apis/` condition** — the SPA fallback then catches the rewritten
  request and serves `index.html`, which is what the preview was showing all along.

## Deploying the API side

`LinkPreviewController` and its route are new files; upload them under `/apis/` on the
server:

- `app/Http/Controllers/LinkPreviewController.php` (new)
- `resources/views/link-preview.blade.php` (new)
- `docs/link-preview-setup.md` (this file — documentation only, optional on the server)
- `routes/web.php` (changed — adds the route)
- `config/app.php` (changed — adds `frontend_url`)

Add the canonical site origin to the server's `.env` — it becomes `og:url`:

```
FRONTEND_URL=https://aldayel.net
```

Then clear the caches, or the new route and config are invisible to a cached deployment:

```bash
php artisan route:clear
php artisan config:clear
php artisan view:clear
```

## Testing

Pretend to be WhatsApp and read the tags back:

```bash
curl -sA "WhatsApp/2.23" https://aldayel.net/view/<token> | grep 'og:'
```

Then confirm a normal browser still gets the SPA (its response is `index.html`, ~1.8 KB):

```bash
curl -s https://aldayel.net/view/<token> | head -5
```

Hitting the API path directly bypasses the `.htaccess` entirely and is the quickest way to
tell an Apache problem from a Laravel one:

```bash
curl -s https://aldayel.net/apis/public/view/<token> | grep 'og:'
```

Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/) renders the same
card WhatsApp does and can force a re-scrape.

## One caveat

**WhatsApp caches a preview per URL, for a long time.** Links already shared in chats keep
showing the old office-only card; newly shared links get the new one immediately. There is no
way to flush WhatsApp's cache from our side — if a specific link must be re-previewed, share
it with a throwaway query string (`?p=1`) to make it a new URL as far as the cache is concerned.

## Fallbacks

An unknown, disabled or deleted token previews as plain office branding rather than an error —
exactly what these links showed before this route existed, which reads better in a chat than a
broken card. A property with no `property_code`, or no `property_type`, shows whichever half it
has; with neither, it falls back to the office description.

## Unrelated, but noticed while setting this up

`https://aldayel.net/index.php` returns **500**, so the frontend's `public/index.php` — the
shell that was meant to refresh the preview branding without a rebuild — is not running in
production. The site works because Apache falls back to `index.html`. Worth a look in the
host's PHP error log; it does not affect this feature either way.
