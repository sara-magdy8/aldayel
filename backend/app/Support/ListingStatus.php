<?php

namespace App\Support;

use App\Models\ContractStatus;
use App\Models\Property;
use App\Models\RentalContract;
use App\Models\SaleContract;
use App\Models\Unit;

/**
 * Keeps a listing's status (متاح / محجوز / مؤجر / مباع) in step with the
 * contracts that reference it.
 *
 * The status is *derived*, never toggled: every entry point recomputes it from
 * every live contract pointing at the listing. That is what lets a claim be
 * released — cancelling, deleting, or repointing a contract simply removes it
 * from the calculation, and whatever the remaining contracts justify is written.
 * Writing "متاح" directly would be wrong whenever a second contract still holds
 * the listing.
 *
 * A contract that names a unit claims that unit alone; only a contract without
 * one claims the property itself. The two are tracked independently, exactly as
 * the contract models have always treated them.
 */
class ListingStatus
{
    /** Recompute whichever listing a contract points at: its unit, else its property. */
    public static function syncFor($contract): void
    {
        $contract->unit_id
            ? self::syncUnit($contract->unit_id)
            : self::syncProperty($contract->property_id);
    }

    /**
     * Recompute the listing a contract pointed at *before* the save that just
     * happened. An edit that moves a contract to another property — or off the
     * property onto one of its units — would otherwise leave the old target
     * holding a claim nothing backs any more.
     */
    public static function syncPrevious($contract): void
    {
        if (! $contract->wasChanged('property_id') && ! $contract->wasChanged('unit_id')) {
            return;
        }

        // Mirrors syncFor()'s choice, but against the pre-save values.
        $previousUnit = $contract->getOriginal('unit_id');

        $previousUnit
            ? self::syncUnit($previousUnit)
            : self::syncProperty($contract->getOriginal('property_id'));
    }

    public static function syncProperty($propertyId): void
    {
        if (! $propertyId || ! $property = Property::find($propertyId)) {
            return;
        }

        self::write($property, self::forProperty($propertyId));
    }

    public static function syncUnit($unitId): void
    {
        if (! $unitId || ! $unit = Unit::find($unitId)) {
            return;
        }

        self::write($unit, self::forUnit($unitId));
    }

    /**
     * The status a property's contracts justify, without writing it — for callers
     * that want to compare against what is stored (a reconciliation dry run).
     *
     * Property-level contracts only: one naming a unit speaks for that unit.
     */
    public static function forProperty($propertyId): string
    {
        return self::resolve(fn ($q) => $q->where('property_id', $propertyId)->whereNull('unit_id'));
    }

    /** The status a unit's contracts justify, without writing it. */
    public static function forUnit($unitId): string
    {
        return self::resolve(fn ($q) => $q->where('unit_id', $unitId));
    }

    /** Write the resolved status, skipping the update when nothing moved. */
    private static function write($listing, string $status): void
    {
        if ($listing->status !== $status) {
            $listing->update(['status' => $status]);
        }
    }

    /**
     * The strongest claim any live contract makes on the listing.
     *
     * مباع outranks مؤجر outranks محجوز; with no claim at all the listing is
     * free again. A مكتمل sale still holds the property — the sale went through
     * — whereas a مكتمل rental is a finished lease and releases it. ملغي never
     * holds anything, which is what frees a cancelled contract's listing.
     */
    private static function resolve(callable $scope): string
    {
        if ($scope(SaleContract::query())->whereIn('contract_status_id', self::ids(['نشط', 'مكتمل']))->exists()) {
            return 'مباع';
        }

        if ($scope(RentalContract::query())->whereIn('contract_status_id', self::ids(['نشط']))->exists()) {
            return 'مؤجر';
        }

        $draft = self::ids(['مسودة']);

        if ($scope(SaleContract::query())->whereIn('contract_status_id', $draft)->exists()
            || $scope(RentalContract::query())->whereIn('contract_status_id', $draft)->exists()) {
            return 'محجوز';
        }

        return 'متاح';
    }

    /** Lookup ids for contract status names, memoised for the request. */
    private static array $idCache = [];

    private static function ids(array $names): array
    {
        $key = implode('|', $names);

        return self::$idCache[$key] ??= ContractStatus::whereIn('name', $names)->pluck('id')->all();
    }
}
