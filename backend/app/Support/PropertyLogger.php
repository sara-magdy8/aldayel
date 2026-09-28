<?php

namespace App\Support;

use App\Models\BuildingStatus;
use App\Models\Client;
use App\Models\CollectionType;
use App\Models\ContractStatus;
use App\Models\FilmedBy;
use App\Models\Governorate;
use App\Models\Area;
use App\Models\PaymentTerm;
use App\Models\PaymentType;
use App\Models\PropertyCat;
use App\Models\PropertyLog;
use App\Models\PropertyStatus;
use Illuminate\Database\Eloquent\Model;
use Throwable;

/**
 * Writes سجل العقار entries and turns a model's dirty columns into readable
 * {label: [old, new]} pairs.
 *
 * Field specs map a column to [label, type]. The type decides how a raw value
 * is shown: null (as-is), 'bool', 'date', 'money', 'client' (a client id), a
 * lookup model class using IsLookup (an id), or an array value map.
 * Raw values are used on purpose: getOriginal() would run accessors on some
 * columns (listing_type, …) but not others, and the formatter must see one shape.
 */
class PropertyLogger
{
    public const PROPERTY_FIELDS = [
        'name'               => ['اسم العقار', null],
        'property_code'      => ['كود العقار', null],
        'listing_type'       => ['نوع العرض', [0 => 'إيجار', 1 => 'بيع']],
        'property_type'      => ['نوع العقار', [0 => 'مستقل', 1 => 'متعدد الوحدات']],
        'property_cat_id'    => ['التصنيف', PropertyCat::class],
        'filmed_by_id'       => ['تم التصوير من قبل', FilmedBy::class],
        'building_status_id' => ['حالة البناء', BuildingStatus::class],
        'priority'           => ['الأولوية', 'bool'],
        'owner_id'           => ['المالك', 'client'],
        'plot_number'        => ['رقم القسيمة', null],
        'governorate_id'     => ['المحافظة', Governorate::class],
        'area_id'            => ['المنطقة', Area::class],
        'area'               => ['المساحة', null],
        'location_link'      => ['رابط الموقع', null],
        'description'        => ['المواصفات', null],
        'guard_name'         => ['اسم الحارس', null],
        'guard_phone'        => ['رقم الحارس', null],
        'broker_id'          => ['الوسيط', 'client'],
        'manager_id'         => ['مسؤول العقار', 'client'],
        'forsale_link'       => ['رابط فورسيل', null],
        'instagram_link'     => ['رابط انستقرام', null],
        'whatsapp_link'      => ['رابط واتساب', null],
        'marketing_status'   => ['حالة التسويق', [0 => 'لم يتم', 1 => 'تم']],
        'show_soum_in_pdf'   => ['إظهار السوم في PDF', 'bool'],
        'commission'         => ['العمولة', 'money'],
        'notes'              => ['الملاحظات', null],
        'property_status_id' => ['الحالة', PropertyStatus::class],
        'rent_amount'        => ['مبلغ الإيجار', 'money'],
        'price'              => ['السعر', 'money'],
        'conditions'         => ['الشروط', null],
        'grace_period'       => ['فترة السماح', null],
        'tenant_id'          => ['المستأجر / المشتري', 'client'],
        'tenant_start'       => ['بداية الإيجار', 'date'],
        'tenant_end'         => ['نهاية الإيجار', 'date'],
        'sale_date'          => ['تاريخ البيع', 'date'],
        'public_link_enabled'  => ['رابط المشاهدة', [0 => 'معطل', 1 => 'مفعل']],
        'public_show_price'    => ['إظهار السعر في الرابط', 'bool'],
        'public_show_location' => ['إظهار الموقع في الرابط', 'bool'],
        'public_show_contact'  => ['إظهار التواصل في الرابط', 'bool'],
    ];

    public const UNIT_FIELDS = [
        'unit_number'        => ['رقم الوحدة', null],
        'property_cat_id'    => ['نوع الوحدة', PropertyCat::class],
        'floor'              => ['الدور', null],
        'area'               => ['المساحة', null],
        'rooms_count'        => ['عدد الغرف', null],
        'price'              => ['السعر', 'money'],
        'property_status_id' => ['الحالة', PropertyStatus::class],
        'notes'              => ['الملاحظات', null],
        'description'        => ['المواصفات', null],
        'conditions'         => ['الشروط', null],
        'grace_period'       => ['فترة السماح', null],
        'public_link_enabled' => ['رابط المشاهدة', [0 => 'معطل', 1 => 'مفعل']],
    ];

