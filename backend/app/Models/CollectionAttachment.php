<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CollectionAttachment extends Model
{
    protected $fillable = ['collection_id', 'file_path', 'file_name'];

    protected $appends = ['url'];

    public function collection()
    {
        return $this->belongsTo(Collection::class);
    }

    public function getUrlAttribute(): string
    {
        return asset('storage/' . $this->file_path);
    }
}
