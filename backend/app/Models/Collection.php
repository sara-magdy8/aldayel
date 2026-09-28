<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Str;

class Collection extends Model
{
    use HasFactory;

    /** Money already received, versus a link the client pays themselves. */
    public const METHODS = ['manual', 'payment_link'];

    /** Lifecycle of a payment link: awaiting the client, settled, or declined. */
    public const PAYMENT_UNPAID = 'unpaid';
    public const PAYMENT_PAID   = 'paid';
    public const PAYMENT_FAILED = 'failed';

    /** Gateways that may be offered on a payment link. */
    public const LINK_GATEWAYS = ['كي نت', 'فيزا / ماستركارد', 'Apple Pay', 'Google Pay'];

    /** How the link is delivered; `copy` sends nothing — the office shares it. */
    public const LINK_CHANNELS = ['whatsapp', 'email', 'copy'];

    protected $fillable = [
        'collection_number', 'collection_type', 'collection_type_id', 'client_id',
        'property_id', 'unit_id', 'broker', 'beneficiary', 'payment_beneficiary_id',
        'amount', 'collection_method', 'payment_date', 'payment_method', 'payment_type_id',
        'payment_link_expiry_days', 'payment_link_reminder_days',
        'payment_link_gateways', 'payment_link_channel', 'payment_gateway_id',
        // Written by the gateway callback, not by the admin UI — but kept fillable
        // so the callback can update() them in one call.
        'payment_status', 'payment_reference', 'payment_order_reference', 'payment_paid_at',
        'payment_gateway_response',
        'check_number', 'check_bank', 'check_date',
        'transfer_bank', 'transfer_transaction_number', 'transfer_date',
        'card_type', 'card_transaction_number', 'card_last4',
        'notes', 'has_invoice', 'invoice_number',
    ];

    protected $casts = [
        'payment_date'               => 'date',
        'check_date'                 => 'date',
        'transfer_date'              => 'date',
        'has_invoice'                => 'boolean',
        // Cast so the API hands the client a real array rather than a JSON string.
        'payment_link_gateways'      => 'array',
        'payment_link_expiry_days'   => 'integer',
        'payment_link_reminder_days' => 'integer',
        'payment_paid_at'            => 'datetime',
        'payment_link_issued_at'     => 'datetime',
        // Handed to the API as a real object rather than a JSON string.
        'payment_gateway_response'   => 'array',
    ];

    /**
     * The raw token is a secret handed to one client — hide it so it can only
     * leave through the `payment_link_url` accessor below, never as a stray field
     * on some other endpoint's payload.
     */
    protected $hidden = ['payment_link_token'];

    /** Expose lookup names as `collection_type` / `beneficiary` / `payment_method`. */
    protected $appends = [
        'collection_type', 'beneficiary', 'payment_method',
        'payment_link_url', 'payment_link_expires_at',
    ];

    protected static function boot()
    {
        parent::boot();

        // Token lifecycle lives here rather than in the controller so every write
        // path — API, seeder, console — produces the same result.
        static::saving(function ($collection) {
            if ($collection->collection_method === 'payment_link') {
                $collection->payment_link_token ??= static::uniqueLinkToken();
                return;
            }

            // Switched back to a manual collection: kill the outstanding link so the
            // URL already copied to someone's clipboard stops working. A link that
            // was actually paid keeps its token — that is payment history now.
            if ($collection->collection_method === 'manual' && $collection->payment_status !== self::PAYMENT_PAID) {
                $collection->payment_link_token = null;
                $collection->payment_status = self::PAYMENT_UNPAID;
            }
        });

        static::creating(function ($collection) {
            $year = now()->year;
            if (!$collection->collection_number) {
                $collection->collection_number = static::nextSequentialNumber('COL', 'collection_number', $year);
            }
            if ($collection->has_invoice && !$collection->invoice_number) {
                $collection->invoice_number = static::nextSequentialNumber('INV', 'invoice_number', $year);
            }
        });
    }

    /**
     * Build the next "{PREFIX}-{year}-{NNNN}" identifier for the given column.
     *
     * Counts from the highest existing value. A deleted row is gone from the
     * table entirely, so its number is free to be issued again.
     */
    protected static function nextSequentialNumber(string $prefix, string $column, int $year): string
    {
        $needle = "{$prefix}-{$year}-";
        $last = static::query()
            ->where($column, 'like', $needle . '%')
            ->orderByDesc($column)
            ->value($column);

        $seq = $last ? ((int) substr($last, strlen($needle))) + 1 : 1;

        return $needle . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }

    // ── Payment link ───────────────────────────────────────────

