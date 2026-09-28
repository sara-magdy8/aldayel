<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Move every stored timestamp from UTC onto Kuwait time.
 *
 * The app ran on UTC until `config/app.php` was switched to Asia/Kuwait, so every
 * row written before that holds a UTC wall-clock value. Read back under the new
 * timezone those would each be misread as three hours earlier than they happened —
 * a collection recorded at 01:30 Kuwait would report as 22:30 the previous day.
 *
 * Only `datetime`/`timestamp` columns are touched. Date-only columns (payment_date,
 * check_date, the contract dates) are deliberately excluded: they carry no time to
 * shift, and adding hours to a bare date would drag some of them onto another day.
 *
 * On a fresh install this runs against empty tables — migrations complete before
 * any seeder — so it is a no-op rather than a double shift.
 */
return new class extends Migration {
    /** Kuwait is UTC+03 year round; the country observes no daylight saving. */
    private const OFFSET_HOURS = 3;

    public function up(): void
    {
        $this->shiftBy(self::OFFSET_HOURS);
    }

    public function down(): void
    {
        $this->shiftBy(-self::OFFSET_HOURS);
    }

    /**
     * Add (or subtract) the offset across every timestamp column in the schema.
     *
     * All of a table's columns move in one UPDATE. Beyond being one statement
     * instead of several, it means `updated_at` is written explicitly rather than
     * being left to any ON UPDATE CURRENT_TIMESTAMP clause that might be added
     * later — which would otherwise stamp "now" over the value being corrected.
     *
     * NULL columns stay NULL: DATE_ADD returns NULL for a NULL input.
     */
    private function shiftBy(int $hours): void
    {
        foreach ($this->timestampColumns() as $table => $columns) {
            $assignments = array_map(
                fn (string $column) => "`{$column}` = DATE_ADD(`{$column}`, INTERVAL {$hours} HOUR)",
                $columns,
            );

            DB::statement("UPDATE `{$table}` SET " . implode(', ', $assignments));
        }
    }

    /**
     * Every timestamp column in the current database, grouped by table.
     *
     * Read from the live schema rather than hard-coded so the migration covers
     * whatever the environment it runs against actually has — a production database
     * carrying a table this branch never added still gets corrected.
     *
     * @return array<string, array<int, string>>
     */
    private function timestampColumns(): array
    {
        $rows = DB::select(
            "SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
               FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = ?
                AND DATA_TYPE IN ('datetime', 'timestamp')
           ORDER BY TABLE_NAME, ORDINAL_POSITION",
            [DB::getDatabaseName()],
        );

        $grouped = [];

        foreach ($rows as $row) {
            $grouped[$row->table_name][] = $row->column_name;
        }

        return $grouped;
    }
};
