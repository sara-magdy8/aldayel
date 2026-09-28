<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The user who recorded a سوم. Nullable: bids that predate this column have no
 * known author, and deleting a user keeps their bids (nullOnDelete).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('soums', function (Blueprint $table) {
            $table->foreignId('created_by')->nullable()->after('broker_phone')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('soums', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
        });
    }
};
