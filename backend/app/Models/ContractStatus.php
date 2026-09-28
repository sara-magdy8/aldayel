<?php

namespace App\Models;

use App\Models\Concerns\IsLookup;
use Illuminate\Database\Eloquent\Model;

class ContractStatus extends Model
{
    use IsLookup;

    protected $table = 'contract_statuses';

    protected $fillable = ['name'];
}
