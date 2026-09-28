<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * التصنيفات والنشاط are kept as two lists now — one for عقارات الإيجار and one for
 * عقارات البيع — so each side of the office picks from its own set.
 *
 * The split is a pair of visibility flags on the existing rows rather than a
 * duplicated row per listing type. A category is still one row with one id, which
 * is what keeps everything downstream working untouched: the property/request
 * mutators still resolve a name to a single id, the matcher still compares
 * property_cat_id between a بيع property and a شراء request, and reports that span
 * both types still group "شقة" as one category instead of two.
 *
 * Existing rows become the rental list, as asked. They are additionally flagged
 * for sale wherever a بيع property, a بيع unit, or a شراء request already uses
 * them — otherwise those records would carry a category or activity that is no
 * longer in their own list, and re-saving one would fail validation.
 */
return new class extends Migration {
    public function up(): void
    {
        foreach (['property_cats', 'activities'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->boolean('for_rental')->default(true)->after('name');
                $t->boolean('for_sale')->default(false)->after('for_rental');
            });
        }

        DB::table('property_cats')->whereIn('id', $this->categoriesUsedBySale())->update(['for_sale' => true]);
        DB::table('activities')->whereIn('id', $this->activitiesUsedBySale())->update(['for_sale' => true]);
    }

    public function down(): void
    {
        foreach (['property_cats', 'activities'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn(['for_rental', 'for_sale']);
            });
        }
    }

    /** Category ids a بيع property, بيع unit, or شراء request already points at. */
    private function categoriesUsedBySale(): array
    {
        return array_merge(
            DB::table('properties')->where('listing_type', 1)->whereNotNull('property_cat_id')->pluck('property_cat_id')->all(),
            DB::table('units')->where('listing_type', 1)->whereNotNull('property_cat_id')->pluck('property_cat_id')->all(),
            DB::table('requests')->where('request_type', 1)->whereNotNull('property_cat_id')->pluck('property_cat_id')->all(),
        );
    }

    /** Activity ids linked to a بيع property, بيع unit, or شراء request. */
    private function activitiesUsedBySale(): array
    {
        return array_merge(
            DB::table('activity_property')->whereIn('property_id', DB::table('properties')->where('listing_type', 1)->select('id'))->pluck('activity_id')->all(),
            DB::table('activity_unit')->whereIn('unit_id', DB::table('units')->where('listing_type', 1)->select('id'))->pluck('activity_id')->all(),
            DB::table('activity_request')->whereIn('request_id', DB::table('requests')->where('request_type', 1)->select('id'))->pluck('activity_id')->all(),
        );
    }
};
