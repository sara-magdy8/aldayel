<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A سوم (bid) placed on a property.
 */
class Soum extends Model
{
    use HasFactory;

    protected $fillable = [
        'property_id', 'bidder_name', 'soum_date', 'amount',
        'soum_type', 'broker_name', 'broker_phone',
        // Set by the controller from the authenticated user, never from input.
        'created_by',
    ];

    // The creator is flattened to a name: the full User payload (role appends)
    // has no business in a bid row.
    protected $appends = ['created_by_name'];

    protected $hidden = ['creator'];

    protected $casts = [
        // Format-pinned on purpose. A bare `date` cast serialises to UTC, and the
        // app runs on Asia/Kuwait — midnight here is 21:00 the day before in UTC,
        // so the JSON would carry the wrong day.
        'soum_date' => 'date:Y-m-d',
        'amount'    => 'decimal:3',
    ];

    // ── soum_type <-> boolean (0=>مباشر, 1=>غير مباشر) ─────────
    // Stored numeric, read as its Arabic label — same shape as
    // Property::listing_type, so the API speaks the UI's language.

    /** The only type that carries broker data. */
    public const TYPE_INDIRECT = 'غير مباشر';

    public static function typeValue($value): int
    {
        if (is_bool($value) || is_numeric($value)) {
            return (int) $value ? 1 : 0;
        }

        return $value === self::TYPE_INDIRECT ? 1 : 0;
    }

    public function getSoumTypeAttribute($value): string
    {
        return (int) $value === 1 ? self::TYPE_INDIRECT : 'مباشر';
    }

    public function setSoumTypeAttribute($value): void
    {
        $this->attributes['soum_type'] = self::typeValue($value);
    }

    public function property()
    {
        return $this->belongsTo(Property::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function getCreatedByNameAttribute(): ?string
    {
        return $this->creator?->name;
    }
}
