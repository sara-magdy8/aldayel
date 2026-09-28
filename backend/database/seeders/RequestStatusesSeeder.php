<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RequestStatusesSeeder extends Seeder
{
    public function run(): void
    {
        $now  = now();
        $rows = ['جديد', 'قيد المتابعة', 'مكتمل'];

        foreach ($rows as $name) {
            DB::table('request_statuses')->updateOrInsert(
                ['name' => $name],
                ['created_at' => $now, 'updated_at' => $now],
            );
        }
    }
}
