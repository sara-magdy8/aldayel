<?php

namespace App\Http\Controllers;

use App\Models\Property;
use App\Models\Setting;
use App\Models\Unit;
use Illuminate\Support\Facades\Storage;

/**
 * Server-rendered link preview for the public share URL (/view/{token}).
 *
 * Why this exists: the React app is a static build with one index.html, so every
 * /view/{token} URL serves the same og: tags baked in at build time by
 * vite-plugins/branding-meta.ts. WhatsApp, Telegram and Facebook fetch the raw
 * HTML and never execute JavaScript, so the preview cannot be varied per link
 * from the client. Only the server answering the request can do it.
 *
 * The frontend is hosted separately from this API, so the frontend's web server
 * rewrites /view/* to this route for crawler user agents only — see
 * docs/link-preview-setup.md. Real visitors keep getting the SPA untouched; a
 * human who lands here anyway is bounced to the SPA by the redirect in the view.
 */
class LinkPreviewController extends Controller
{
    public function show(string $token)
    {
        $meta = $this->metaFor($token) + [
            // Canonical page the preview points at — the SPA URL, not this one.
            // Crawlers require og:url to be absolute.
            'url' => rtrim(config('app.frontend_url'), '/') . '/view/' . $token,
        ];

        return response()->view('link-preview', $meta);
    }

    /**
     * Title / description / image for one share token.
     *
     * The title stays the office name for every link — the client wants the
     * system name to read the same as it does now — and the property type and
     * code go on the description line beneath it.
     *
     * An unknown, disabled or deleted token falls back to plain office branding
     * rather than a 404: the fallback is exactly what these links previewed as
     * before this route existed, which is a better outcome in a chat than a
     * broken card.
     */
    private function metaFor(string $token): array
    {
        $officeName = Setting::get('office_name') ?: 'مكتب العقارات - نظام إدارة';
        $officeDesc = Setting::get('office_description') ?: 'نظام إدارة مكتب العقارات الداخلي';
        $officeLogo = Setting::get('office_logo');

        $property = Property::where('public_link_token', $token)
            ->where('public_link_enabled', true)
            ->with('attachments')
            ->first();

        if ($property) {
            return [
                'title'       => $officeName,
                // The category lookup (شقة، محل، فيلا…) is what a reader recognises.
                // property_type only says مستقل / متعدد الوحدات, which is a
                // structural flag; it stands in when no category is set.
                'description' => $this->describe($property->category ?: $property->property_type, $property->property_code, $property->listing_type)
                    ?: $officeDesc,
            ] + $this->image($property->attachments->first()?->file_path ?: $officeLogo);
        }

        $unit = Unit::where('public_link_token', $token)
            ->where('public_link_enabled', true)
            ->with(['images', 'property'])
            ->first();

        if ($unit) {
            // Units carry no code of their own; they inherit the parent
            // property's, which is what the office quotes over the phone.
            return [
                'title'       => $officeName,
                // A unit is listed on its own terms — a building held for rent can
                // still have a unit up for sale — so its listing_type wins, with
                // the property's as the fallback for older rows.
                'description' => $this->describe('وحدة', $unit->property?->property_code, $unit->listing_type ?: $unit->property?->listing_type)
                    ?: $officeDesc,
            ] + $this->image($unit->images->first()?->image_path ?: $officeLogo);
        }

        return [
            'title'       => $officeName,
            'description' => $officeDesc,
        ] + $this->image($officeLogo);
    }

    /** "شقة للبيع — كود العقار: P-1024", or whichever part is present. */
    private function describe(?string $type, ?string $code, ?string $listingType): string
    {
        $type    = trim((string) $type);
        $listing = trim((string) $listingType);

        // The accessor gives the bare noun (بيع / إيجار), so prefixing لل reads as
        // one phrase — "شقة للبيع", "محل للإيجار" — instead of a second label.
        $headline = $listing !== '' ? trim($type . ' لل' . $listing) : $type;

        $parts = array_filter([
            $headline ?: null,
            trim((string) $code) !== '' ? 'كود العقار: ' . trim((string) $code) : null,
        ]);

        return implode(' — ', $parts);
    }

    /**
     * Preview image as [image, image_width, image_height] for a path on the
     * public disk. Dimensions are optional but make WhatsApp and Facebook render
     * the large card immediately instead of waiting to fetch the file first.
     */
    private function image(?string $path): array
    {
        if (! $path) {
            return ['image' => null, 'image_width' => null, 'image_height' => null];
        }

        $size = @getimagesize(Storage::disk('public')->path($path)) ?: [];

        return [
            'image'        => $this->storageUrl($path),
            'image_width'  => $size[0] ?? null,
            'image_height' => $size[1] ?? null,
        ];
    }

    /**
     * Absolute URL for a file on the public disk.
     *
     * Deliberately not asset(): the frontend reaches this route through an Apache
     * internal rewrite, which leaves REQUEST_URI as /view/{token} while the script
     * is /apis/public/index.php. Laravel then computes an empty base path and
     * asset() returns https://host/storage/… — a URL that lands on the frontend's
     * SPA fallback and hands crawlers an HTML page where an image should be, so
     * the preview renders with no picture.
     *
     * SCRIPT_NAME is set by Apache from the real file it ran and survives the
     * rewrite, so the app's own base path is derived from that instead. Serving
     * this app at the domain root yields an empty prefix, which is also correct.
     */
    private function storageUrl(string $path): string
    {
        $request = request();
        $script  = str_replace('\\', '/', dirname((string) $request->server('SCRIPT_NAME')));
        $base    = rtrim($script === '.' || $script === '/' ? '' : $script, '/');

        return $request->getSchemeAndHttpHost() . $base . '/storage/' . ltrim($path, '/');
    }
}
