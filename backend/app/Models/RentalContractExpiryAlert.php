<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * One expiry reminder already mailed for a rental contract.
 *
 * Written by `contracts:send-expiry-alerts` after a digest is away; read by the
 * next run to work out which of the office's configured reminders are still
 * owed. Nothing else writes here — a row's only meaning is "the reminder that
 * fires `days_before` days ahead of this lease has been sent".
 */
class RentalContractExpiryAlert extends Model
{
    /**
     * The `days_before` value standing for the closing notice — the mail sent
     * once the lease has actually run out, rather than ahead of it.
     *
     * Zero is free for this: the settings screen only accepts offsets of 1 day
     * or more, and Setting::rentalExpiryAlertDays() drops anything else, so no
     * configured reminder can ever collide with it. Reusing the column keeps
     * one ledger — and one unique index — covering every mail this lease has
     * been sent about its ending.
     */
    public const ENDED_NOTICE = 0;

    protected $fillable = ['rental_contract_id', 'days_before'];

    public function contract()
    {
        return $this->belongsTo(RentalContract::class, 'rental_contract_id');
    }

    /**
     * The offsets already announced for each of these contracts, as
     * rental_contract_id => [days_before, ...].
     *
     * Taken a chunk at a time rather than per contract, for the same reason as
     * MatchAlert::announcedFor(): the command walks every contract nearing its
     * end on each run, and one query per contract would be most of the work.
     *
     * @param  array<int, int>  $contractIds
     * @return Collection<int, array<int, int>>
     */
    public static function announcedFor(array $contractIds): Collection
    {
        return static::whereIn('rental_contract_id', $contractIds)
            ->get(['rental_contract_id', 'days_before'])
            ->groupBy('rental_contract_id')
            ->map(fn ($rows) => $rows->pluck('days_before')->map(fn ($d) => (int) $d)->all());
    }
}
