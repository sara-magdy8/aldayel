<?php

namespace App\Services;

use App\Models\Property;
use App\Models\PropertyRequest;
use App\Models\PropertyStatus;
use App\Models\RequestStatus;
use Illuminate\Database\Eloquent\Builder;

/**
 * The single definition of what "matching" means between a property and a request.
 *
 * A property and a request match when they share the listing type (إيجار↔rental,
 * شراء↔sale), category, activity, governorate, area (المحافظة/المنطقة), size
 * (المساحة) and price (السعر). Listing type and category are always filled in, so
 * they are plain equality. The rest are optional, and an unstated one narrows
 * nothing on either side: a criterion the source record never filled in is skipped
 * entirely, and a criterion the *other* side left null still matches, since it
 * states no preference to contradict. So each filled-in optional criterion reads
 * `column = value OR column IS NULL`.
 *
 * That symmetry is the point — it is what makes the two directions agree. If a
 * null on the matched side excluded the row, a request with no price would match
 * every property while none of those properties would match it back, and the same
 * pair would appear in one list but not the other. Each criterion is grouped on
 * its own (`AND (col = value OR col IS NULL)`); a bare orWhere here would OR
 * itself against every preceding filter and dissolve them.
 *
 * النشاط and المنطقة are sets on the request side (a request may name several
 * areas the client would accept), so those two read as an overlap rather than an
 * equality — same rule, one side of it widened from a value to a set.
 *
 * The rule is read from three places now — both matching endpoints and the
 * scheduled admin alert — so it lives here rather than in whichever controller
 * happened to need it first. The two directions below are the same rule viewed
 * from either side; a change to one belongs in the other.
 *
 * Note the two are not interchangeable filters: propertiesFor() requires the
 * property be available (متاح) but says nothing about the request's own status,
 * while requestsFor() excludes completed (مكتمل) requests but says nothing about
 * the property's. A caller that wants both — as the scheduled alert does — has to
 * apply the other side itself.
 */
class PropertyMatcher
{
    /** Relations a matched property needs for a payload or a mail. */
    public const PROPERTY_RELATIONS = [
        'owner', 'broker', 'manager', 'propertyStatus', 'propertyCat',
        'activitiesLookup', 'governorateLookup', 'areaLookup',
    ];

    /** Relations a matched request needs for a payload or a mail. */
    public const REQUEST_RELATIONS = [
        'client', 'broker', 'requestStatus', 'propertyCat',
        'activitiesLookup', 'governorateLookup', 'areasLookup',
    ];

    /**
     * Available properties answering this request, so an agent viewing an open
     * request can immediately see what to offer.
     *
     * A null margin keeps the exact size/price comparison; a margin relaxes it
     * into a ± band of that many percent (see applyNumericMatch).
     */
    public function propertiesFor(
        PropertyRequest $propertyRequest,
        ?float $areaMargin = null,
        ?float $priceMargin = null,
    ): Builder {
        $availableId = PropertyStatus::idForName('متاح');
        $listingType = $propertyRequest->getRawOriginal('request_type');

        $query = Property::with(self::PROPERTY_RELATIONS)
            ->where('listing_type', $listingType)
            ->when($propertyRequest->property_cat_id !== null, fn ($q) => $q->where('property_cat_id', $propertyRequest->property_cat_id))
            ->when($availableId, fn ($q) => $q->where('property_status_id', $availableId));

        // A property matches on activity when its activities overlap the request's;
        // a request with no activities states no preference, so activity is ignored,
        // and a property with no activities states none either, so it still matches.
        $activityIds = $propertyRequest->activitiesLookup->pluck('id')->all();
        if ($activityIds) {
            $query->where(fn ($q) => $q
                ->whereHas('activitiesLookup', fn ($sub) => $sub->whereIn('activities.id', $activityIds))
                ->orWhereDoesntHave('activitiesLookup'));
        }

        if ($propertyRequest->governorate_id !== null) {
            $this->matchOrNull($query, 'governorate_id', $propertyRequest->governorate_id);
        }

        // المنطقة — a request may name several areas, and a property sits in one.
        // It matches when its area is among them, and — by the same symmetry as
        // every other criterion — when it names no area at all.
        $areaIds = $propertyRequest->areasLookup->pluck('id')->all();
        if ($areaIds) {
            $query->where(fn ($q) => $q->whereIn('area_id', $areaIds)->orWhereNull('area_id'));
        }

        // المساحة — both columns are decimal(10,2), so an exact comparison is well defined.
        $this->applyNumericMatch($query, 'area', $propertyRequest->area, $areaMargin);

        // السعر — a request carries one price, but the property side splits it by
        // listing type: rent_amount for إيجار, price for بيع. Both are decimal(10,3).
        $priceColumn = (int) $listingType === 1 ? 'price' : 'rent_amount';
        $this->applyNumericMatch($query, $priceColumn, $propertyRequest->price, $priceMargin);

        return $query;
    }

