<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CollectionTypesSeeder extends Seeder
{
    public function run(): void
    {
        $now  = now();
        $rows = ['عمولة', 'إيجار (دفعة دورية)', 'عربون', 'دفعة نقدية', 'أخرى'];

        foreach ($rows as $name) {
            DB::table('collection_types')->updateOrInsert(
                ['name' => $name],
                ['created_at' => $now, 'updated_at' => $now],
            );
        }
    }
}