    public const RENTAL_CONTRACT_FIELDS = [
        'contract_number'    => ['رقم العقد', null],
        'tenant_id'          => ['المستأجر', 'client'],
        'start_date'         => ['تاريخ البداية', 'date'],
        'end_date'           => ['تاريخ النهاية', 'date'],
        'total_amount'       => ['قيمة العقد', 'money'],
        'payment_term_id'    => ['دورية الدفع', PaymentTerm::class],
        'payment_type_id'    => ['طريقة الدفع', PaymentType::class],
        'deposit_amount'     => ['التأمين', 'money'],
        'contract_status_id' => ['حالة العقد', ContractStatus::class],
        'notes'              => ['الملاحظات', null],
    ];

    public const SALE_CONTRACT_FIELDS = [
        'contract_number'    => ['رقم العقد', null],
        'buyer_id'           => ['المشتري', 'client'],
        'contract_date'      => ['تاريخ العقد', 'date'],
        'delivery_date'      => ['تاريخ التسليم', 'date'],
        'total_amount'       => ['قيمة العقد', 'money'],
        'payment_type_id'    => ['طريقة الدفع', PaymentType::class],
        'down_payment'       => ['الدفعة المقدمة', 'money'],
        'contract_status_id' => ['حالة العقد', ContractStatus::class],
        'notes'              => ['الملاحظات', null],
    ];

    public const COLLECTION_FIELDS = [
        'collection_type_id' => ['نوع التحصيل', CollectionType::class],
        'client_id'          => ['العميل', 'client'],
        'amount'             => ['المبلغ', 'money'],
        'payment_date'       => ['تاريخ الدفع', 'date'],
        'payment_type_id'    => ['طريقة الدفع', PaymentType::class],
        'payment_status'     => ['حالة الدفع', ['unpaid' => 'غير مدفوع', 'paid' => 'مدفوع', 'failed' => 'فشل الدفع']],
        'notes'              => ['الملاحظات', null],
    ];

    public const SOUM_FIELDS = [
        'bidder_name'  => ['اسم السوام', null],
        'soum_date'    => ['التاريخ', 'date'],
        'amount'       => ['المبلغ', 'money'],
        'soum_type'    => ['نوع السوم', [0 => 'مباشر', 1 => 'غير مباشر']],
        'broker_name'  => ['الوسيط', null],
        'broker_phone' => ['رقم الوسيط', null],
    ];

    /**
     * Append one entry. A logging failure is reported but never allowed to
     * break the write that triggered it.
     */
    public static function log(?int $propertyId, string $action, string $description, ?array $changes = null, ?int $unitId = null): void
    {
        if (! $propertyId) {
            return;
        }

        try {
            PropertyLog::create([
                'property_id' => $propertyId,
                'unit_id'     => $unitId,
                'user_id'     => auth()->id(),
                'action'      => $action,
                'description' => mb_substr($description, 0, 500),
                'changes'     => $changes ?: null,
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }

    /** The tracked columns an `updated` event actually changed, as {label: [old, new]}. */
    public static function changes(Model $model, array $fields): array
    {
        $out = [];
        foreach (array_intersect_key($fields, $model->getChanges()) as $column => [$label, $type]) {
            $old = self::format($model->getRawOriginal($column), $type);
            $new = self::format($model->getAttributes()[$column] ?? null, $type);
            if ($old !== $new) {
                $out[$label] = [$old, $new];
            }
        }

        return $out;
    }

    public static function format($value, $type): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_array($type)) {
            return $type[$value] ?? (string) $value;
        }

        return match (true) {
            $type === 'bool'   => $value ? 'نعم' : 'لا',
            $type === 'date'   => substr((string) $value, 0, 10),
            $type === 'money'  => self::money($value),
            $type === 'client' => Client::whereKey($value)->value('full_name') ?? "#{$value}",
            is_string($type) && class_exists($type) => $type::nameForId($value) ?? "#{$value}",
            default            => (string) $value,
        };
    }

    /** 1500.000 → "1,500 د.ك"; keeps fils only when there are any. */
    public static function money($value): string
    {
        $n = (float) $value;
        $decimals = floor($n) == $n ? 0 : 3;

        return number_format($n, $decimals) . ' د.ك';
    }
}
