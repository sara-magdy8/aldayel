<?php

namespace App\Observers;

use App\Models\Collection;
use App\Models\Property;
use App\Models\PropertyAttachment;
use App\Models\RentalContract;
use App\Models\SaleContract;
use App\Models\Soum;
use App\Models\Unit;
use App\Support\PropertyLogger;
use Illuminate\Database\Eloquent\Model;

/**
 * Feeds سجل العقار from model events, so every write path — the admin
 * controllers, ListingStatus's derived status changes, the payment gateway
 * callback — is recorded without each caller remembering to log.
 *
 * Registered for each model in AppServiceProvider::boot().
 */
class PropertyLogObserver
{
    public function created(Model $model): void
    {
        match (true) {
            $model instanceof Property => $this->log($model, 'property_created', 'إضافة العقار'),
            $model instanceof Unit => $this->log($model, 'unit_created', "إضافة الوحدة {$model->unit_number}"),
            $model instanceof RentalContract => $this->log($model, 'rental_contract_created', "إضافة عقد إيجار رقم {$model->contract_number}"),
            $model instanceof SaleContract => $this->log($model, 'sale_contract_created', "إضافة عقد بيع رقم {$model->contract_number}"),
            $model instanceof Collection => $this->log($model, 'collection_created',
                "إضافة تحصيل رقم {$model->collection_number} بمبلغ " . PropertyLogger::money($model->amount)),
            $model instanceof Soum => $this->log($model, 'soum_created',
                'إضافة سوم بمبلغ ' . PropertyLogger::money($model->amount) . " من {$model->bidder_name}"),
            $model instanceof PropertyAttachment => $this->log($model, 'attachment_created', "إضافة مرفق {$model->file_name}"),
            default => null,
        };
    }

    public function updated(Model $model): void
    {
        [$fields, $action, $description] = match (true) {
            $model instanceof Property => [PropertyLogger::PROPERTY_FIELDS, 'property_updated', 'تعديل بيانات العقار'],
            $model instanceof Unit => [PropertyLogger::UNIT_FIELDS, 'unit_updated', "تعديل الوحدة {$model->unit_number}"],
            $model instanceof RentalContract => [PropertyLogger::RENTAL_CONTRACT_FIELDS, 'rental_contract_updated', "تعديل عقد إيجار رقم {$model->contract_number}"],
            $model instanceof SaleContract => [PropertyLogger::SALE_CONTRACT_FIELDS, 'sale_contract_updated', "تعديل عقد بيع رقم {$model->contract_number}"],
            $model instanceof Collection => [PropertyLogger::COLLECTION_FIELDS, 'collection_updated', "تعديل التحصيل رقم {$model->collection_number}"],
            $model instanceof Soum => [PropertyLogger::SOUM_FIELDS, 'soum_updated', "تعديل سوم {$model->bidder_name}"],
            default => [null, null, null],
        };

        if (! $fields) {
            return;
        }

        // Derived-only saves (has_contract, a link token…) touch nothing tracked.
        $changes = PropertyLogger::changes($model, $fields);
        if (! $changes) {
            return;
        }

        // Two events worth their own wording rather than a generic "edit".
        if ($model instanceof Property && array_keys($changes) === ['الحالة']) {
            [$action, $description] = ['property_status_changed', 'تغيير حالة العقار'];
        }
        if ($model instanceof Collection && $model->wasChanged('payment_status') && $model->isPaid()) {
            [$action, $description] = ['collection_paid', "تم دفع التحصيل رقم {$model->collection_number}"];
        }

        $this->log($model, $action, $description, $changes);
    }

    public function deleted(Model $model): void
    {
        match (true) {
            // The property's own log is cascaded away with it.
            $model instanceof Unit => $this->log($model, 'unit_deleted', "حذف الوحدة {$model->unit_number}"),
            $model instanceof RentalContract => $this->log($model, 'rental_contract_deleted', "حذف عقد إيجار رقم {$model->contract_number}"),
            $model instanceof SaleContract => $this->log($model, 'sale_contract_deleted', "حذف عقد بيع رقم {$model->contract_number}"),
            $model instanceof Collection => $this->log($model, 'collection_deleted',
                "حذف التحصيل رقم {$model->collection_number} بمبلغ " . PropertyLogger::money($model->amount)),
            $model instanceof Soum => $this->log($model, 'soum_deleted',
                'حذف سوم بمبلغ ' . PropertyLogger::money($model->amount) . " من {$model->bidder_name}"),
            $model instanceof PropertyAttachment => $this->log($model, 'attachment_deleted', "حذف مرفق {$model->file_name}"),
            default => null,
        };
    }

    private function log(Model $model, string $action, string $description, ?array $changes = null): void
    {
        [$propertyId, $unitId] = $this->owner($model);
        PropertyLogger::log($propertyId, $action, $description, $changes, $unitId);
    }

    /**
     * [property_id, unit_id] a model's entry is filed under. Unit-level
     * contracts / collections may carry only unit_id; their property is the
     * unit's.
     */
    private function owner(Model $model): array
    {
        if ($model instanceof Property) {
            return [$model->id, null];
        }
        if ($model instanceof Unit) {
            // A deleted unit's row is already gone — linking to it would fail the FK.
            return [$model->property_id, $model->exists ? $model->id : null];
        }

        $unitId = $model->unit_id ?? null;
        $propertyId = $model->property_id
            ?? ($unitId ? Unit::whereKey($unitId)->value('property_id') : null);

        return [$propertyId, $unitId];
    }
}
