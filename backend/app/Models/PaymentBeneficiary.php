<?php

namespace App\Models;

use App\Models\Concerns\IsLookup;
use Illuminate\Database\Eloquent\Model;

class PaymentBeneficiary extends Model
{
    use IsLookup;

    protected $table = 'payment_beneficiaries';

    protected $fillable = ['name'];
}
