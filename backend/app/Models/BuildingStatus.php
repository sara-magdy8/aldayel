<?php

namespace App\Models;

use App\Models\Concerns\IsLookup;
use Illuminate\Database\Eloquent\Model;

class BuildingStatus extends Model
{
    use IsLookup;

    protected $table = 'building_statuses';

    protected $fillable = ['name'];
}
