<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When this user last opened the التنبيهات feed.
 *
 * The whole of read state. Everything sent at or before this instant counts as
 * read for this user; everything after it is what the sidebar badge counts. The
 * feed itself has no table — it is a union of the three alert ledgers (see
 * App\Services\NotificationFeed) — so read state had nowhere else to live, and a
 * row per user-and-notification would have been a table larger than anything it
 * described. One column marks off a feed of any size in a single UPDATE.
 *
 * The trade is that read state only moves as a whole: there is no marking one
 * notification off and leaving an older one outstanding, because the only thing
 * that moves is the cut line. Opening the page reads everything.
 *
 * Null on every existing row — nobody has opened the feed yet, so the whole
 * backlog starts unread, which is the honest state for a feed being switched on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('notifications_read_at')->nullable()->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('notifications_read_at');
        });
    }
};
