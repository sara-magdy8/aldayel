<?php

namespace App\Models\Concerns;

/**
 * Shared behaviour for the lookup tables kept as two lists — one for الإيجار and
 * one for البيع (التصنيفات والنشاط).
 *
 * A row is one row with one id; which of the two lists it appears in is carried
 * by the `for_rental` / `for_sale` flags. A row may be in both, which is how a
 * category like "شقة" serves both sides without becoming two ids that reports and
 * the property/request matcher would then have to reconcile.
 */
trait ScopedToListingType
{
    /**
     * The flag column for a listing type, accepting every spelling the app uses:
     * the property side's بيع / إيجار, the request side's شراء / إيجار, and the
     * stored 1 / 0.
     */
    public static function listingColumn($listingType): string
    {
        $isSale = is_bool($listingType) || is_numeric($listingType)
            ? (int) $listingType === 1
            : in_array($listingType, ['بيع', 'شراء'], true);

        return $isSale ? 'for_sale' : 'for_rental';
    }

    /** Restrict the query to the rows shown for one listing type. */
    public function scopeForListing($query, $listingType)
    {
        return $query->where(static::listingColumn($listingType), true);
    }
}
