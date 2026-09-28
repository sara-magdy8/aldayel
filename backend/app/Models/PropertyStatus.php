<?php

namespace App\Models;

use App\Models\Concerns\IsLookup;
use Illuminate\Database\Eloquent\Model;

class PropertyStatus extends Model
{
    use IsLookup;

    protected $table = 'property_statuses';

    protected $fillable = ['name'];
}
