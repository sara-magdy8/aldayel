<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One entry in a property's سجل. Append-only: written by App\Support\PropertyLogger.
 */
class PropertyLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'property_id', 'unit_id', 'user_id', 'action', 'description', 'changes',
    ];

    protected $casts = [
        'changes' => 'array',
    ];

    public function property()
    {
        return $this->belongsTo(Property::class);
    }

    public function unit()
    {
        return $this->belongsTo(Unit::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
