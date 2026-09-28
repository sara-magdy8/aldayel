<?php
// app/Models/PropertyAttachment.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PropertyAttachment extends Model
{
    protected $fillable = ['property_id', 'file_path', 'file_name', 'file_type'];

    protected $appends = ['url'];

    public function property()
    {
        return $this->belongsTo(Property::class);
    }

    public function getUrlAttribute(): string
    {
        return asset('storage/' . $this->file_path);
    }
}
