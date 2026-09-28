<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Str;

class Property extends Model
{
    use HasFactory;

    protected $fillable = [
        'name', 'property_code', 'property_type', 'listing_type', 'category', 'property_cat_id',
        'filmed_by', 'filmed_by_id', 'building_status', 'building_status_id', 'priority',
        'owner_id', 'plot_number', 'governorate_id', 'area_id', 'area', 'location_link',
        'description', 'guard_name', 'guard_phone',
        // الوسيط / مسؤول العقار are clients now; the legacy *_name / *_phone_num
        // columns are read-only fallbacks and are intentionally not fillable.
        'broker_id', 'manager_id',
        'forsale_link', 'instagram_link', 'whatsapp_link', 'marketing_status', 'show_soum_in_pdf',
        'commission', 'notes', 'status', 'property_status_id',
        'rent_amount', 'price', 'conditions', 'grace_period',
        // المستأجر is a client now; `tenant_name` is an appended accessor.
        'tenant_id', 'tenant_start', 'tenant_end', 'sale_date', 'has_contract',
        'public_link_token', 'public_link_enabled',
        'public_show_price', 'public_show_location', 'public_show_contact',
    ];

    protected $casts = [
        'priority'              => 'boolean',
        'marketing_status'      => 'boolean',
        'show_soum_in_pdf'      => 'boolean',
        'has_contract'          => 'boolean',
        'public_link_enabled'   => 'boolean',
        'public_show_price'     => 'boolean',
        'public_show_location'  => 'boolean',
        'public_show_contact'   => 'boolean',
        'tenant_start'          => 'date',
        'tenant_end'            => 'date',
        'sale_date'             => 'date',
    ];

    /**
     * Expose the lookup names as `status` / `category` so the API payload and
     * existing callers keep working even though storage is now relational.
     */
    protected $appends = [
        'status', 'category', 'filmed_by', 'is_filmed', 'building_status', 'activities', 'activity',
        'governorate', 'area_name', 'address',
        // No columns behind these any more — they resolve through broker / manager.
        'broker_name', 'broker_phone_num', 'manager_name', 'manager_phone_num',
        // Likewise for المستأجر, which is a client rather than a stored name.
        'tenant_name',
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($property) {
            if (!$property->public_link_token) {
                $property->public_link_token = Str::uuid();
            }
        });
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

    // ── property_type <-> boolean (0=>مستقل, 1=>متعدد الوحدات) ──
    public static function propertyTypeValue($value): int
    {
        if (is_bool($value) || is_numeric($value)) {
            return (int) $value ? 1 : 0;
        }
        return $value === 'متعدد الوحدات' ? 1 : 0;
    }

    public function getPropertyTypeAttribute($value): string
    {
        return (int) $value === 1 ? 'متعدد الوحدات' : 'مستقل';
    }

    public function setPropertyTypeAttribute($value): void
    {
        $this->attributes['property_type'] = self::propertyTypeValue($value);
    }

    // ── Lookup relations ───────────────────────────────────────
    public function propertyStatus()
    {
        return $this->belongsTo(PropertyStatus::class);
    }

    public function propertyCat()
    {
        return $this->belongsTo(PropertyCat::class);
    }

    // Named to avoid colliding with the `filmed_by` accessor: both `filmed_by`
    // and a `filmedBy` relation would studly-resolve to the same mutator key.
    public function filmedByLookup()
    {
        return $this->belongsTo(FilmedBy::class, 'filmed_by_id');
    }

    // Named *Lookup for the same reason as filmedByLookup above.
    public function buildingStatusLookup()
    {
        return $this->belongsTo(BuildingStatus::class, 'building_status_id');
    }

    // Named *Lookup to avoid colliding with the appended `activities` / `activity`
    // name accessors. A property can carry several activities (activity_property).
    public function activitiesLookup()
    {
        return $this->belongsToMany(Activity::class, 'activity_property', 'property_id', 'activity_id');
    }

