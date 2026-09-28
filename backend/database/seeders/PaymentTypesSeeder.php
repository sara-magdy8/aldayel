<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PaymentTypesSeeder extends Seeder
{
    public function run(): void
    {
        $now  = now();
        $rows = ['نقدي', 'شيك', 'تحويل بنكي', 'بطاقة ائتمان', 'تقسيط بنكي', 'تقسيط مباشر', 'أخرى'];

        foreach ($rows as $name) {
            DB::table('payment_types')->updateOrInsert(
                ['name' => $name],
                ['created_at' => $now, 'updated_at' => $now],
            );
        }
    }
}
