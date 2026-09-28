<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * One property↔request pairing that the admins have already been alerted about.
 *
 * Written by `matches:alert-admins` after a digest is away; read by the next run
 * to work out what is genuinely new. Nothing else writes here — a row's only
 * meaning is "this pairing has been announced".
 */
class MatchAlert extends Model
{
    protected $fillable = ['property_id', 'request_id'];

    public function property()
    {
        return $this->belongsTo(Property::class);
    }

    public function request()
    {
        return $this->belongsTo(PropertyRequest::class, 'request_id');
    }

    /**
     * The property ids already announced for each of these requests, as
     * request_id => [property_id, ...].
     *
     * Taken a chunk at a time rather than per request: the command walks every
     * open request on each run, and one query per request would be the bulk of
     * the work it does.
     *
     * @param  array<int, int>  $requestIds
     * @return Collection<int, array<int, int>>
     */
    public static function announcedFor(array $requestIds): Collection
    {
        return static::whereIn('request_id', $requestIds)
            ->get(['request_id', 'property_id'])
            ->groupBy('request_id')
            ->map(fn ($rows) => $rows->pluck('property_id')->all());
    }
}
