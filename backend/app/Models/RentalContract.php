<?php

namespace App\Models;

use App\Support\ListingStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class RentalContract extends Model
{
    use HasFactory;

    protected $fillable = [
        'contract_number', 'property_id', 'unit_id', 'tenant_id',
        'start_date', 'end_date', 'total_amount',
        'payment_period', 'payment_term_id',
        'payment_method', 'payment_type_id',
        'deposit_amount', 'notes', 'status', 'contract_status_id',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date'   => 'date',
    ];

    /** Expose lookup names as `payment_period` / `payment_method` / `status`. */
    protected $appends = ['payment_period', 'payment_method', 'status'];

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

    public function tenant()
    {
        return $this->belongsTo(Client::class, 'tenant_id');
    }

    public function documents()
    {
        return $this->hasMany(RentalContractDocument::class);
    }

    // ── Lookup relations ───────────────────────────────────────
    public function paymentTerm()
    {
        return $this->belongsTo(PaymentTerm::class);
    }

    public function paymentType()
    {
        return $this->belongsTo(PaymentType::class);
    }

    // ── payment_period <-> payment_term_id ─────────────────────
    public function getPaymentPeriodAttribute(): ?string
    {
        return $this->paymentTerm?->name;
    }

    public function setPaymentPeriodAttribute($value): void
    {
        $this->attributes['payment_term_id'] = PaymentTerm::idForName($value);
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
