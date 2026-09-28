<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Property;
use App\Models\PropertyCat;
use App\Models\Unit;
use App\Models\UnitImage;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;

class UnitController extends Controller
{
    /** Shown when a unit number is already taken within the same property. */
    private const DUPLICATE_NUMBER_MESSAGE = 'رقم الوحدة مستخدم بالفعل في هذا العقار.';

    /**
     * A unit number only has to be unique within its own property.
     */
    private function uniqueNumberRule(int $propertyId, ?int $ignoreUnitId = null): Unique
    {
        $rule = Rule::unique('units', 'unit_number')
            ->where(fn ($query) => $query->where('property_id', $propertyId));

        return $ignoreUnitId ? $rule->ignore($ignoreUnitId) : $rule;
    }

    public function index(Property $property)
    {
        // activitiesLookup is eager-loaded because the appended `activities` /
        // `activity` accessors read it — without this the list is an N+1.
        return response()->json(
            $property->units()->with(['images', 'propertyCat', 'propertyStatus', 'activitiesLookup'])->get()
        );
    }

    /**
     * The free-text fields the form clears by submitting an empty string
     * (an omitted key would leave the stored value untouched). Stored as null
     * so "no value" is one thing in the database rather than two.
     */
    private function blanksToNull(array $data): array
    {
        foreach (['description', 'conditions', 'grace_period'] as $key) {
            if (array_key_exists($key, $data) && $data[$key] === '') {
                $data[$key] = null;
            }
        }

        return $data;
    }

    /**
     * Drop blank entries from the submitted activities list. Multipart bodies
     * cannot express an empty array, so the client sends a single empty
     * `activities[]` value to mean "no activities" — without this it would trip
     * the `exists` rule.
     */
    private function normaliseActivities(Request $request): void
    {
        if (! $request->has('activities')) {
            return;
        }

        $request->merge([
            'activities' => array_values(array_filter(
                (array) $request->input('activities'),
                fn ($name) => is_string($name) && $name !== ''
            )),
        ]);
    }

