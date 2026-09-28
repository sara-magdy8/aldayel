<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RentalContractDocument extends Model
{
    protected $fillable = ['rental_contract_id', 'type', 'file_path', 'file_name'];

    protected $appends = ['url'];

    public function rentalContract()
    {
        return $this->belongsTo(RentalContract::class);
    }

    public function getUrlAttribute(): string
    {
        return asset('storage/' . $this->file_path);
    }
}
