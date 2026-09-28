<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\BuildingStatus;
use App\Models\Client;
use App\Models\Collection;
use App\Models\Property;
use App\Models\PropertyAttachment;
use App\Models\PropertyCat;
use App\Models\PropertyLog;
use App\Models\PropertyStatus;
use App\Models\RentalContract;
use App\Models\SaleContract;
use App\Models\UnitImage;
use App\Services\PropertyMatcher;
use App\Support\PropertyLogger;
use App\Support\PropertyPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PropertyController extends Controller
{
    /** Relations every property payload needs; `with()` on lists, `load()` on a single record. */
    private const PAYLOAD_RELATIONS = [
        'owner', 'broker', 'manager', 'tenant', 'attachments', 'propertyStatus', 'propertyCat',
        'filmedByLookup', 'buildingStatusLookup', 'activitiesLookup', 'governorateLookup', 'areaLookup',
    ];

    /**
     * حالة البناء belongs to عقارات البيع only. A rental save clears it rather than
     * rejecting it, so converting a sale property to a rental drops the value
     * instead of failing — the form hides the field on that side either way.
     * The same goes for إظهار السوم في PDF: rentals have no السوم.
     */
    private function clearBuildingStatusForRentals(array $data, $listingType): array
    {
        if (Property::listingTypeValue($listingType) === 0) {
            $data['building_status'] = null;
            $data['show_soum_in_pdf'] = false;
        }

        return $data;
    }

    /**
     * الوسيط / مسؤول العقار / المستأجر are clients of specific types. The client
     * must exist and carry one of those types.
     */
    private function clientRule(string ...$types): array
    {
        return ['nullable', Rule::exists('clients', 'id')
            ->whereIn('type', array_map([Client::class, 'typeValue'], $types))];
    }

    public function index(Request $request)
    {
        // topSoum / soums_count feed the list's السوم column and are loaded here
        // rather than in PAYLOAD_RELATIONS — no other endpoint renders that
        // summary, and the options query would carry the subqueries for nothing.
        $query = Property::with([...self::PAYLOAD_RELATIONS, 'topSoum'])->withCount('soums');

        if ($request->listing_type)   $query->where('listing_type', Property::listingTypeValue($request->listing_type));
        if ($ids = $this->lookupIds(PropertyStatus::class, $request->status))          $query->whereIn('property_status_id', $ids);
        if ($ids = $this->lookupIds(PropertyCat::class, $request->category))           $query->whereIn('property_cat_id', $ids);
        // بيع-only field, so this filter simply matches nothing on the rental list.
        if ($ids = $this->lookupIds(BuildingStatus::class, $request->building_status)) $query->whereIn('building_status_id', $ids);
        if ($vals = $this->mappedValues([Property::class, 'propertyTypeValue'], $request->property_type)) $query->whereIn('property_type', $vals);
        if ($names = array_filter((array) $request->activity, 'strlen'))              $query->whereHas('activitiesLookup', fn ($q) => $q->whereIn('name', $names));
        if ($ids = array_filter((array) $request->governorate_id, 'is_numeric'))       $query->whereIn('governorate_id', $ids);
        if ($ids = array_filter((array) $request->area_id, 'is_numeric'))              $query->whereIn('area_id', $ids);
        if ($ids = array_filter((array) $request->owner_id, 'is_numeric'))             $query->whereIn('owner_id', $ids);
        // السوم — "1" keeps only listings that have a bid, "0" only those with
        // none. Anything else (absent, "") means الكل and filters nothing, so an
        // unset dropdown cannot accidentally narrow the list.
        if (in_array($request->has_soums, ['0', '1'], true)) {
            $request->has_soums === '1'
                ? $query->whereHas('soums')
                : $query->whereDoesntHave('soums');
        }
        if (is_numeric($request->min_area)) $query->where('area', '>=', (float) $request->min_area);
        if (is_numeric($request->max_area)) $query->where('area', '<=', (float) $request->max_area);
        if ($request->search) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('property_code', 'like', "%{$search}%")
                  // address is derived from the governorate/area names now.
                  ->orWhereHas('governorateLookup', fn ($g) => $g->where('name', 'like', "%{$search}%"))
                  ->orWhereHas('areaLookup', fn ($a) => $a->where('name', 'like', "%{$search}%"));
            });
        }

        $this->applySort($query, $request->sort);

        // Dropdowns need the whole filtered set, not just the first list page —
        // capped so a bad `per_page` can't pull the entire table.
        $perPage = is_numeric($request->per_page) ? min(max((int) $request->per_page, 1), 500) : 20;

        return response()->json($query->paginate($perPage));
    }

    /**
     * Base query for the option payload: only the columns a combobox renders,
     * and only the two relations `address` / `owner_name` are derived from. The
     * ten relations index() eager-loads would be ~99% waste here.
     */
    private function optionQuery()
    {
        return Property::query()
            ->select(['id', 'property_code', 'name', 'property_type', 'owner_id', 'tenant_id', 'governorate_id', 'area_id', 'created_at'])
            ->with(['owner:id,full_name']); //'governorateLookup:id,name', 'areaLookup:id,name']);
    }

    /**
     * GET /properties/options — slim, capped list for the property dropdowns.
     *
     * Search runs server-side so the client never holds the whole table. The
     * result is capped at `limit` (default 50), which is why `include` exists:
     * the property already on a contract being edited is usually no longer متاح
     * and would fall outside both the filters and the cap, leaving its own form
     * field blank. It is fetched unfiltered and prepended. `limit=0` asks for
     * that row alone — how a form hydrates its current selection on open.
     */
    public function options(Request $request)
    {
        $limit   = is_numeric($request->limit) ? min(max((int) $request->limit, 0), 100) : 50;
        $include = is_numeric($request->include) ? (int) $request->include : null;

        $rows = collect();

        if ($limit > 0) {
            $query = $this->optionQuery();

            if ($request->listing_type) $query->where('listing_type', Property::listingTypeValue($request->listing_type));
            if ($ids = $this->lookupIds(PropertyStatus::class, $request->status)) $query->whereIn('property_status_id', $ids);
            // Presence-checked, not truthy-checked: `has_contract=0` is the useful
            // half of this filter — the contract form wants the not-yet-contracted.
            if ($request->has('has_contract')) $query->where('has_contract', $request->boolean('has_contract'));
            if ($request->search) {
                $search = $request->search;
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('property_code', 'like', "%{$search}%");
                      // address is derived from the governorate/area names.
                      //->orWhereHas('governorateLookup', fn ($g) => $g->where('name', 'like', "%{$search}%"))
                      //->orWhereHas('areaLookup', fn ($a) => $a->where('name', 'like', "%{$search}%"));
                });
            }
            // Excluded here so the prepended copy below is not a duplicate.
            if ($include) $query->where('id', '!=', $include);

            $rows = $query->latest()->limit($limit)->get();
        }

        if ($include && $row = $this->optionQuery()->whereKey($include)->first()) {
            $rows->prepend($row);
        }

        return response()->json($rows->map(fn ($p) => [
            'id'            => $p->id,
            'property_code' => $p->property_code,
            'name'          => $p->name,
            'address'       => $p->address,
            'property_type' => $p->property_type,
            'owner_name'    => $p->owner?->full_name ?? '',
            // The id alone — the contract form fetches the client itself, because
            // it also needs the `type` that decides the company document slots.
            'tenant_id'     => $p->tenant_id,
        ])->values());
    }

    /**
     * Apply the list ordering. Only whitelisted values are honoured; anything
     * else (including a missing `sort`) falls back to newest-first on created_at.
     * Property-code ordering is natural rather than lexicographic — the numeric
     * part drives it, so P-9 comes before P-10.
     */
    private function applySort($query, $sort): void
    {
        switch ($sort) {
            case 'oldest':
                $query->oldest();
                break;

            case 'code_asc':
            case 'code_desc':
                $dir = $sort === 'code_asc' ? 'asc' : 'desc';
                $query->orderByRaw("CAST(REGEXP_REPLACE(property_code, '[^0-9]', '') AS UNSIGNED) {$dir}")
                      ->orderBy('property_code', $dir);
                break;

            default:
                $query->latest();
        }
    }

    /**
     * Suggest the next free property code for the add form: the highest number
     * appearing in an existing code *of the same listing type*, + 1.
     *
     * إيجار and بيع run their own series — each starts at 1 and neither is pushed
     * forward by the other — which is why `listing_type` is required rather than
     * defaulted: guessing it would quietly hand out a code from the wrong series.
     * The uniqueness that backs this is the (listing_type, property_code) index,
     * so the same number legitimately exists once on each side.
     *
     * The number is extracted by stripping every non-digit rather than by
     * matching the `P-<n>` convention the add_property_code migration seeds, so
     * hand-entered codes in other shapes ("PR-12", "12", "P_12") still count
     * towards the maximum instead of being skipped. This is the same expression
     * applySort() orders by, which keeps the suggestion above whatever sorts last
     * under code_desc.
     *
     * The value is only a suggestion — the user may overwrite it before saving,
     * and the unique rule on store() is what actually guarantees no duplicates.
     */
    public function nextCode(Request $request)
    {
        $request->validate(['listing_type' => 'required|in:إيجار,بيع']);
        $listingType = Property::listingTypeValue($request->listing_type);

        $max = (int) Property::where('listing_type', $listingType)
            ->whereRaw("property_code REGEXP '[0-9]'")
            // Codes with no digits at all strip to '' and would cast to 0; skipping
            // them keeps the scan off rows that cannot raise the maximum anyway.
            ->selectRaw("MAX(CAST(REGEXP_REPLACE(property_code, '[^0-9]', '') AS UNSIGNED)) AS max_code")
            ->value('max_code');

        $next = $max + 1;
        // Guard against a manually entered non-numeric-suffix clash (e.g. "P-07")
        // that the MAX() scan above cannot see.
        while (Property::where('listing_type', $listingType)->where('property_code', $next)->exists()) { // 'P-'
            $next++;
        }

        return response()->json(['property_code' => $next]);    //'P-' .
    }

    /**
     * GET /properties/without-contract — properties that changed hands (مؤجر /
     * مباع) but have no contract recorded against them.
     *
     * Feeds a standing section on the notifications page, so it is a live query
     * over the current state rather than a ledger of past events: a property
     * leaves the list the moment its contract is created.
     */
    public function withoutContract()
    {
        $statusIds = PropertyStatus::whereIn('name', ['مؤجر', 'مباع'])->pluck('id');

        $properties = Property::query()
            ->select(['id', 'property_code', 'name', 'listing_type', 'property_status_id', 'governorate_id', 'area_id', 'updated_at'])
            ->with(['propertyStatus:id,name', 'governorateLookup:id,name', 'areaLookup:id,name'])
            ->whereIn('property_status_id', $statusIds)
            ->where('has_contract', false)
            ->latest('updated_at')
            ->get();

        return response()->json($properties->map(fn ($p) => [
            'id'            => $p->id,
            'property_code' => $p->property_code,
            'name'          => $p->name,
            'address'       => $p->address,
            'status'        => $p->status,
            'listing_type'  => $p->listing_type,
            'updated_at'    => $p->updated_at,
        ])->values());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'          => 'required|string',
            // Unique within its own listing type, not across the table: إيجار 1 and
            // بيع 1 are two different properties (see nextCode()).
            'property_code' => ['required', Rule::unique('properties', 'property_code')
                ->where('listing_type', Property::listingTypeValue($request->listing_type))],
            'property_type' => 'required|in:مستقل,متعدد الوحدات',
            'listing_type'  => 'required|in:إيجار,بيع',
            // التصنيف والنشاط are two lists — a property picks from its own side's.
            'category'      => ['required', $this->listingScopedRule(PropertyCat::class, 'property_cats', $request->listing_type)],
            'filmed_by'     => 'nullable|exists:filmed_by,name',
            // حالة البناء is a بيع-only field; a rental save clears it below.
            'building_status' => 'nullable|exists:building_statuses,name',
            'priority'      => 'boolean',
            'activities'    => 'sometimes|array',
            'activities.*'  => $this->listingScopedRule(Activity::class, 'activities', $request->listing_type),
            'owner_id'      => 'required|exists:clients,id',
            'plot_number'   => 'required|string',
            'governorate_id' => 'required|exists:governorates,id',
            'area_id'        => ['required', Rule::exists('areas', 'id')->where('governorate_id', $request->governorate_id)],
            'area'          => 'nullable|numeric',
            'location_link' => 'nullable|url',
            'description'   => 'nullable|string',
            'guard_name'    => 'nullable|string',
            'guard_phone'   => 'nullable|string',
            'broker_id'     => $this->clientRule('وسيط'),
            'manager_id'    => $this->clientRule('مسؤول العقار'),
            'forsale_link'     => 'nullable|url',
            'instagram_link'   => 'nullable|url',
            'whatsapp_link'    => 'nullable|url',
            'marketing_status' => 'boolean',
            'show_soum_in_pdf' => 'boolean',
            'commission'    => 'nullable|numeric',
            'notes'         => 'nullable|string',
            'status'        => 'required|exists:property_statuses,name',
            'rent_amount'   => 'nullable|numeric',
            'price'         => 'nullable|numeric',
            'conditions'    => 'nullable|string',
            'grace_period'  => 'nullable|string',
            'tenant_id'     => $this->clientRule('فرد', 'شركة'),
            'tenant_start'  => 'nullable|date',
            'tenant_end'    => 'nullable|date',
            'sale_date'     => 'nullable|date',
        ]);

        unset($data['activities']);
        $data = $this->clearBuildingStatusForRentals($data, $data['listing_type']);
        if($data['status'] === 'متاح') {
            $data['public_link_enabled'] = $data['public_show_price'] = $data['public_show_location'] = $data['public_show_contact'] = 1;
        } 
        $property = Property::create($data);
        $this->syncActivities($property, $request);

        if ($request->hasFile('attachments')) {
            foreach ($request->file('attachments') as $file) {
                $path = $file->store('properties/' . $property->id, 'public');
                $property->attachments()->create([
                    'file_path' => $path,
                    'file_name' => $file->getClientOriginalName(),
                    'file_type' => $file->getMimeType(),
                ]);
            }
        }

        // Admins are told about the requests this property answers by
        // `matches:alert-admins`, not from here — see routes/console.php.
        return response()->json($property->load(self::PAYLOAD_RELATIONS), 201);
    }

    public function show(Property $property)
    {
        // units.activitiesLookup backs each unit's appended `activities` /
        // `activity` accessors — without it the nested units are an N+1.
        return response()->json($property->load([...self::PAYLOAD_RELATIONS, 'units.activitiesLookup']));
    }

    public function update(Request $request, Property $property)
    {
        // The listing type the property will have after this save — the request's
        // when it is changing it, its current one otherwise. Both the code series
        // and the التصنيف/النشاط lists are scoped to it.
        $listingType = $request->listing_type ?? $property->listing_type;

        $data = $request->validate([
            'name'          => 'sometimes|string',
            'property_code' => ['sometimes', Rule::unique('properties', 'property_code')
                ->where('listing_type', Property::listingTypeValue($listingType))
                ->ignore($property->id)],
            'property_type' => 'sometimes|in:مستقل,متعدد الوحدات',
            'listing_type'  => 'sometimes|in:إيجار,بيع',
            'category'      => ['sometimes', $this->listingScopedRule(PropertyCat::class, 'property_cats', $listingType)],
            'filmed_by'     => 'nullable|exists:filmed_by,name',
            // حالة البناء is a بيع-only field; a rental save clears it below.
            'building_status' => 'nullable|exists:building_statuses,name',
            'priority'      => 'boolean',
            'activities'    => 'sometimes|array',
            'activities.*'  => $this->listingScopedRule(Activity::class, 'activities', $listingType),
            'owner_id'      => 'sometimes|exists:clients,id',
            'plot_number'   => 'sometimes|string',
            'governorate_id' => 'sometimes|exists:governorates,id',
            'area_id'        => ['sometimes', Rule::exists('areas', 'id')->where('governorate_id', $request->governorate_id)],
            'area'          => 'nullable|numeric',
            'location_link' => 'nullable|url',
            'description'   => 'nullable|string',
            'guard_name'    => 'nullable|string',
            'guard_phone'   => 'nullable|string',
            'broker_id'     => $this->clientRule('وسيط'),
            'manager_id'    => $this->clientRule('مسؤول العقار'),
            'forsale_link'     => 'nullable|url',
            'instagram_link'   => 'nullable|url',
            'whatsapp_link'    => 'nullable|url',
            'marketing_status' => 'boolean',
            'show_soum_in_pdf' => 'boolean',
            'commission'    => 'nullable|numeric',
            'notes'         => 'nullable|string',
            'status'        => 'sometimes|exists:property_statuses,name',
            'rent_amount'   => 'nullable|numeric',
            'price'         => 'nullable|numeric',
            'conditions'    => 'nullable|string',
            'grace_period'  => 'nullable|string',
            'tenant_id'     => $this->clientRule('فرد', 'شركة'),
            'tenant_start'  => 'nullable|date',
            'tenant_end'    => 'nullable|date',
            'sale_date'     => 'nullable|date',
        ]);

        unset($data['activities']);

        $data = $this->clearBuildingStatusForRentals($data, $data['listing_type'] ?? $property->listing_type);

        // Moving a property between إيجار and بيع carries its code into the other
        // series, where that number may already be taken — the rule above cannot
        // see that when `property_code` itself is not part of the request, and the
        // (listing_type, property_code) index would reject it as a 500.
        $targetType = Property::listingTypeValue($data['listing_type'] ?? $property->listing_type);
        $targetCode = $data['property_code'] ?? $property->property_code;
        if ($targetType !== Property::listingTypeValue($property->listing_type)
            && Property::where('listing_type', $targetType)->where('property_code', $targetCode)->whereKeyNot($property->id)->exists()) {
            throw ValidationException::withMessages([
                'property_code' => 'رمز العقار مستخدم بالفعل في ' . ($targetType === 1 ? 'البيع' : 'الإيجار') . '.',
            ]);
        }

        if($data['status'] !== 'متاح') {
            $data['public_link_enabled'] = $data['public_show_price'] = $data['public_show_location'] = $data['public_show_contact'] = 0;
        }
        $property->update($data);
        $this->syncActivities($property, $request);

        if ($request->hasFile('attachments')) {
            foreach ($request->file('attachments') as $file) {
                $path = $file->store('properties/' . $property->id, 'public');
                $property->attachments()->create([
                    'file_path' => $path,
                    'file_name' => $file->getClientOriginalName(),
                    'file_type' => $file->getMimeType(),
                ]);
            }
        }

        return response()->json($property->load(self::PAYLOAD_RELATIONS));
    }

    /**
     * Deleting a property is permanent. Its attachments, units and unit images
     * go with it (cascadeOnDelete), so their files are cleared off disk first —
     * the DB rows vanish and nothing would point at them afterwards.
     *
     * Contracts and collections hold restrictOnDelete keys on both the property
     * and its units, so the delete is refused up front rather than surfacing as
     * a raw foreign-key error.
     */
    public function destroy(Property $property)
    {
        $unitIds = $property->units()->pluck('id');

        $blocked = $property->rentalContracts()->exists()
            || $property->saleContracts()->exists()
            || $property->collections()->exists()
            || ($unitIds->isNotEmpty() && (
                RentalContract::whereIn('unit_id', $unitIds)->exists()
                || SaleContract::whereIn('unit_id', $unitIds)->exists()
                || Collection::whereIn('unit_id', $unitIds)->exists()
            ));

        if ($blocked) {
            return response()->json([
                'message' => 'لا يمكن حذف عقار مرتبط بعقد أو تحصيل.'
            ], 422);
        }

        foreach ($property->attachments as $attachment) {
            Storage::disk('public')->delete($attachment->file_path);
        }
        foreach (UnitImage::whereIn('unit_id', $unitIds)->get() as $image) {
            Storage::disk('public')->delete($image->image_path);
        }

        $property->delete();
        return response()->json(['message' => 'تم الحذف.']);
    }

    /**
     * Sync the property's activities (many-to-many) from the request. Only acts
     * when the payload expresses activities intent — the JSON path always sends
     * an `activities` array (possibly empty to clear); the multipart path sends
     * a `sync_activities` flag alongside `activities[]` — so a partial update that
     * omits activities entirely leaves the existing links untouched.
     */
    private function syncActivities(Property $property, Request $request): void
    {
        if (! $request->has('activities') && ! $request->boolean('sync_activities')) {
            return;
        }

        $names = array_filter((array) $request->input('activities', []), 'strlen');
        $ids = $names ? Activity::whereIn('name', $names)->pluck('id')->all() : [];
        $before = $property->activitiesLookup()->pluck('name')->sort()->implode('، ');
        $result = $property->activitiesLookup()->sync($ids);

        // A pivot sync fires no model event, so سجل العقار is written here. A
        // brand-new property's activities are part of its "إضافة" entry.
        if (! $property->wasRecentlyCreated && ($result['attached'] || $result['detached'])) {
            $label = $property->listing_type === 'بيع' ? 'حالة الإشغال' : 'النشاط';
            $after = $property->activitiesLookup()->pluck('name')->sort()->implode('، ');
            PropertyLogger::log($property->id, 'property_updated', "تعديل {$label}", [
                $label => [$before ?: null, $after ?: null],
            ]);
        }
    }

    /** GET /api/properties/{property}/logs — سجل العقار, newest first. */
    public function logs(Property $property)
    {
        $logs = $property->logs()
            ->with(['user:id,name', 'unit:id,unit_number'])
            ->latest('id')
            ->limit(500)
            ->get()
            // Flattened by hand: a serialised User drags its role appends along.
            ->map(fn (PropertyLog $log) => [
                'id'          => $log->id,
                'action'      => $log->action,
                'description' => $log->description,
                'changes'     => $log->changes,
                'unit_number' => $log->unit?->unit_number,
                'user_name'   => $log->user?->name,
                'created_at'  => $log->created_at,
            ]);

        return response()->json($logs);
    }

    /**
     * Canonical property view data for the admin PDF export. Shares the exact
     * field mapping used by the public share link (PublicViewController) via
     * PropertyPresenter, so both stay in sync from one source. Visibility
     * toggles are ignored here since this is an authenticated admin export.
     */
    public function viewData(Property $property)
    {
        return response()->json(PropertyPresenter::detail($property, respectVisibility: false));
    }

    /**
     * Client requests that match this property, so an agent viewing an available
     * property can immediately see who is looking for it. A request matches when
     * it shares the property's listing type (rental↔إيجار, sale↔شراء), category,
     * activity, governorate, area (المحافظة/المنطقة), size (المساحة) and price
     * (السعر), and is not already completed (مكتمل). Size and price are matched
     * exactly by default. A criterion the property never filled in (null
     * activity/governorate/area/size/price) is skipped entirely rather than
     * requiring the request to be null on it too — a blank field narrows nothing.
     *
     * Two optional query params relax the exact size/price match into a ± band
     * (معايير مطابقة اضافية), each independent of the other:
     *   nearest_area=1&area_margin=20   → أقرب مساحة, within ±20% of the property's size
     *   nearest_price=1&price_margin=20 → أقرب سعر, within ±20% of the property's price
     * A margin of 0 (or the flag left off) keeps the exact comparison.
     *
     * Kept in lockstep with PropertyRequestController::matchingProperties — the
     * two are the same rule viewed from either side, so a change to one belongs
     * in the other too.
     */
    public function matchingRequests(Request $request, Property $property, PropertyMatcher $matcher)
    {
        $request->validate([
            'nearest_area'  => 'sometimes|boolean',
            'area_margin'   => 'nullable|numeric|min:0|max:100',
            'nearest_price' => 'sometimes|boolean',
            'price_margin'  => 'nullable|numeric|min:0|max:100',
        ]);

        $query = $matcher->requestsFor(
            $property,
            $request->boolean('nearest_area') ? (float) $request->input('area_margin', 0) : null,
            $request->boolean('nearest_price') ? (float) $request->input('price_margin', 0) : null,
        );

        return response()->json($query->latest()->get());
    }

    /**
     * Return the property's image attachments as base64 data URIs so the
     * frontend can embed them in a client-side generated PDF without hitting
     * cross-origin canvas-taint issues (storage files are not served with CORS).
     */
    public function attachmentsBase64(Property $property)
    {
        $images = $property->attachments()
            ->get()
            ->filter(fn ($a) => str_starts_with((string) $a->file_type, 'image/'))
            ->map(function ($a) {
                if (!Storage::disk('public')->exists($a->file_path)) {
                    return null;
                }
                $data = base64_encode(Storage::disk('public')->get($a->file_path));
                return [
                    'id'        => $a->id,
                    'file_name' => $a->file_name,
                    'data_url'  => "data:{$a->file_type};base64,{$data}",
                ];
            })
            ->filter()
            ->values();

        return response()->json($images);
    }

    public function destroyAttachment(Property $property, PropertyAttachment $attachment)
    {
        // Guard against deleting an attachment that belongs to another property.
        if ($attachment->property_id !== $property->id) {
            return response()->json(['message' => 'المرفق لا يخص هذا العقار.'], 403);
        }

        Storage::disk('public')->delete($attachment->file_path);
        $attachment->delete();

        return response()->json(['message' => 'تم حذف المرفق.']);
    }

    public function toggleLink(Property $property)
    {
        $property->update(['public_link_enabled' => !$property->public_link_enabled]);
        return response()->json(['public_link_enabled' => $property->public_link_enabled]);
    }

    public function linkSettings(Request $request, Property $property)
    {
        $data = $request->validate([
            'public_show_price'    => 'boolean',
            'public_show_location' => 'boolean',
            'public_show_contact'  => 'boolean',
        ]);
        $property->update($data);
        return response()->json($property);
    }
}
