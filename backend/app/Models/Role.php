<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * الصلاحية — a system user's role.
 *
 * Unlike the display-only lookups (property statuses, payment types), this one is
 * read by authorization, so it is keyed on `slug` rather than on `name`. Checks
 * compare slugs; the UI shows `name`. Renaming the Arabic label is then a purely
 * cosmetic change.
 */
class Role extends Model
{
    /** The role that may manage users and see the admin-only screens. */
    public const ADMIN = 'admin';

    /** The role a user falls back to when none is resolvable. */
    public const STAFF = 'staff';

    protected $fillable = ['slug', 'name'];

    public function users()
    {
        return $this->hasMany(User::class);
    }

    /**
     * Resolve a slug (or an already-numeric id) to the role's id.
     * Memoised per request — every user serialization would otherwise re-query.
     */
    public static function idForSlug($value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return (int) $value;
        }

        return static::slugMap()[$value] ?? null;
    }

    /** @return array<string, int> slug => id */
    private static function slugMap(): array
    {
        static $map = null;

        // An empty result is never cached: a process that asks before the table
        // is seeded (a fresh migrate --seed, a test) would otherwise resolve every
        // slug to null for the rest of its life.
        if ($map === null || $map === []) {
            $map = static::query()->pluck('id', 'slug')->all();
        }

        return $map;
    }
}