    /**
     * Open requests this property answers — the mirror of propertiesFor().
     */
    public function requestsFor(
        Property $property,
        ?float $areaMargin = null,
        ?float $priceMargin = null,
    ): Builder {
        $completedId = RequestStatus::idForName('مكتمل');
        $listingType = Property::listingTypeValue($property->listing_type);

        $query = PropertyRequest::with(self::REQUEST_RELATIONS)
            ->where('request_type', $listingType)
            ->when($property->property_cat_id !== null, fn ($q) => $q->where('property_cat_id', $property->property_cat_id))
            ->when($completedId, fn ($q) => $q->where('request_status_id', '!=', $completedId));

        // Overlap on activity: a request matches when its activities intersect the
        // property's; a property with no activities states nothing, so activity is
        // ignored, and a request with no activities states none either, so it stays.
        $activityIds = $property->activitiesLookup->pluck('id')->all();
        if ($activityIds) {
            $query->where(fn ($q) => $q
                ->whereHas('activitiesLookup', fn ($sub) => $sub->whereIn('activities.id', $activityIds))
                ->orWhereDoesntHave('activitiesLookup'));
        }

        if ($property->governorate_id !== null) {
            $this->matchOrNull($query, 'governorate_id', $property->governorate_id);
        }

        // المنطقة — the mirror of the above: the property sits in one area, and a
        // request matches when that area is one of the several it accepts, or when
        // it named no area at all and so states no preference.
        if ($property->area_id !== null) {
            $query->where(fn ($q) => $q
                ->whereHas('areasLookup', fn ($sub) => $sub->where('areas.id', $property->area_id))
                ->orWhereDoesntHave('areasLookup'));
        }

        // المساحة — both columns are decimal(10,2), so an exact comparison is well defined.
        $this->applyNumericMatch($query, 'area', $property->area, $areaMargin);

        // السعر — the property splits its price by listing type (rent_amount for
        // إيجار, price for بيع); a request carries one `price` column. Both are
        // decimal(10,3), so compare whichever side applies against it.
        $propertyPrice = $listingType === 1 ? $property->price : $property->rent_amount;
        $this->applyNumericMatch($query, 'price', $propertyPrice, $priceMargin);

        return $query;
    }

    /**
     * Constrain $column to $value while still accepting rows that left $column
     * null — those state no preference, so they match anything.
     *
     * Grouped into a single nested condition so the OR reaches only this column;
     * left ungrouped it would OR against every other filter on the query.
     */
    protected function matchOrNull($query, string $column, $value): void
    {
        $query->where(fn ($q) => $q->where($column, $value)->orWhereNull($column));
    }

    /**
     * Constrain $column to $value — exactly, or within ±$marginPercent of it when
     * a margin is supplied — and, either way, keep rows whose $column is null.
     *
     * A null $value means the field was never filled in on the source record, so
     * it adds no constraint at all: the criterion is simply ignored.
     */
    protected function applyNumericMatch($query, string $column, $value, ?float $marginPercent): void
    {
        if ($value === null || $value === '') {
            return;
        }

        if ($marginPercent === null || $marginPercent <= 0) {
            $this->matchOrNull($query, $column, $value);
            return;
        }

        $value = (float) $value;
        $delta = abs($value) * $marginPercent / 100;
        $query->where(fn ($q) => $q
            ->whereBetween($column, [$value - $delta, $value + $delta])
            ->orWhereNull($column));
    }
}
