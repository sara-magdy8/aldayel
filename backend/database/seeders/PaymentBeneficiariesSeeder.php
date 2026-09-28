<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PaymentBeneficiariesSeeder extends Seeder
{
    public function run(): void
    {
        $now  = now();
        $rows = ['المكتب', 'المالك', 'الوسيط'];

        foreach ($rows as $name) {
            DB::table('payment_beneficiaries')->updateOrInsert(
                ['name' => $name],
                ['created_at' => $now, 'updated_at' => $now],
            );
        }
    }
}
