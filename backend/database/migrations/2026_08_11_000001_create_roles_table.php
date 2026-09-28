<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * الصلاحيات — the roles a system user can hold.
     *
     * Two columns rather than the usual lookup's single `name`, because a role is
     * not only a label: authorization reads it. `slug` is the stable key every
     * permission check compares against, and `name` is the Arabic text shown in
     * the UI. Keeping them apart means the office can rename "مدير" without
     * locking every administrator out of the system.
     */
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('name');
            $table->timestamps();
        });

        DB::table('roles')->insert([
            ['slug' => 'admin', 'name' => 'مدير',  'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'staff', 'name' => 'موظف', 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void { Schema::dropIfExists('roles'); }
};
