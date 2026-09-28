<?php

namespace App\Http\Controllers;

use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

abstract class Controller
{
    /**
     * An `exists` rule on one of the lookups kept as two lists (التصنيفات والنشاط),
     * narrowed to the side the record belongs to — so a rental property cannot be
     * given a category that only the sale list offers, and vice versa.
     *
     * @param  class-string  $model  A model using the ScopedToListingType trait.
     * @param  string  $table  The lookup table the rule checks against.
     * @param  mixed  $listingType  إيجار / بيع / شراء / 1 / 0.
     */
    protected function listingScopedRule(string $model, string $table, $listingType)
    {
        return Rule::exists($table, 'name')->where($model::listingColumn($listingType), true);
    }
    /**
     * Normalise a filter value into a clean list of terms. Accepts a single
     * value or an array (multi-select), drops null/empty and the "الكل" (all)
     * sentinel, and de-duplicates.
     */
    protected function filterTerms($value): Collection
    {
        return collect(is_array($value) ? $value : [$value])
            ->reject(fn ($v) => $v === null || $v === '' || $v === 'الكل')
            ->unique()
            ->values();
    }

    /**
     * Resolve filter value(s) to lookup-table ids via the model's idForName().
     * Returns a de-duplicated list of ids (unresolved names are dropped), or an
     * empty array when there is nothing to filter by.
     *
     * @param  class-string  $model  A model using the IsLookup trait.
     */
    protected function lookupIds(string $model, $value): array
    {
        return $this->filterTerms($value)
            ->map(fn ($v) => $model::idForName($v))
            ->filter(fn ($id) => $id !== null)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Map filter value(s) through a value-mapper callback (e.g.
     * Property::listingTypeValue) into a de-duplicated list, or an empty array
     * when there is nothing to filter by.
     */
    protected function mappedValues(callable $mapper, $value): array
    {
        return $this->filterTerms($value)
            ->map($mapper)
            ->unique()
            ->values()
            ->all();
    }
}
