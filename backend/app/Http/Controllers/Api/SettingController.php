<?php
// app/Http/Controllers/Api/SettingController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\BuildingStatus;
use App\Models\FilmedBy;
use App\Models\PaymentGateway;
use App\Models\PaymentTerm;
use App\Models\PaymentType;
use App\Models\PropertyCat;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SettingController extends Controller
{
    public function index()
    {
        $settings = Setting::all()->pluck('value', 'key');
        return response()->json($settings);
    }

    /**
     * Public branding for the login screen (no auth).
     * Exposes the office name, a full logo URL (for <img> display), and the
     * logo inlined as a base64 data URI (for PDF/canvas rendering, which cannot
     * read the cross-origin storage URL without CORS on /storage).
     */
    public function publicBranding()
    {
        $logo    = Setting::get('office_logo');
        $favicon = Setting::get('office_favicon');

        return response()->json([
            'office_name'        => Setting::get('office_name'),
            'office_description' => Setting::get('office_description'),
            'office_logo'        => $logo ? asset('storage/' . $logo) : null,
            'office_logo_data'   => $this->logoDataUri($logo),
            // Tab icon. Null when unset — the frontend then falls back to the logo.
            'office_favicon'     => $favicon ? asset('storage/' . $favicon) : null,
        ]);
    }

    /**
     * Read the stored logo off the public disk and return it as a base64
     * data URI (e.g. "data:image/webp;base64,..."), or null if unavailable.
     */
    private function logoDataUri(?string $path): ?string
    {
        if (! $path || ! Storage::disk('public')->exists($path)) {
            return null;
        }

        $mime = Storage::disk('public')->mimeType($path) ?: 'image/png';
        $data = base64_encode(Storage::disk('public')->get($path));

        return "data:{$mime};base64,{$data}";
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'office_name'    => 'sometimes|string|max:255',
            // Shown as the link-preview description when the system URL is shared
            // (WhatsApp, Telegram, …). Capped near the ~200 chars those crawlers
            // display before truncating.
            'office_description' => 'nullable|string|max:255',
            'office_phone'   => 'nullable|string|max:20',
            'office_email'   => 'nullable|email',
            'office_address' => 'nullable|string',
            // Default bounds for the area (م²) filter slider on the properties list.
            'area_min'       => 'nullable|numeric|min:0',
            'area_max'       => 'nullable|numeric|min:0|gte:area_min',
        ]);

        foreach ($data as $key => $value) {
            Setting::set($key, $value);
        }

        return response()->json(['message' => 'تم حفظ الإعدادات.']);
    }

    public function uploadLogo(Request $request)
    {
        $request->validate(['logo' => 'required|image|max:2048']);

        $path = $request->file('logo')->store('office', 'public');
        Setting::set('office_logo', $path);

        return response()->json(['logo_url' => asset('storage/' . $path)]);
    }

    /**
     * Upload the browser-tab icon. Kept separate from the logo because a favicon
     * is a small square rendered at 16–32px, so offices usually want a cropped
     * mark rather than the full logo. SVG is deliberately not accepted: it is
     * served from the app's own origin and can carry script.
     */
    public function uploadFavicon(Request $request)
    {
        $request->validate(['favicon' => 'required|file|mimes:png,ico,jpg,jpeg,webp|max:1024']);

        $path = $request->file('favicon')->store('office', 'public');
        Setting::set('office_favicon', $path);

        return response()->json(['favicon_url' => asset('storage/' . $path)]);
    }

    // ── Notifications ──────────────────────────────────────────────
    // How many reminders the office wants before a rental contract expires,
    // and how many days before expiry each one fires. Both live in `settings`:
    // the count as a plain number, the offsets as a JSON array of days.

    /** Highest number of reminders an office may configure per contract. */
    private const MAX_EXPIRY_ALERTS = 10;

    /** Current rental-expiry reminder configuration. */
    public function notifications()
    {
        return response()->json($this->expiryAlertSettings());
    }

    /**
     * Save the rental-expiry reminders. `alert_days` must hold exactly
     * `alert_count` entries — the screen renders one input per reminder — and
     * is stored sorted descending so the earliest reminder comes first.
     */
    public function updateNotifications(Request $request)
    {
        $data = $request->validate([
            'rental_expiry_alert_count'  => 'required|integer|min:0|max:' . self::MAX_EXPIRY_ALERTS,
            'rental_expiry_alert_days'   => 'present|array|size:' . (int) $request->input('rental_expiry_alert_count'),
            'rental_expiry_alert_days.*' => 'required|integer|min:1|max:365',
            // Independent of the reminders above: an office can want only the
            // closing notice, or only the run-up to it.
            'rental_ended_alert_enabled' => 'required|boolean',
        ], [
            'rental_expiry_alert_days.size' => 'عدد أيام التنبيه يجب أن يطابق عدد مرات التنبيه.',
        ]);

        $days = collect($data['rental_expiry_alert_days'])
            ->map(fn ($d) => (int) $d)
            ->unique()
            ->sortDesc()
            ->values();

        if ($days->count() !== $data['rental_expiry_alert_count']) {
            return response()->json(
                ['message' => 'لا يمكن تكرار نفس عدد الأيام في أكثر من تنبيه.'],
                422
            );
        }

        Setting::set('rental_expiry_alert_count', (string) $data['rental_expiry_alert_count']);
        Setting::set('rental_expiry_alert_days', $days->toJson());
        Setting::set('rental_ended_alert_enabled', $data['rental_ended_alert_enabled'] ? '1' : '0');

        return response()->json($this->expiryAlertSettings());
    }

    /** Read the stored reminder settings back as { count, days[] }. */
    private function expiryAlertSettings(): array
    {
        return [
            'rental_expiry_alert_count' => (int) Setting::get('rental_expiry_alert_count', 0),
            // Same accessors the nightly command reads, so the screen can never
            // show a schedule the reminders are not actually running on.
            'rental_expiry_alert_days'   => Setting::rentalExpiryAlertDays(),
            'rental_ended_alert_enabled' => Setting::rentalEndedAlertEnabled(),
        ];
    }

    // ── Payment gateways ───────────────────────────────────────────
    // Credentials for the payment providers the office collects through.
    // The settings screen edits the whole list at once, so the save endpoint
    // is a full sync (upsert what was sent, drop what was removed).

    /**
     * Credential fields each provider stores inside `payment_gateways.credentials`.
     * Adding a provider here is all it takes to accept and persist its own set.
     */
    private const GATEWAY_FIELDS = [
        'hesabe' => ['merchant_code', 'access_code', 'secret_key', 'iv_key'],
    ];

    /** List the saved payment-gateway accounts. */
    public function paymentGateways()
    {
        return response()->json(
            PaymentGateway::orderBy('id')->get(['id', 'name', 'gateway', 'credentials'])
        );
    }

    /**
     * The gateway accounts as pickable options — id/name/gateway only.
     *
     * Separate from paymentGateways() so screens that merely need to *choose* an
     * account (e.g. issuing a payment link) never receive the credentials.
     */
    public function paymentGatewayOptions()
    {
        return response()->json(
            PaymentGateway::orderBy('id')->get(['id', 'name', 'gateway'])
        );
    }

    /** Replace the stored payment-gateway accounts with the posted list. */
    public function syncPaymentGateways(Request $request)
    {
        $data = $request->validate([
            'accounts'               => 'present|array',
            'accounts.*.id'          => 'nullable|integer|exists:payment_gateways,id',
            'accounts.*.name'        => 'required|string|max:255',
            'accounts.*.gateway'     => 'required|string|in:' . implode(',', array_keys(self::GATEWAY_FIELDS)),
            'accounts.*.credentials' => 'nullable|array',
            // Provider credentials are free-form key/value pairs; unknown keys
            // are dropped below rather than rejected.
            'accounts.*.credentials.*' => 'nullable|string|max:255',
        ]);

        DB::transaction(function () use ($data) {
            $kept = [];

            foreach ($data['accounts'] as $account) {
                $attributes = [
                    'name'        => $account['name'],
                    'gateway'     => $account['gateway'],
                    'credentials' => Arr::only(
                        $account['credentials'] ?? [],
                        self::GATEWAY_FIELDS[$account['gateway']]
                    ),
                ];

                $row = isset($account['id'])
                    ? tap(PaymentGateway::findOrFail($account['id']))->update($attributes)
                    : PaymentGateway::create($attributes);

                $kept[] = $row->id;
            }

            // An empty $kept means every account was removed — wipe the table.
            PaymentGateway::whereNotIn('id', $kept)->delete();
        });

        return response()->json(
            PaymentGateway::orderBy('id')->get(['id', 'name', 'gateway', 'credentials'])
        );
    }

    // ── Lookup tables ──────────────────────────────────────────────
    // Each returns its rows as [{ id, name }, ...] ordered by id.

    public function collectionTypes()
    {
        return $this->lookup('collection_types');
    }

    public function paymentTypes()
    {
        return $this->lookup('payment_types');
    }

    /** Create a payment type. Returns the new row as { id, name }. */
    public function storePaymentType(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:payment_types,name',
        ]);

        $type = PaymentType::create($data);

        return response()->json(['id' => $type->id, 'name' => $type->name], 201);
    }

    /** Delete a payment type, unless it is still referenced by a record. */
    public function destroyPaymentType(PaymentType $paymentType)
    {
        $inUse = collect(['collections', 'rental_contracts', 'sale_contracts'])
            ->contains(fn ($table) => DB::table($table)->where('payment_type_id', $paymentType->id)->exists());

        if ($inUse) {
            return response()->json(
                ['message' => 'لا يمكن حذف طريقة الدفع لأنها مستخدمة في سجلات قائمة.'],
                422
            );
        }

        $paymentType->delete();

        return response()->json(null, 204);
    }

    public function paymentTerms()
    {
        return $this->lookup('payment_terms');
    }

    /** Create a payment term. Returns the new row as { id, name }. */
    public function storePaymentTerm(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:payment_terms,name',
        ]);

        $term = PaymentTerm::create($data);

        return response()->json(['id' => $term->id, 'name' => $term->name], 201);
    }

    /** Delete a payment term, unless it is still referenced by a contract. */
    public function destroyPaymentTerm(PaymentTerm $paymentTerm)
    {
        if (DB::table('rental_contracts')->where('payment_term_id', $paymentTerm->id)->exists()) {
            return response()->json(
                ['message' => 'لا يمكن حذف مدة الدفع لأنها مستخدمة في عقود قائمة.'],
                422
            );
        }

        $paymentTerm->delete();

        return response()->json(null, 204);
    }

    /**
     * النشاط — the whole list with its per-listing-type flags, so one fetch serves
     * both the rental and the sale picker. `listing_type` narrows it to one side.
     */
    public function activities(Request $request)
    {
        return $this->scopedLookup(Activity::query(), $request);
    }

    /**
     * Add an activity to one side's list (النشاط للإيجار / للبيع).
     *
     * A name that already exists on the other side is flagged rather than
     * duplicated — one row, one id, shown in both lists. See ScopedToListingType.
     */
    public function storeActivity(Request $request)
    {
        return $this->storeScopedLookup(Activity::class, $request);
    }

    /**
     * Remove an activity from one side's list. The row itself only goes when it is
     * in neither list any more; while the other side still shows it, this just
     * clears the flag.
     */
    public function destroyActivity(Request $request, Activity $activity)
    {
        return $this->destroyScopedLookup($activity, $request, function ($listingValue) use ($activity) {
            // Records of that listing type still linked to this activity.
            return collect([
                'عقارات' => DB::table('activity_property')
                    ->join('properties', 'properties.id', '=', 'activity_property.property_id')
                    ->where('activity_property.activity_id', $activity->id)
                    ->where('properties.listing_type', $listingValue),
                'وحدات' => DB::table('activity_unit')
                    ->join('units', 'units.id', '=', 'activity_unit.unit_id')
                    ->where('activity_unit.activity_id', $activity->id)
                    ->where('units.listing_type', $listingValue),
                'طلبات' => DB::table('activity_request')
                    ->join('requests', 'requests.id', '=', 'activity_request.request_id')
                    ->where('activity_request.activity_id', $activity->id)
                    ->where('requests.request_type', $listingValue),
            ])->filter(fn ($query) => $query->exists())->keys();
        });
    }

    public function filmedBy()
    {
        return $this->lookup('filmed_by');
    }

    /** Create a "filmed by" entry. Returns the new row as { id, name }. */
    public function storeFilmedBy(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:filmed_by,name',
        ]);

        $filmedBy = FilmedBy::create($data);

        return response()->json(['id' => $filmedBy->id, 'name' => $filmedBy->name], 201);
    }

    /** Delete a "filmed by" entry. */
    public function destroyFilmedBy(FilmedBy $filmedBy)
    {
        $filmedBy->delete();

        return response()->json(null, 204);
    }

    /** حالة البناء — an office-managed list, seeded with nothing. */
    public function buildingStatuses()
    {
        return $this->lookup('building_statuses');
    }

    /** Create a building status. Returns the new row as { id, name }. */
    public function storeBuildingStatus(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:building_statuses,name',
        ]);

        $status = BuildingStatus::create($data);

        return response()->json(['id' => $status->id, 'name' => $status->name], 201);
    }

    /** Delete a building status. */
    public function destroyBuildingStatus(BuildingStatus $buildingStatus)
    {
        $buildingStatus->delete();

        return response()->json(null, 204);
    }
    public function paymentBeneficiaries()
    {
        return $this->lookup('payment_beneficiaries');
    }

    /**
     * التصنيفات — the whole list with its per-listing-type flags (see activities()).
     */
    public function propertyCats(Request $request)
    {
        return $this->scopedLookup(PropertyCat::query(), $request);
    }

    /** Add a category to one side's list (تصنيفات الإيجار / البيع). */
    public function storePropertyCat(Request $request)
    {
        return $this->storeScopedLookup(PropertyCat::class, $request);
    }

    /**
     * Remove a category from one side's list. It is only deleted outright once it
     * is in neither list; until then the row stays for the other side.
     *
     * Either way the category has to be free of that side's records first: all
     * three referencing tables carry a restrictOnDelete foreign key, so an actual
     * delete would otherwise surface as a raw DB error — and clearing the flag
     * alone would leave those records showing a category missing from their list.
     */
    public function destroyPropertyCat(Request $request, PropertyCat $propertyCat)
    {
        return $this->destroyScopedLookup($propertyCat, $request, function ($listingValue) use ($propertyCat) {
            return collect([
                'عقارات' => DB::table('properties')->where('listing_type', $listingValue),
                'وحدات'  => DB::table('units')->where('listing_type', $listingValue),
                'طلبات'  => DB::table('requests')->where('request_type', $listingValue),
            ])->filter(fn ($query) => $query->where('property_cat_id', $propertyCat->id)->exists())->keys();
        });
    }

    // ── Shared handling for the two lists split by listing type ───────────────

    /**
     * List a listing-type-scoped lookup. The flags ride along so one fetch can
     * feed both pickers; `listing_type` narrows the rows to a single side.
     */
    private function scopedLookup($query, Request $request)
    {
        $request->validate(['listing_type' => 'sometimes|in:إيجار,بيع,شراء']);

        return response()->json(
            $query->when($request->listing_type, fn ($q) => $q->forListing($request->listing_type))
                ->orderBy('id')
                ->get(['id', 'name', 'for_rental', 'for_sale'])
        );
    }

    /**
     * Add a row to one side's list. An existing name is flagged for that side
     * rather than duplicated, so the two lists can share an entry while the rest
     * of the app keeps resolving that name to a single id.
     */
    private function storeScopedLookup(string $model, Request $request)
    {
        $data = $request->validate([
            'name'         => 'required|string|max:255',
            'listing_type' => 'required|in:إيجار,بيع,شراء',
        ]);

        $column = $model::listingColumn($data['listing_type']);
        $row    = $model::where('name', $data['name'])->first();

        if ($row?->$column) {
            return response()->json(['message' => 'هذا الاسم موجود بالفعل في القائمة.'], 422);
        }

        $row
            ? $row->update([$column => true])
            : $row = $model::create(['name' => $data['name'], 'for_rental' => false, 'for_sale' => false, $column => true]);

        return response()->json($row->only(['id', 'name', 'for_rental', 'for_sale']), 201);
    }

    /**
     * Remove a row from one side's list, deleting it only once neither side shows
     * it. `$usedIn` reports which of that side's records still point at the row,
     * as Arabic labels for the message.
     */
    private function destroyScopedLookup($row, Request $request, callable $usedIn)
    {
        $data = $request->validate(['listing_type' => 'required|in:إيجار,بيع,شراء']);

        $column       = $row::listingColumn($data['listing_type']);
        $listingValue = $column === 'for_sale' ? 1 : 0;

        if (($used = $usedIn($listingValue))->isNotEmpty()) {
            return response()->json(
                ['message' => 'لا يمكن الحذف لأنه مستخدم في ' . $used->join('، ', ' و') . ' قائمة.'],
                422
            );
        }

        $row->update([$column => false]);

        // Nothing shows it any more, so the row itself goes — subject to the same
        // reference check for the *other* side, which its own flag no longer covers.
        if (! $row->for_rental && ! $row->for_sale && $usedIn(1 - $listingValue)->isEmpty()) {
            $row->delete();
        }

        return response()->json(null, 204);
    }

    public function propertyStatuses()
    {
        return $this->lookup('property_statuses');
    }

    public function requestStatuses()
    {
        return $this->lookup('request_statuses');
    }

    public function contractStatuses()
    {
        return $this->lookup('contract_statuses');
    }

    /** Kuwait governorates as [{ id, name }, ...]. */
    public function governorates()
    {
        return $this->lookup('governorates');
    }

    /**
     * Areas (districts) as [{ id, name, governorate_id }, ...]. The frontend
     * fetches the full list once and filters it by the selected governorate.
     */
    public function areas()
    {
        return response()->json(
            DB::table('areas')->orderBy('governorate_id')->orderBy('name')
                ->get(['id', 'name', 'governorate_id'])
        );
    }

    /**
     * الصلاحيات — roles for the user form's picker.
     *
     * Carries `slug` alongside the usual id/name: the name is what the office
     * reads, but the slug is what the API expects back and what authorization
     * compares against.
     */
    public function roles()
    {
        return response()->json(
            DB::table('roles')->orderBy('id')->get(['id', 'slug', 'name'])
        );
    }

    /** Fetch a lookup table's rows as [{ id, name }, ...]. */
    private function lookup(string $table)
    {
        return response()->json(
            DB::table($table)->orderBy('id')->get(['id', 'name'])
        );
    }
}