    public function store(Request $request, Property $property)
    {
        $this->normaliseActivities($request);

        // التصنيف/النشاط come from the property's side, not the unit's own نوع
        // العرض: the unit's flag says how this one unit is offered, while the
        // lists belong to the listing the units sit under.
        $listingType = $property->listing_type;

        $data = $request->validate([
            'unit_number'  => ['required', 'string', $this->uniqueNumberRule($property->id)],
            // Optional since units may be created in bulk without a type.
            'unit_type'    => ['nullable', $this->listingScopedRule(PropertyCat::class, 'property_cats', $listingType)],
            'activities'   => 'nullable|array',
            'activities.*' => ['string', $this->listingScopedRule(Activity::class, 'activities', $listingType)],
            'floor'        => 'nullable|string',
            'area'         => 'nullable|numeric',
            'rooms_count'  => 'nullable|integer',
            'price'        => 'nullable|numeric',
            'listing_type' => 'required|in:إيجار,بيع',
            'status'       => 'required|exists:property_statuses,name',
            'notes'        => 'nullable|string',
            'description'  => 'nullable|string',
            'conditions'   => 'nullable|string',
            'grace_period' => 'nullable|string',
        ], ['unit_number.unique' => self::DUPLICATE_NUMBER_MESSAGE]);

        // activities lives in a pivot, not on the units row.
        $activities = Arr::pull($data, 'activities');
        $data = $this->blanksToNull($data);

        // فترة السماح is rental-only.
        if ($data['listing_type'] === 'بيع') {
            $data['grace_period'] = null;
        }

        $data['property_id'] = $property->id;
        $unit = Unit::create($data);
        $unit->syncActivityNames($activities);

        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $image) {
                $path = $image->store('units/' . $unit->id, 'public');
                $unit->images()->create(['image_path' => $path]);
            }
        }

        return response()->json($unit->load('images', 'propertyCat', 'propertyStatus', 'activitiesLookup'), 201);
    }

    public function show(Unit $unit)
    {
        return response()->json($unit->load(['property', 'images', 'propertyCat', 'propertyStatus', 'activitiesLookup']));
    }

    public function update(Request $request, Unit $unit)
    {
        $this->normaliseActivities($request);

        // The property's listing type, as in store() — changing the unit's own
        // نوع العرض does not move it to the other side's lists.
        $listingType = $unit->property->listing_type;

        $data = $request->validate([
            'unit_number'  => ['sometimes', 'string', $this->uniqueNumberRule($unit->property_id, $unit->id)],
            'unit_type'    => ['sometimes', 'nullable', $this->listingScopedRule(PropertyCat::class, 'property_cats', $listingType)],
            'activities'   => 'sometimes|nullable|array',
            'activities.*' => ['string', $this->listingScopedRule(Activity::class, 'activities', $listingType)],
            'floor'        => 'nullable|string',
            'area'         => 'nullable|numeric',
            'rooms_count'  => 'nullable|integer',
            'price'        => 'nullable|numeric',
            'listing_type' => 'sometimes|in:إيجار,بيع',
            'status'       => 'sometimes|exists:property_statuses,name',
            'notes'        => 'nullable|string',
            'description'  => 'nullable|string',
            'conditions'   => 'nullable|string',
            'grace_period' => 'nullable|string',
        ], ['unit_number.unique' => self::DUPLICATE_NUMBER_MESSAGE]);

        // activities lives in a pivot, not on the units row. Only touched when
        // the key was sent, so a partial update cannot silently clear it.
        $hasActivities = array_key_exists('activities', $data);
        $activities = Arr::pull($data, 'activities');
        $data = $this->blanksToNull($data);

        // فترة السماح is rental-only: switching a unit to بيع drops any value
        // it carried, so a stale grace period cannot survive on a sale unit.
        $listingType = $data['listing_type'] ?? $unit->listing_type;
        if ($listingType === 'بيع') {
            $data['grace_period'] = null;
        }

        $unit->update($data);

        if ($hasActivities) {
            $unit->syncActivityNames($activities);
        }

        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $image) {
                $path = $image->store('units/' . $unit->id, 'public');
                $unit->images()->create(['image_path' => $path]);
            }
        }

        return response()->json($unit->load('images', 'activitiesLookup'));
    }

    /**
     * Deleting a unit is permanent, and its images cascade with it — so their
     * files are cleared off disk first. Contracts and collections hold
     * restrictOnDelete keys on the unit, so those are refused up front rather
     * than surfacing as a raw foreign-key error.
     */
    public function destroy(Unit $unit)
    {
        if ($unit->rentalContracts()->exists()
            || $unit->saleContracts()->exists()
            || $unit->collections()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف وحدة مرتبطة بعقد أو تحصيل.'
            ], 422);
        }

        foreach ($unit->images as $image) {
            Storage::disk('public')->delete($image->image_path);
        }

        $unit->delete();
        return response()->json(['message' => 'تم الحذف.']);
    }

    public function toggleLink(Unit $unit)
    {
        $unit->update(['public_link_enabled' => !$unit->public_link_enabled]);
        return response()->json(['public_link_enabled' => $unit->public_link_enabled]);
    }

    public function linkSettings(Request $request, Unit $unit)
    {
        $data = $request->validate([
            'public_show_price'    => 'boolean',
            'public_show_location' => 'boolean',
            'public_show_contact'  => 'boolean',
        ]);
        $unit->update($data);
        return response()->json($unit);
    }

    public function destroyImage(Unit $unit, UnitImage $image)
    {
        // Guard against deleting an image that belongs to another unit.
        if ($image->unit_id !== $unit->id) {
            return response()->json(['message' => 'الصورة لا تخص هذه الوحدة.'], 403);
        }

        Storage::disk('public')->delete($image->image_path);
        $image->delete();

        return response()->json(['message' => 'تم حذف الصورة.']);
    }

    /**
     * Create N identical units under a property. The screen collects activities
     * rather than a unit type, so property_cat_id is left unset (nullable) and
     * each unit gets the same activity set.
     */
    public function bulkCreate(Request $request)
    {
        $request->validate([
            'property_id'   => 'required|exists:properties,id',
            'count'         => 'required|integer|min:1|max:100',
            'listing_type'  => 'required|in:إيجار,بيع',
            'activities'    => 'nullable|array',
            'activities.*'  => 'string|exists:activities,name',
            'floor'         => 'nullable|string',
            'price'         => 'nullable|numeric',
        ]);

        // Resolved once rather than per unit — the whole batch shares one set.
        $activityIds = $request->activities
            ? Activity::whereIn('name', $request->activities)->pluck('id')->all()
            : [];

        $units = [];
        for ($i = 1; $i <= $request->count; $i++) {
            $unit = Unit::create([
                'property_id'  => $request->property_id,
                'unit_number'  => 'وحدة ' . $i,
                'listing_type' => $request->listing_type,
                'floor'        => $request->floor,
                'price'        => $request->price,
                'status'       => 'متاح',
            ]);

            if ($activityIds) {
                $unit->activitiesLookup()->attach($activityIds);
            }

            $units[] = $unit->load('activitiesLookup');
        }

        return response()->json(['created' => count($units), 'units' => $units], 201);
    }
}
