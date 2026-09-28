<?php
// app/Models/UnitImage.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UnitImage extends Model
{
    protected $fillable = ['unit_id', 'image_path'];

    protected $appends = ['url'];

    public function unit()
    {
        return $this->belongsTo(Unit::class);
    }

    public function getUrlAttribute(): string
    {
        return asset('storage/' . $this->image_path);
    }
}
