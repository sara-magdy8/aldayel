<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PropertyStatusesSeeder extends Seeder
{
    public function run(): void
    {
        $now  = now();
        $rows = ['متاح', 'محجوز', 'مؤجر', 'مباع'];

        foreach ($rows as $name) {
            DB::table('property_statuses')->updateOrInsert(
                ['name' => $name],
                ['created_at' => $now, 'updated_at' => $now],
            );
        }
    }
}
