<?php

namespace App\Models\Concerns;

/**
 * Shared behaviour for the small lookup tables (id + name).
 * Lets domain models resolve a human name to its lookup id and back.
 */
trait IsLookup
{
    /** Resolve a name (or an already-numeric id) to the lookup row id. */
    public static function idForName($value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }

        return static::query()->where('name', $value)->value('id');
    }

    /** Resolve a lookup id back to its name. */
    public static function nameForId($id): ?string
    {
        return $id === null ? null : static::query()->whereKey($id)->value('name');
    }
}
