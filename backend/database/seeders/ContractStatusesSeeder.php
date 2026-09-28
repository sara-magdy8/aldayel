<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ContractStatusesSeeder extends Seeder
{
    public function run(): void
    {
        $now  = now();
        // Shared by rental (مسودة/نشط/منتهي/ملغي) and sale (مسودة/نشط/مكتمل/ملغي) contracts.
        $rows = ['مسودة', 'نشط', 'منتهي', 'مكتمل', 'ملغي'];

        foreach ($rows as $name) {
            DB::table('contract_statuses')->updateOrInsert(
                ['name' => $name],
                ['created_at' => $now, 'updated_at' => $now],
            );
        }
    }
}
