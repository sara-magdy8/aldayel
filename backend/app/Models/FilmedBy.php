<?php

namespace App\Models;

use App\Models\Concerns\IsLookup;
use Illuminate\Database\Eloquent\Model;

class FilmedBy extends Model
{
    use IsLookup;

    protected $table = 'filmed_by';

    protected $fillable = ['name'];
}
