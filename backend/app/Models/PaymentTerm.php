<?php

namespace App\Models;

use App\Models\Concerns\IsLookup;
use Illuminate\Database\Eloquent\Model;

class PaymentTerm extends Model
{
    use IsLookup;

    protected $fillable = ['name'];
}
