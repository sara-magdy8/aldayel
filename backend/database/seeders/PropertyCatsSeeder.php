<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PropertyCatsSeeder extends Seeder
{
    public function run(): void
    {
        $now  = now();
        $rows = ['عمارة', 'شقة', 'فيلا', 'محل', 'مكتب', 'مستودع', 'أرض'];

        foreach ($rows as $name) {
            DB::table('property_cats')->updateOrInsert(
                ['name' => $name],
                ['created_at' => $now, 'updated_at' => $now],
            );
        }
    }
}
