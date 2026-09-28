<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Point users at the roles table instead of carrying the role as a string.
     *
     * The FK is restrictOnDelete: a role with users on it must not be deletable
     * out from under them, which for an authorization column is the difference
     * between a blocked delete and a table of users who silently lost their
     * permissions.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->after('password')
                ->constrained('roles')->restrictOnDelete();
        });

        foreach (DB::table('roles')->pluck('id', 'slug') as $slug => $id) {
            DB::table('users')->where('role', $slug)->update(['role_id' => $id]);
        }

        // Anything the old column held that is not a known slug (or was empty)
        // lands on the least privileged role rather than on no role at all.
        DB::table('users')->whereNull('role_id')->update([
            'role_id' => DB::table('roles')->where('slug', 'staff')->value('id'),
        ]);

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role')->default('staff')->after('password');
        });

        foreach (DB::table('roles')->pluck('slug', 'id') as $id => $slug) {
            DB::table('users')->where('role_id', $id)->update(['role' => $slug]);
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('role_id');
        });
    }
};
