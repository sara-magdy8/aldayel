<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('clients', function (Blueprint $table) {
            $table->id();
            $table->string('full_name');
            $table->string('phone');
            $table->string('email')->nullable();
            $table->boolean('type')->default(0)->comment('0=>فرد, 1=>شركة');
            $table->text('notes')->nullable();
            $table->boolean('status')->default(1)->comment('0=>غير نشط, 1=>نشط');
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clients');
    }
};
