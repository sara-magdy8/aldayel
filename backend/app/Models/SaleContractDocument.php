<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaleContractDocument extends Model
{
    protected $fillable = ['sale_contract_id', 'type', 'file_path', 'file_name'];

    protected $appends = ['url'];

    public function saleContract()
    {
        return $this->belongsTo(SaleContract::class);
    }

    public function getUrlAttribute(): string
    {
        return asset('storage/' . $this->file_path);
    }
}
