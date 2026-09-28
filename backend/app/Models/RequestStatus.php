<?php

namespace App\Models;

use App\Models\Concerns\IsLookup;
use Illuminate\Database\Eloquent\Model;

class RequestStatus extends Model
{
    use IsLookup;

    protected $table = 'request_statuses';

    protected $fillable = ['name'];
}
