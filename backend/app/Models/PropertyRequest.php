<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class PropertyRequest extends Model
{
    use HasFactory;

    protected $table = 'requests';

    protected $fillable = [
        'client_id', 'request_type', 'category', 'property_cat_id',
        'governorate_id', 'area', 'price', 'broker_id', 'notes', 'status', 'request_status_id',
    ];

    /** Expose lookup names as `status` / `category` / `activities` / location for the API and callers. */
    protected $appends = [
        'status', 'category', 'activities', 'activity', 'governorate',
        'area_ids', 'area_names', 'area_name',
        'broker_name', 'broker_phone_num',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    // ── الوسيط (client of type وسيط) ───────────────────────────
    public function broker()
    {
        return $this->belongsTo(Client::class, 'broker_id');
    }

    /**
     * The free-text `broker` column is gone; the name and phone are read off the
     * linked client instead. Appended because there is no column behind them —
     * eager-load `broker` on list queries to keep that off an N+1.
     */
    public function getBrokerNameAttribute(): ?string
    {
        return $this->broker?->full_name;
    }

    public function getBrokerPhoneNumAttribute(): ?string
    {
        return $this->broker?->phone;
    }

    // ── request_type <-> boolean (0=>إيجار, 1=>شراء) ───────────
    public static function requestTypeValue($value): int
    {
        if (is_bool($value) || is_numeric($value)) {
            return (int) $value ? 1 : 0;
        }
        return $value === 'شراء' ? 1 : 0;
    }

    public function getRequestTypeAttribute($value): string
    {
        return (int) $value === 1 ? 'شراء' : 'إيجار';
    }

    public function setRequestTypeAttribute($value): void
    {
        $this->attributes['request_type'] = self::requestTypeValue($value);
    }

    // ── Lookup relations ───────────────────────────────────────
    public function requestStatus()
    {
        return $this->belongsTo(RequestStatus::class);
    }

    public function propertyCat()
    {
        return $this->belongsTo(PropertyCat::class);
    }

    // Named *Lookup to avoid colliding with the appended `activities` / `activity`
    // name accessors. A request can carry several activities (activity_request).
    public function activitiesLookup()
    {
        return $this->belongsToMany(Activity::class, 'activity_request', 'request_id', 'activity_id');
    }

    // Named *Lookup so they don't collide with the appended `governorate` /
    // `area_name` name accessors below.
    public function governorateLookup()
    {
        return $this->belongsTo(Governorate::class, 'governorate_id');
    }

    /**
     * المنطقة — a request can name several areas the client would accept
     * (area_request), all within its single governorate. Named *Lookup for the
     * same reason as the others: `area_names` / `area_name` are accessors.
     */
    public function areasLookup()
    {
        return $this->belongsToMany(Area::class, 'area_request', 'request_id', 'area_id');
    }

    // ── status <-> request_status_id ───────────────────────────
    public function getStatusAttribute(): ?string
    {
        return $this->requestStatus?->name;
    }

    public function setStatusAttribute($value): void
    {
        $this->attributes['request_status_id'] = RequestStatus::idForName($value);
    }

    // ── category <-> property_cat_id ───────────────────────────
    public function getCategoryAttribute(): ?string
    {
        return $this->propertyCat?->name;
    }

    public function setCategoryAttribute($value): void
    {
        $this->attributes['property_cat_id'] = PropertyCat::idForName($value);
    }

    // ── activities (many-to-many via activity_request) ─────────
    /** The activity names as an array — the canonical multi-value field. */
    public function getActivitiesAttribute(): array
    {
        return $this->activitiesLookup->pluck('name')->all();
    }

    /** Backward-compatible single string (activities joined) for list/table display. */
    public function getActivityAttribute(): ?string
    {
        $names = $this->activities;
        return count($names) ? implode('، ', $names) : null;
    }

    // ── governorate / areas (read-only names for the API payload) ──
    public function getGovernorateAttribute(): ?string
    {
        return $this->governorateLookup?->name;
    }

    /** The selected area ids — what the form posts back and edits. */
    public function getAreaIdsAttribute(): array
    {
        return $this->areasLookup->pluck('id')->all();
    }

    /** The selected area names as an array — the canonical multi-value field. */
    public function getAreaNamesAttribute(): array
    {
        return $this->areasLookup->pluck('name')->all();
    }

    /**
     * Backward-compatible single string (areas joined), exactly as `activity` is
     * to `activities`: the list table, view drawer, client drawer and the match
     * e-mail all render one المنطقة cell and keep reading `area_name`.
     */
    public function getAreaNameAttribute(): ?string
    {
        $names = $this->area_names;
        return count($names) ? implode('، ', $names) : null;
    }
}