    // Named *Lookup so they don't collide with the appended `governorate` /
    // `area_name` name accessors (see filmedByLookup precedent above).
    public function governorateLookup()
    {
        return $this->belongsTo(Governorate::class, 'governorate_id');
    }

    public function areaLookup()
    {
        return $this->belongsTo(Area::class, 'area_id');
    }

    // ── status <-> property_status_id ──────────────────────────
    public function getStatusAttribute(): ?string
    {
        return $this->propertyStatus?->name;
    }

    public function setStatusAttribute($value): void
    {
        $this->attributes['property_status_id'] = PropertyStatus::idForName($value);
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

    // ── filmed_by <-> filmed_by_id ─────────────────────────────
    public function getFilmedByAttribute(): ?string
    {
        return $this->filmedByLookup?->name;
    }

    public function setFilmedByAttribute($value): void
    {
        $this->attributes['filmed_by_id'] = FilmedBy::idForName($value);
    }

    /** True when the property has a "filmed by" set (filmed_by_id is not null). */
    public function getIsFilmedAttribute(): bool
    {
        return $this->filmed_by_id !== null;
    }

    // ── building_status <-> building_status_id ─────────────────
    /** حالة البناء — set on عقارات البيع only; null on rentals. */
    public function getBuildingStatusAttribute(): ?string
    {
        return $this->buildingStatusLookup?->name;
    }

    public function setBuildingStatusAttribute($value): void
    {
        $this->attributes['building_status_id'] = BuildingStatus::idForName($value);
    }

    // ── activities (many-to-many via activity_property) ────────
    /** The activity names as an array — the canonical multi-value field. */
    public function getActivitiesAttribute(): array
    {
        return $this->activitiesLookup->pluck('name')->all();
    }

    /**
     * Backward-compatible single string (activities joined) so the public share
     * link, PDF export, list tables, and view drawer keep reading `->activity`.
     */
    public function getActivityAttribute(): ?string
    {
        $names = $this->activities;
        return count($names) ? implode('، ', $names) : null;
    }

    // ── governorate / area_name (read-only names for the API payload) ──
    public function getGovernorateAttribute(): ?string
    {
        return $this->governorateLookup?->name;
    }

    public function getAreaNameAttribute(): ?string
    {
        return $this->areaLookup?->name;
    }

    /**
     * `address` is no longer stored — it is derived from the structured location
     * as "المحافظة - المنطقة" (or just the governorate when no area is set). Kept
     * as an accessor so the public share link, PDF export, list view, and search
     * keep reading `->address` unchanged.
     */
    public function getAddressAttribute(): ?string
    {
        $governorate = $this->governorate;
        if (! $governorate) {
            return null;
        }

        $area = $this->area_name;

        return $area ? "{$governorate} - {$area}" : $governorate;
    }

    public function owner()
    {
        return $this->belongsTo(Client::class, 'owner_id');
    }

    // ── الوسيط / مسؤول العقار (clients) ────────────────────────
    public function broker()
    {
        return $this->belongsTo(Client::class, 'broker_id');
    }

    public function manager()
    {
        return $this->belongsTo(Client::class, 'manager_id');
    }

    /**
     * The broker/manager name and phone are read off the linked client, so every
     * consumer that already reads `broker_name` / `broker_phone_num` /
     * `manager_name` / `manager_phone_num` (view drawer, list, exports) keeps
     * working unchanged.
     *
     * The legacy columns behind these names are gone (see the
     * drop_legacy_broker_manager_columns migration), which is why all four are
     * appended — there is no attribute left to carry them into the payload.
     * Eager-load `broker` / `manager` on list queries to avoid an N+1.
     */
    public function getBrokerNameAttribute(): ?string
    {
        return $this->broker?->full_name;
    }

    public function getBrokerPhoneNumAttribute(): ?string
    {
        return $this->broker?->phone;
    }

    public function getManagerNameAttribute(): ?string
    {
        return $this->manager?->full_name;
    }

    public function getManagerPhoneNumAttribute(): ?string
    {
        return $this->manager?->phone;
    }

    // ── المستأجر (client) ──────────────────────────────────────
    public function tenant()
    {
        return $this->belongsTo(Client::class, 'tenant_id');
    }

    /**
     * The tenant name is read off the linked client — the `tenant_name` column is
     * gone (see the replace_tenant_name_with_tenant_id migration), so the view
     * drawer, list, and exports keep reading `tenant_name` through here. Eager-load
     * `tenant` on list queries to avoid an N+1.
     */
    public function getTenantNameAttribute(): ?string
    {
        return $this->tenant?->full_name;
    }

    public function units()
    {
        return $this->hasMany(Unit::class);
    }

    /** سجل العقار — see PropertyLogObserver. */
    public function logs()
    {
        return $this->hasMany(PropertyLog::class);
    }

    /** السوم — the bids recorded against this listing. */
    public function soums()
    {
        return $this->hasMany(Soum::class);
    }

    /**
     * أعلى سوم — the single highest bid, for the list column's summary.
     *
     * A hasOne-of-many rather than a max() over the loaded set: the listing page
     * needs the bid's date alongside its amount, and this resolves both in one
     * subquery per page instead of loading every bid of every row.
     */
    public function topSoum()
    {
        return $this->hasOne(Soum::class)->ofMany('amount', 'max');
    }

    public function attachments()
    {
        return $this->hasMany(PropertyAttachment::class);
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

    /**
     * Whether a contract currently covers this property.
     *
     * Read off contract status, exactly as App\Support\ListingStatus reads it
     * when deriving مؤجر / مباع — a نشط lease holds the property, and a مكتمل
     * sale still holds it because the sale went through, while مسودة never
     * started and ملغي was called off.
     *
     * No date arithmetic here on purpose. An expiring lease is not a state this
     * has to detect: `contracts:expire-ended-rentals` moves it to مكتمل the night
     * after its end_date, and that save recomputes the flag along with the
     * listing status. Reading dates as well would let the two disagree between
     * midnight and 01:30, and would report a property as "بدون عقد" when what it
     * really has is a lease waiting to be closed.
     *
     * Soft-deleted contracts are excluded by their own default scope.
     */
    public function hasLiveContract(): bool
    {
        $holdsRental = ContractStatus::whereIn('name', ['نشط'])->pluck('id');
        $holdsSale   = ContractStatus::whereIn('name', ['نشط', 'مكتمل'])->pluck('id');

        return $this->rentalContracts()->whereIn('contract_status_id', $holdsRental)->exists()
            || $this->saleContracts()->whereIn('contract_status_id', $holdsSale)->exists();
    }

    /**
     * Recompute `has_contract`, the flag that hides an already-contracted
     * property from the contract forms' dropdowns.
     *
     * Derived rather than toggled to a fixed 1/0 by whoever wrote last, so that
     * deleting one of two contracts does not clear the flag, a contract moved to
     * another property frees the one it left, and the rental and sale sides
     * cannot clobber each other.
     */
    public function syncContractFlag(): void
    {
        $this->update(['has_contract' => $this->hasLiveContract()]);
    }

    /**
     * Recompute the flag for whichever property a contract points at — and, when
     * the contract has just been repointed, for the property it left behind.
     *
     * Called from the contract models' save/delete hooks, beside the
     * ListingStatus calls, so the flag is maintained by the same event that
     * maintains the status and no caller has to remember it. Those hooks decide
     * whether the save could have moved anything before calling in.
     */
    public static function syncContractFlagFor($contract): void
    {
        self::find($contract->property_id)?->syncContractFlag();

        if ($contract->wasChanged('property_id')) {
            self::find($contract->getOriginal('property_id'))?->syncContractFlag();
        }
    }
}
