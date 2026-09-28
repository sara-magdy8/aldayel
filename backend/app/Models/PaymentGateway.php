<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentGateway extends Model
{
    protected $fillable = [
        'name',
        'gateway',
        'credentials',
    ];

    protected $casts = [
        // Encrypted at rest with APP_KEY; decrypted transparently on read, so
        // the settings screen still gets the plain values back in its inputs.
        // Rotating APP_KEY without re-encrypting will make these unreadable.
        'credentials' => 'encrypted:array',
    ];

    /**
     * The office's account when it has exactly one, otherwise null.
     *
     * Used to stand in for a collection that names no gateway: with a single
     * account there is nothing to choose. Null once a second account exists —
     * which merchant account collects the money is the office's decision, not a
     * guess — and null when none is configured at all.
     */
    public static function soleAccount(): ?self
    {
        // Two rows are enough to know the answer is "there is a choice to make".
        $accounts = static::query()->limit(2)->get();

        return $accounts->count() === 1 ? $accounts->first() : null;
    }
}