    /** A random token that is not already in use. */
    protected static function uniqueLinkToken(): string
    {
        do {
            $token = Str::random(48);
        } while (static::where('payment_link_token', $token)->exists());

        return $token;
    }

    /**
     * The shareable URL the client opens to pay — the value the copy button hands
     * out. Null on manual collections, which have no token.
     *
     * Points at this Laravel app, not the React frontend: /pay/{token} has to run
     * server-side to sign the checkout request with the gateway's secret key.
     */
    public function getPaymentLinkUrlAttribute(): ?string
    {
        return $this->payment_link_token
            ? url("/pay/{$this->payment_link_token}")
            : null;
    }

    /**
     * When the link stops working, for the admin UI.
     *
     * Derived here rather than recomputed in the frontend so both sides agree on
     * when a link is dead — a client turned away by /pay/{token} must not still
     * show as merely awaiting payment on the collections screen.
     */
    public function getPaymentLinkExpiresAtAttribute(): ?string
    {
        return $this->paymentLinkExpiresAt()?->toIso8601String();
    }

    /**
     * When the link stops working, or null if the office set no expiry.
     *
     * Counted from `payment_link_issued_at` for a reissued link, and from
     * `created_at` for one that has never been reissued — so a fresh link gets a
     * full window instead of inheriting the dead one's already-past expiry.
     */
    public function paymentLinkExpiresAt(): ?\Illuminate\Support\Carbon
    {
        $issuedAt = $this->payment_link_issued_at ?? $this->created_at;

        return $this->payment_link_expiry_days
            ? $issuedAt?->copy()->addDays($this->payment_link_expiry_days)
            : null;
    }

    public function paymentLinkExpired(): bool
    {
        return $this->paymentLinkExpiresAt()?->isPast() ?? false;
    }

    /**
     * Issue a replacement link for this collection.
     *
     * The old token is discarded rather than extended: whatever URL is sitting in
     * the client's inbox stops working, which is the point — a link is reissued
     * because it expired, or because the office wants the old one dead.
     *
     * The expiry window restarts from now, the failed/expired state is cleared back
     * to unpaid, and the reminder stamp is dropped so the nudge can fire once more
     * against the new expiry date. `payment_order_reference` and
     * `payment_gateway_response` are left alone — they record what the gateway did
     * on the previous attempt, and that history stands.
     */
    public function reissuePaymentLink(): void
    {
        $this->forceFill([
            'payment_link_token'        => static::uniqueLinkToken(),
            'payment_link_issued_at'    => now(),
            'payment_status'            => self::PAYMENT_UNPAID,
            'payment_link_reminded_at'  => null,
        ])->save();
    }

    public function isPaid(): bool
    {
        return $this->payment_status === self::PAYMENT_PAID;
    }

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function property()
    {
        return $this->belongsTo(Property::class);
    }

    public function unit()
    {
        return $this->belongsTo(Unit::class);
    }

    public function attachments()
    {
        return $this->hasMany(CollectionAttachment::class);
    }

    /** The office gateway account a payment link is issued through. */
    public function paymentGateway()
    {
        return $this->belongsTo(PaymentGateway::class);
    }

    /**
     * The account this link should actually be charged through.
     *
     * Normally the one the office picked when recording the collection. Links
     * saved before the field existed — or while no account was configured yet —
     * carry none, and fall back to the office's sole account: turning a client
     * away over a field they never saw is worse than charging through the only
     * account there is. Null when nothing can be resolved without guessing.
     */
    public function resolvePaymentGateway(): ?PaymentGateway
    {
        return $this->paymentGateway ?? PaymentGateway::soleAccount();
    }

    // ── Lookup relations ───────────────────────────────────────
    // Named with a `Ref` suffix so the relation key does not studly-collide
    // with the `collection_type` accessor (both would map to "CollectionType").
    public function collectionTypeRef()
    {
        return $this->belongsTo(CollectionType::class, 'collection_type_id');
    }

    public function paymentBeneficiary()
    {
        return $this->belongsTo(PaymentBeneficiary::class);
    }

    public function paymentType()
    {
        return $this->belongsTo(PaymentType::class);
    }

    // ── collection_type <-> collection_type_id ─────────────────
    public function getCollectionTypeAttribute(): ?string
    {
        return $this->collectionTypeRef?->name;
    }

    public function setCollectionTypeAttribute($value): void
    {
        $this->attributes['collection_type_id'] = CollectionType::idForName($value);
    }

    // ── beneficiary <-> payment_beneficiary_id ─────────────────
    public function getBeneficiaryAttribute(): ?string
    {
        return $this->paymentBeneficiary?->name;
    }

    public function setBeneficiaryAttribute($value): void
    {
        $this->attributes['payment_beneficiary_id'] = PaymentBeneficiary::idForName($value);
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
}
