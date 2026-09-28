<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PaymentTermsSeeder extends Seeder
{
    public function run(): void
    {
        $now  = now();
        $rows = ['دفعة واحدة', 'سنوي', 'ربع سنوي', 'شهري'];

        foreach ($rows as $name) {
            DB::table('payment_terms')->updateOrInsert(
                ['name' => $name],
                ['created_at' => $now, 'updated_at' => $now],
            );
        }
    }
}
