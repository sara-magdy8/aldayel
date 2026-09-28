<?php

namespace App\Support;

use App\Models\Property;
use App\Models\Setting;

/**
 * Single source of truth for how a property's details are presented to the
 * outside world. Both the public share link (PublicViewController) and the
 * admin PDF export read their field values from here, so a change to a label's
 * source — e.g. how "contact" resolves — only needs to happen once.
 *
 * @param bool $respectVisibility  When true (public link) the owner's
 *   public_show_* toggles gate price/address/contact and the status is
 *   normalised to متاح/محجوز. When false (admin export) everything is returned
 *   as-is, plus the extra internal fields the sheet needs.
 */
class PropertyPresenter
{
    public static function detail(Property $property, bool $respectVisibility): array
    {
        // Contact number shown on the public link / PDF comes from the office's
        // configured phone (settings.office_phone), falling back to the
        // property's broker/guard number if the setting is unset.
        $contact     = Setting::get('office_phone'); // ?: ($property->broker_phone_num ?? $property->guard_phone);
        $displayPrice = $property->rent_amount ?? $property->price;

        $data = [
            'type'          => 'property',
            'name'          => $property->name,
            'property_type' => $property->property_type,
            'category'      => $property->category,
            'activity'      => $property->activity,
            'area'          => $property->area,
            'description'   => $property->description,
            'status'        => $respectVisibility
                ? (in_array($property->status, ['متاح', 'محجوز']) ? $property->status : 'محجوز')
                : $property->status,
            'price'         => $respectVisibility
                ? ($property->public_show_price ? $displayPrice : null)
                : $displayPrice,
            'address'       => $respectVisibility
                ? ($property->public_show_location ? $property->address : null)
                : $property->address,
            'location_link' => $respectVisibility
                ? ($property->public_show_location ? $property->location_link : null)
                : $property->location_link,
            'contact'       => $respectVisibility
                ? ($property->public_show_contact ? $contact : null)
                : $contact,
            // Terms are shown on both the public link and the admin PDF.
            // grace_period is a rental-only concept; the client gates it on
            // listing_type (بيع = sale, إيجار = rental).
            'listing_type'  => $property->listing_type,
            'conditions'    => $property->conditions,
            'grace_period'  => $property->grace_period,
            // Marketing post for the property. Not gated by a public_show_*
            // toggle — the linked Instagram post is already public, and the
            // client simply hides the button when this is empty.
            'instagram_link' => $property->instagram_link,
        ];

        // مسؤول العقار / الوسيط. These resolve through the linked clients
        // (broker_id / manager_id) via the model accessors, so eager-load
        // `broker` and `manager` on the query feeding this.
        // Internal contacts — never sent over the public share link, only on
        // the authenticated admin export.
        if (! $respectVisibility) {
            $data += [
                'manager_name'      => $property->manager_name,
                'manager_phone_num' => $property->manager_phone_num,
                'broker_name'       => $property->broker_name,
                'broker_phone_num'  => $property->broker_phone_num,
                // حالة البناء — عقارات البيع only; null on rentals.
                'building_status'   => $property->building_status,
            ];
        }

        return $data;
    }
}
