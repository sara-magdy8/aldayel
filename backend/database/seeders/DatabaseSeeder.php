<?php

namespace Database\Seeders;

use App\Models\Area;
use App\Models\Client;
use App\Models\Governorate;
use App\Models\Property;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // ── Lookup tables ──────────────────────────────────────
        $this->call([
            CollectionTypesSeeder::class,
            PaymentTypesSeeder::class,
            PaymentTermsSeeder::class,
            PaymentBeneficiariesSeeder::class,
            PropertyCatsSeeder::class,
            PropertyStatusesSeeder::class,
            RequestStatusesSeeder::class,
            ContractStatusesSeeder::class,
            GovernoratesAreasSeeder::class,
        ]);

        // ── Users ──────────────────────────────────────────────
        User::create([
            'name'      => 'مدير النظام',
            'email'     => 'admin@office.com',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        User::create([
            'name'      => 'أحمد الموظف',
            'email'     => 'staff@office.com',
            'password'  => Hash::make('password123'),
            'role'      => 'staff',
            'is_active' => true,
        ]);

        // ── Settings ───────────────────────────────────────────
        Setting::set('office_name',    'مكتب العقارات');
        Setting::set('office_phone',   '965-2222-3333');
        Setting::set('office_email',   'info@office.com');
        Setting::set('office_address', 'الكويت — حولي — شارع تونس');

        // ── Clients ────────────────────────────────────────────
        $clients = [
            ['full_name' => 'محمد عبدالله الرشيد',   'phone' => '96550012345', 'type' => 'فرد',  'status' => 'نشط'],
            ['full_name' => 'شركة الخليج للاستثمار', 'phone' => '96522221111', 'type' => 'شركة', 'status' => 'نشط'],
            ['full_name' => 'فاطمة يوسف المطيري',    'phone' => '96555128890', 'type' => 'فرد',  'status' => 'نشط'],
            ['full_name' => 'عبدالعزيز سالم العنزي', 'phone' => '96566004321', 'type' => 'فرد',  'status' => 'نشط'],
            ['full_name' => 'مؤسسة النور التجارية',  'phone' => '96523456789', 'type' => 'شركة', 'status' => 'غير نشط'],
            ['full_name' => 'نورة خالد الحربي',      'phone' => '96556781234', 'type' => 'فرد',  'status' => 'نشط'],
            ['full_name' => 'سعد محمد البلوشي',      'phone' => '96599003344', 'type' => 'فرد',  'status' => 'نشط'],
            ['full_name' => 'شركة الأفق العقارية',   'phone' => '96522115566', 'type' => 'شركة', 'status' => 'نشط'],
            ['full_name' => 'منى عيسى الشمري',       'phone' => '96555447788', 'type' => 'فرد',  'status' => 'نشط'],
            ['full_name' => 'جاسم علي العجمي',       'phone' => '96566772233', 'type' => 'فرد',  'status' => 'نشط'],
        ];

        foreach ($clients as $client) {
            Client::create($client);
        }

        // ── Properties ─────────────────────────────────────────
        $owner = Client::first();

        // Resolve a governorate + area name pair to their lookup ids.
        $location = function (string $governorate, string $area) {
            $govId = Governorate::idForName($governorate);
            return [
                'governorate_id' => $govId,
                'area_id'        => Area::where('name', $area)->where('governorate_id', $govId)->value('id'),
            ];
        };

        Property::create([
            'name'          => 'عمارة النور',
            'property_type' => 'متعدد الوحدات',
            'listing_type'  => 'إيجار',
            'category'      => 'عمارة',
            'owner_id'      => $owner->id,
            'plot_number'   => '12345',
            ...$location('الأحمدي', 'العقيلة'),
            'status'        => 'متاح',
            'rent_amount'   => 350,
        ]);

        Property::create([
            'name'          => 'شقة الزهراء',
            'property_type' => 'مستقل',
            'listing_type'  => 'إيجار',
            'category'      => 'شقة',
            'owner_id'      => $owner->id,
            'plot_number'   => '67890',
            ...$location('حولي', 'السالمية'),
            'status'        => 'متاح',
            'rent_amount'   => 280,
        ]);

        Property::create([
            'name'          => 'أرض الاستثمار',
            'property_type' => 'مستقل',
            'listing_type'  => 'بيع',
            'category'      => 'أرض',
            'owner_id'      => $owner->id,
            'plot_number'   => '11223',
            ...$location('الجهراء', 'الجهراء القديمة'),
            'status'        => 'متاح',
            'price'         => 120000,
        ]);
    }
}
