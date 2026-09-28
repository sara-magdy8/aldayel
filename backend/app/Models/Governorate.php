<?php

namespace App\Models;

use App\Models\Concerns\IsLookup;
use Illuminate\Database\Eloquent\Model;

class Governorate extends Model
{
    use IsLookup;

    protected $fillable = ['name'];

    public function areas()
    {
        return $this->hasMany(Area::class);
    }
}
