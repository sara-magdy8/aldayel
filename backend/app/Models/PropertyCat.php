<?php

namespace App\Models;

use App\Models\Concerns\IsLookup;
use App\Models\Concerns\ScopedToListingType;
use Illuminate\Database\Eloquent\Model;

class PropertyCat extends Model
{
    use IsLookup, ScopedToListingType;

    protected $fillable = ['name', 'for_rental', 'for_sale'];

    protected $casts = [
        'for_rental' => 'boolean',
        'for_sale'   => 'boolean',
    ];
}
