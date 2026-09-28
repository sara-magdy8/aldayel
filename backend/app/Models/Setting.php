<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = ['key', 'value'];

    public static function get(string $key, $default = null)
    {
        return static::where('key', $key)->value('value') ?? $default;
    }

    public static function set(string $key, $value): static
    {
        return static::updateOrCreate(['key' => $key], ['value' => $value]);
    }

    /**
     * Whether the tenant is told once the lease has actually run out — the
     * office's `rental_ended_alert_enabled` setting.
     *
     * Defaults to on: an office that has configured expiry reminders at all
     * wants the closing notice too, and this key does not exist yet on any
     * installation that predates the setting.
     */
    public static function rentalEndedAlertEnabled(): bool
    {
        return (bool) static::get('rental_ended_alert_enabled', '1');
    }

    /**
     * How many days before a lease ends each reminder should fire, earliest
     * first — the office's `rental_expiry_alert_days` setting.
     *
     * Stored as a JSON array in a text column, so the decode is defensive: an
     * unset key, or a value edited to something that is not a list, reads as
     * "no reminders configured" rather than breaking the nightly command.
     *
     * @return array<int, int>
     */
    public static function rentalExpiryAlertDays(): array
    {
        $days = json_decode(static::get('rental_expiry_alert_days', '[]'), true);

        if (! is_array($days)) {
            return [];
        }

        return collect($days)
            ->map(fn ($d) => (int) $d)
            ->filter(fn ($d) => $d > 0)
            ->unique()
            ->sortDesc()
            ->values()
            ->all();
    }
}
