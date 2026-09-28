<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Client;
use App\Models\PropertyCat;
use App\Models\PropertyRequest;
use App\Models\RequestStatus;
use App\Services\PropertyMatcher;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PropertyRequestController extends Controller
{
    /** Relations every request payload needs; `broker` backs the appended broker_name/phone. */
    private const PAYLOAD_RELATIONS = [
        'client', 'broker', 'requestStatus', 'propertyCat',
        'activitiesLookup', 'governorateLookup', 'areasLookup',
    ];

    /** الوسيط is a client of type وسيط — must exist and carry that type. */
    private function brokerRule(): array
    {
        return ['nullable', Rule::exists('clients', 'id')
            ->where('type', Client::typeValue('وسيط'))];
    }

    /**
     * المنطقة — every area named on a request must belong to its single
     * governorate, the same constraint the old single `area_id` carried.
     *
     * A partial update need not resend `governorate_id`, so the stored one stands
     * in when the payload omits it; without that fallback each area would be
     * checked against a null governorate and none would pass.
     */
    private function areaRule(Request $request, ?int $currentGovernorateId = null): array
    {
        $governorateId = $request->has('governorate_id') ? $request->governorate_id : $currentGovernorateId;

        return ['integer', Rule::exists('areas', 'id')->where('governorate_id', $governorateId)];
    }

    public function index(Request $request)
    {
        $query = PropertyRequest::with(self::PAYLOAD_RELATIONS);

        if ($ids = $this->lookupIds(RequestStatus::class, $request->status)) $query->whereIn('request_status_id', $ids);
        if ($vals = $this->mappedValues([PropertyRequest::class, 'requestTypeValue'], $request->request_type)) $query->whereIn('request_type', $vals);
        if ($activityIds = $this->filterTerms($request->activity_id)->all()) {
            $query->whereHas('activitiesLookup', fn ($q) => $q->whereIn('activities.id', $activityIds));
        } elseif ($names = array_filter((array) $request->activity, 'strlen')) {
            $query->whereHas('activitiesLookup', fn ($q) => $q->whereIn('name', $names));
        }
        if ($govIds = $this->filterTerms($request->governorate_id)->all())  $query->whereIn('governorate_id', $govIds);
        // Areas are a set now: a request matches the filter when any of its areas
        // was picked (the param keeps its name — the filter's meaning is unchanged).
        if ($areaIds = $this->filterTerms($request->area_id)->all()) {
            $query->whereHas('areasLookup', fn ($q) => $q->whereIn('areas.id', $areaIds));
        }
        if ($request->search) {
            $query->whereHas('client', fn ($q) =>
                $q->where('full_name', 'like', "%{$request->search}%")
            );
        }
        if (is_numeric($request->min_area)) $query->where('area', '>=', (float) $request->min_area);
        if (is_numeric($request->max_area)) $query->where('area', '<=', (float) $request->max_area);

        // Page size comes from the table's "عرض N سجل" dropdown; capped so a bad
        // `per_page` can't pull the entire table.
        $perPage = is_numeric($request->per_page) ? min(max((int) $request->per_page, 1), 500) : 20;

        return response()->json($query->latest()->paginate($perPage));
    }

    /**
     * Available properties that match this request, so an agent viewing an open
     * request can immediately see what to offer. A property matches when it shares
     * the request's listing type (إيجار↔rental, شراء↔sale), category, activity,
     * governorate, area (المحافظة/المنطقة), size (المساحة) and price (السعر), and
     * is currently available (متاح). Size and price are matched exactly by default.
     * A criterion the request never filled in (null activity/governorate/area/
     * size/price) is skipped entirely rather than requiring the property to be
     * null on it too — an unstated preference narrows nothing.
     *
     * Two optional query params relax the exact size/price match into a ± band
     * (معايير مطابقة اضافية), each independent of the other:
     *   nearest_area=1&area_margin=20   → أقرب مساحة, within ±20% of the request's size
     *   nearest_price=1&price_margin=20 → أقرب سعر, within ±20% of the request's price
     * A margin of 0 (or the flag left off) keeps the exact comparison.
     */
    public function matchingProperties(Request $request, PropertyRequest $propertyRequest, PropertyMatcher $matcher)
    {
        $request->validate([
            'nearest_area'  => 'sometimes|boolean',
            'area_margin'   => 'nullable|numeric|min:0|max:100',
            'nearest_price' => 'sometimes|boolean',
            'price_margin'  => 'nullable|numeric|min:0|max:100',
        ]);

        $query = $matcher->propertiesFor(
            $propertyRequest,
            $request->boolean('nearest_area') ? (float) $request->input('area_margin', 0) : null,
            $request->boolean('nearest_price') ? (float) $request->input('price_margin', 0) : null,
        );

        return response()->json($query->latest()->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'client_id'    => 'required|exists:clients,id',
            'request_type' => 'required|in:شراء,إيجار',
            // التصنيف والنشاط are two lists — a شراء request picks from the sale
            // side's, an إيجار request from the rental side's.
            'category'     => ['required', $this->listingScopedRule(PropertyCat::class, 'property_cats', $request->request_type)],
            'activities'   => 'sometimes|array',
            'activities.*' => $this->listingScopedRule(Activity::class, 'activities', $request->request_type),
            'governorate_id' => 'nullable|exists:governorates,id',
            'area_ids'       => 'sometimes|array',
            'area_ids.*'     => $this->areaRule($request),
            'area'         => 'nullable|numeric',
            'price'        => 'nullable|numeric|min:0',
            'broker_id'    => $this->brokerRule(),
            'notes'        => 'nullable|string',
        ]);

        unset($data['activities'], $data['area_ids']);
        $data['status'] = 'جديد';
        $propertyRequest = PropertyRequest::create($data);
        $this->syncActivities($propertyRequest, $request);
        $this->syncAreas($propertyRequest, $request);

        // Admins are told about the matches this request opens up by
        // `matches:alert-admins`, not from here — see routes/console.php.
        return response()->json($propertyRequest->load(self::PAYLOAD_RELATIONS), 201);
    }

    public function show(PropertyRequest $propertyRequest)
    {
        return response()->json($propertyRequest->load(self::PAYLOAD_RELATIONS));
    }

    public function update(Request $request, PropertyRequest $propertyRequest)
    {
        // The type the request will have after this save; the التصنيف/النشاط lists
        // are scoped to it (see store()).
        $requestType = $request->request_type ?? $propertyRequest->request_type;

        $data = $request->validate([
            'client_id'    => 'sometimes|exists:clients,id',
            'request_type' => 'sometimes|in:شراء,إيجار',
            'category'     => ['sometimes', $this->listingScopedRule(PropertyCat::class, 'property_cats', $requestType)],
            'activities'   => 'sometimes|array',
            'activities.*' => $this->listingScopedRule(Activity::class, 'activities', $requestType),
            'governorate_id' => 'nullable|exists:governorates,id',
            'area_ids'       => 'sometimes|array',
            'area_ids.*'     => $this->areaRule($request, $propertyRequest->governorate_id),
            'area'         => 'nullable|numeric',
            'price'        => 'nullable|numeric|min:0',
            'broker_id'    => $this->brokerRule(),
            'notes'        => 'nullable|string',
            'status'       => 'sometimes|exists:request_statuses,name',
        ]);

        unset($data['activities'], $data['area_ids']);
        $propertyRequest->update($data);
        $this->syncActivities($propertyRequest, $request);
        $this->syncAreas($propertyRequest, $request);

        // Areas belong to a governorate, so moving the request to another one
        // leaves any area not resent behind in the wrong governorate. Sent areas
        // were already validated against the new governorate, so this only ever
        // clears the stale ones.
        if ($propertyRequest->wasChanged('governorate_id')) {
            $stale = $propertyRequest->areasLookup();
            // Clearing the governorate leaves no area valid at all; changing it
            // leaves only the areas of the governorate it moved to.
            if ($propertyRequest->governorate_id !== null) {
                $stale->where('areas.governorate_id', '!=', $propertyRequest->governorate_id);
            }
            $propertyRequest->areasLookup()->detach($stale->pluck('areas.id')->all());
        }

        return response()->json($propertyRequest->load(self::PAYLOAD_RELATIONS));
    }

    public function destroy(PropertyRequest $propertyRequest)
    {
        $propertyRequest->delete();
        return response()->json(['message' => 'تم الحذف.']);
    }

    /**
     * Sync the request's activities (many-to-many) from the request payload. Only
     * acts when an `activities` array is present (possibly empty to clear), so a
     * partial update that omits activities leaves the existing links untouched.
     */
    private function syncActivities(PropertyRequest $propertyRequest, Request $request): void
    {
        if (! $request->has('activities')) {
            return;
        }

        $names = array_filter((array) $request->input('activities', []), 'strlen');
        $ids = $names ? Activity::whereIn('name', $names)->pluck('id')->all() : [];
        $propertyRequest->activitiesLookup()->sync($ids);
    }

    /**
     * Sync the request's areas (many-to-many) from the payload. Like activities,
     * it only acts when `area_ids` is present — possibly empty, which clears them
     * — so a partial update that omits areas leaves the existing links alone.
     *
     * Ids come by id rather than by name because area names are not unique across
     * governorates, and the form already holds the ids from the lookup list.
     */
    private function syncAreas(PropertyRequest $propertyRequest, Request $request): void
    {
        if (! $request->has('area_ids')) {
            return;
        }

        $ids = array_filter((array) $request->input('area_ids', []), 'is_numeric');
        $propertyRequest->areasLookup()->sync($ids);
    }
}
