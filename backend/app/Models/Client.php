<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Client extends Model
{
    use HasFactory;

    protected $fillable = [
        'full_name', 'phone', 'email', 'type',
        'company_rep_name', 'company_rep_phone',
        'notes', 'status'
    ];

    // ── type <-> tinyint ───────────────────────────────────────
    /** Stored value => Arabic label. Unknown values fall back to فرد. */
    public const TYPES = [
        0 => 'فرد',
        1 => 'شركة',
        2 => 'وسيط',
        3 => 'مسؤول العقار',
    ];

    /** The only type that carries representative data. */
    public const TYPE_COMPANY = 'شركة';

    public static function typeValue($value): int
    {
        if (is_bool($value) || is_numeric($value)) {
            $int = (int) $value;
            return isset(self::TYPES[$int]) ? $int : 0;
        }
        $key = array_search($value, self::TYPES, true);
        return $key === false ? 0 : $key;
    }

    public function getTypeAttribute($value): string
    {
        return self::TYPES[(int) $value] ?? self::TYPES[0];
    }

    public function setTypeAttribute($value): void
    {
        $this->attributes['type'] = self::typeValue($value);
    }

    // ── status <-> boolean (0=>غير نشط, 1=>نشط) ────────────────
    public static function statusValue($value): int
    {
        if (is_bool($value) || is_numeric($value)) {
            return (int) $value ? 1 : 0;
        }
        return $value === 'نشط' ? 1 : 0;
    }

    public function getStatusAttribute($value): string
    {
        return (int) $value === 1 ? 'نشط' : 'غير نشط';
    }

    public function setStatusAttribute($value): void
    {
        $this->attributes['status'] = self::statusValue($value);
    }

    public function ownedProperties()
    {
        return $this->hasMany(Property::class, 'owner_id');
    }

    public function requests()
    {
        return $this->hasMany(PropertyRequest::class);
    }

    public function rentalContracts()
    {
        return $this->hasMany(RentalContract::class, 'tenant_id');
    }

    public function saleContracts()
    {
        return $this->hasMany(SaleContract::class, 'buyer_id');
    }

    public function collections()
    {
        return $this->hasMany(Collection::class);
    }
}
