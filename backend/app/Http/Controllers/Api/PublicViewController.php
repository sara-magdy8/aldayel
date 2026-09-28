<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Property;
use App\Models\Unit;
use App\Support\PropertyPresenter;
use App\Models\Setting;

class PublicViewController extends Controller
{
    public function show(string $token)
    {
        // البحث في العقارات أولاً
        $property = Property::where('public_link_token', $token)
            ->where('public_link_enabled', true)
            ->with(['attachments'])
            ->first();

        if ($property) {
            return response()->json($this->formatProperty($property));
        }

        // البحث في الوحدات
        $unit = Unit::where('public_link_token', $token)
            ->where('public_link_enabled', true)
            // activitiesLookup backs the `activity` accessor on both the unit
            // and its parent property, which the unit falls back to below.
            ->with(['images', 'activitiesLookup', 'property.activitiesLookup'])
            ->first();

        if ($unit) {
            return response()->json($this->formatUnit($unit));
        }

        return response()->json(['message' => 'هذا الرابط غير متاح.'], 404);
    }

    private function formatProperty(Property $property): array
    {
        return PropertyPresenter::detail($property, respectVisibility: true) + [
            'images' => $property->attachments->map(fn($a) => asset('storage/' . $a->file_path)),
        ];
    }

    private function formatUnit(Unit $unit): array
    {
        $property = $unit->property;
        $contact = Setting::get('office_phone'); //$unit->broker_phone_num ?? $unit->guard_phone;
        return [
            'type'         => 'unit',
            'unit_number'  => $unit->unit_number,
            'unit_type'    => $unit->unit_type,
            'category'     => $unit->unit_type,
            // Units created in bulk carry their own activities; older ones have
            // none and fall back to the parent property's.
            'activity'     => $unit->activity ?? $property?->activity,
            'floor'        => $unit->floor,
            'area'         => $unit->area,
            'rooms_count'  => $unit->rooms_count,
            // إيجار / بيع — drives the conditions heading and gates فترة السماح.
            'listing_type' => $unit->listing_type,
            'description'  => $unit->description,
            'conditions'   => $unit->conditions,
            // Rental-only, same rule the unit form and the property view follow.
            'grace_period' => $unit->listing_type === 'إيجار' ? $unit->grace_period : null,
            'status'       => in_array($unit->status, ['متاح', 'محجوز']) ? $unit->status : 'محجوز',
            'price'        => $unit->public_show_price ? $unit->price : null,
            'address'      => $unit->public_show_location ? $property?->address : null,
            'location_link' => $unit->public_show_location ? $property?->location_link : null,
            'contact'      => $unit->public_show_contact ? $contact : null,
            // مسؤول العقار / الوسيط are internal contacts and are deliberately
            // not exposed on the public link — see PropertyPresenter::detail().
            'images'       => $unit->images->map(fn($i) => asset('storage/' . $i->image_path)),
        ];
    }
}
