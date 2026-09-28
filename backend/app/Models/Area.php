<?php

namespace App\Models;

use App\Models\Concerns\IsLookup;
use Illuminate\Database\Eloquent\Model;

class Area extends Model
{
    use IsLookup;

    protected $fillable = ['name', 'governorate_id'];

    public function governorate()
    {
        return $this->belongsTo(Governorate::class);
    }
}
