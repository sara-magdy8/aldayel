<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Str;

class Unit extends Model
{
    use HasFactory;

    protected $fillable = [
        'property_id', 'unit_number', 'unit_type', 'property_cat_id', 'floor',
        'area', 'rooms_count', 'price', 'listing_type', 'status', 'property_status_id', 'notes',
        'description', 'conditions', 'grace_period',
        'public_link_token', 'public_link_enabled',
        'public_show_price', 'public_show_location', 'public_show_contact',
    ];

    protected $casts = [
        'public_link_enabled'  => 'boolean',
        'public_show_price'    => 'boolean',
        'public_show_location' => 'boolean',
        'public_show_contact'  => 'boolean',
    ];

    /** Expose the lookup names as `unit_type` / `status` / `activities` / `activity`. */
    protected $appends = ['unit_type', 'status', 'activities', 'activity'];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($unit) {
            if (!$unit->public_link_token) {
                $unit->public_link_token = Str::uuid();
            }
        });
    }

    public function propertyCat()
    {
        return $this->belongsTo(PropertyCat::class);
    }

    public function getUnitTypeAttribute(): ?string
    {
        return $this->propertyCat?->name;
    }

    public function setUnitTypeAttribute($value): void
    {
        // property_cat_id is nullable — units created in bulk carry activities
        // instead of a type, so an empty value must clear rather than fail.
        $this->attributes['property_cat_id'] = $value === null || $value === ''
            ? null
            : PropertyCat::idForName($value);
    }

    // ── activities (many-to-many via activity_unit) ────────────
    // Named *Lookup to avoid colliding with the appended `activities` /
    // `activity` name accessors, matching the convention on Property.
    public function activitiesLookup()
    {
        return $this->belongsToMany(Activity::class, 'activity_unit', 'unit_id', 'activity_id');
    }

    /** The activity names as an array — the canonical multi-value field. */
    public function getActivitiesAttribute(): array
    {
        return $this->activitiesLookup->pluck('name')->all();
    }

    /** Backward-compatible single string (activities joined), as on Property. */
    public function getActivityAttribute(): ?string
    {
        $names = $this->activities;
        return count($names) ? implode('، ', $names) : null;
    }

    /** Replace this unit's activities from a list of activity names. */
    public function syncActivityNames(?array $names): void
    {
        $ids = $names ? Activity::whereIn('name', $names)->pluck('id')->all() : [];
        $this->activitiesLookup()->sync($ids);
    }

    // ── status <-> property_statuses (masculine: متاح/محجوز/مؤجر/مباع) ──
    public function propertyStatus()
    {
        return $this->belongsTo(PropertyStatus::class);
    }

    public function getStatusAttribute(): ?string
    {
        return $this->propertyStatus?->name;
    }

    public function setStatusAttribute($value): void
    {
        $this->attributes['property_status_id'] = PropertyStatus::idForName($value);
    }

    // ── listing_type <-> boolean (0=>إيجار, 1=>بيع) ────────────
    public static function listingTypeValue($value): int
    {
        if (is_bool($value) || is_numeric($value)) {
            return (int) $value ? 1 : 0;
        }
        return $value === 'بيع' ? 1 : 0;
    }

    public function getListingTypeAttribute($value): string
    {
        return (int) $value === 1 ? 'بيع' : 'إيجار';
    }

    public function setListingTypeAttribute($value): void
    {
        $this->attributes['listing_type'] = self::listingTypeValue($value);
    }

    public function property()
    {
        return $this->belongsTo(Property::class);
    }

    public function images()
    {
        return $this->hasMany(UnitImage::class);
    }

    public function rentalContracts()
    {
        return $this->hasMany(RentalContract::class);
    }

    public function saleContracts()
    {
        return $this->hasMany(SaleContract::class);
    }

    public function collections()
    {
        return $this->hasMany(Collection::class);
    }
}
