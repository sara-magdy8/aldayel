<?php

namespace App\Models;

use App\Support\ListingStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class SaleContract extends Model
{
    use HasFactory;

    protected $fillable = [
        'contract_number', 'property_id', 'unit_id', 'buyer_id',
        'contract_date', 'delivery_date', 'total_amount',
        'payment_method', 'payment_type_id', 'down_payment', 'notes', 'status', 'contract_status_id',
    ];

    protected $casts = [
        'contract_date'  => 'date',
        'delivery_date'  => 'date',
    ];

    /** Expose lookup names as `payment_method` / `status`. */
    protected $appends = ['payment_method', 'status'];

    protected static function boot()
    {
        parent::boot();
        // The listing's status is derived from its contracts, so every change to
        // this one — including cancelling, deleting, or repointing it — hands the
        // decision back to ListingStatus rather than setting a status directly.
        static::saved(function ($contract) {
            // Nothing derived can have moved unless the contract was just created,
            // changed status, or was repointed at another listing. Editing an
            // amount, a date, or a note leaves both the listing status and the
            // property's `has_contract` exactly where they were, so that save
            // costs one comparison instead of a pile of queries.
            if (! $contract->wasRecentlyCreated
                && ! $contract->wasChanged(['contract_status_id', 'property_id', 'unit_id'])) {
                return;
            }

            ListingStatus::syncFor($contract);
            // Repointed contracts also release the listing they left behind.
            ListingStatus::syncPrevious($contract);
            // Same derivation, different flag: `has_contract` is what keeps this
            // property out of the contract form's dropdown while it is covered.
            Property::syncContractFlagFor($contract);
        });

        static::deleted(function ($contract) {
            ListingStatus::syncFor($contract);
            Property::syncContractFlagFor($contract);
        });
    }

    public function property()
    {
        return $this->belongsTo(Property::class);
    }

    public function unit()
    {
        return $this->belongsTo(Unit::class);
    }

    public function buyer()
    {
        return $this->belongsTo(Client::class, 'buyer_id');
    }

    public function documents()
    {
        return $this->hasMany(SaleContractDocument::class);
    }

    // ── Lookup relation ────────────────────────────────────────
    public function paymentType()
    {
        return $this->belongsTo(PaymentType::class);
    }

    // ── payment_method <-> payment_type_id ─────────────────────
    public function getPaymentMethodAttribute(): ?string
    {
        return $this->paymentType?->name;
    }

    public function setPaymentMethodAttribute($value): void
    {
        $this->attributes['payment_type_id'] = PaymentType::idForName($value);
    }

    // ── status <-> contract_status_id ──────────────────────────
    public function contractStatus()
    {
        return $this->belongsTo(ContractStatus::class);
    }

    public function getStatusAttribute(): ?string
    {
        return $this->contractStatus?->name;
    }

    public function setStatusAttribute($value): void
    {
        $this->attributes['contract_status_id'] = ContractStatus::idForName($value);
    }
}
