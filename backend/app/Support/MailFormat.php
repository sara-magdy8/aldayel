<?php

namespace App\Support;

use App\Models\Property;

/**
 * Shared formatting for the match-alert mails.
 *
 * Mail clients strip <style> blocks, so every cell carries its styling inline —
 * which means the same string would otherwise be copy-pasted down two templates
 * and drift on the first tweak. The value formatters live here for the same
 * reason: a size or a price must read identically whichever direction the alert
 * was sent in.
 */
class MailFormat
{
    /** Stands in for a value the record never carried, so no cell renders empty. */
    public const DASH = '—';

    /** A data cell in one of the alert tables. */
    public const CELL = 'padding:10px 12px; font-size:13px; border-bottom:1px solid #f3f4f6; vertical-align:top;';

    /** A label cell — the right-hand column of a summary, or a table header. */
    public const HEAD = 'padding:10px 12px; font-size:12px; font-weight:bold; color:#6b7280; background:#f9fafb; text-align:right; border-bottom:1px solid #e5e7eb;';

    /** Latin digits inside RTL text reorder without this. */
    public const LTR = 'direction:ltr; unicode-bidi:embed;';

    public static function text($value): string
    {
        return $value === null || $value === '' ? self::DASH : (string) $value;
    }

    /** السعر — decimal(10,3) on both sides, always in دينار كويتي. */
    public static function money($value): string
    {
        return $value === null || $value === ''
            ? self::DASH
            : number_format((float) $value, 3) . ' د.ك';
    }

    /** المساحة — decimal(10,2) on both sides. */
    public static function size($value): string
    {
        return $value === null || $value === ''
            ? self::DASH
            : number_format((float) $value, 2) . ' م²';
    }

    /**
     * A property's price for the column that applies: the property splits it by
     * listing type (rent_amount for إيجار, price for بيع) while a request carries
     * a single `price`, so only this side needs choosing between them.
     */
    public static function propertyPrice(Property $property): string
    {
        return self::money($property->listing_type === 'بيع' ? $property->price : $property->rent_amount);
    }

    /**
     * Count a noun in Arabic, which has its own plural forms — "2 عقار" and
     * "3 عقار" both read wrong. Same reasoning as PaymentLinkReminderMail's
     * expiryPhrase(): a subject line the office reads every day should not look
     * machine-generated.
     *
     * @param string $one   المفرد, used alone (عقار واحد)
     * @param string $two   المثنى, used alone (عقاران)
     * @param string $few   جمع القلة, 3–10 (عقارات)
     * @param string $many  التمييز المفرد المنصوب, 11+ (عقاراً)
     */
    public static function plural(int $count, string $one, string $two, string $few, string $many): string
    {
        return match (true) {
            $count === 1 => $one,
            $count === 2 => $two,
            $count <= 10 => "{$count} {$few}",
            default      => "{$count} {$many}",
        };
    }

    /** "مطابقة جديدة واحدة" / "مطابقتان جديدتان" / "5 مطابقات جديدة" / "12 مطابقة جديدة" */
    public static function newMatches(int $count): string
    {
        return self::plural(
            $count,
            'مطابقة جديدة واحدة',
            'مطابقتان جديدتان',
            'مطابقات جديدة',
            'مطابقة جديدة',
        );
    }

    /**
     * "لطلب واحد" / "لطلبين" / "لـ 3 طلبات" / "لـ 12 طلباً" — the whole
     * prepositional phrase, not a noun something else prefixes with "لـ".
     *
     * After a preposition the dual takes the genitive (طلبين, not طلبان) and the
     * لام attaches to the word rather than standing off it, so the preposition
     * cannot be composed at the call site without getting one of the two wrong.
     * The detached "لـ" is kept only before a digit, which is how it is written.
     */
    public static function forRequests(int $count): string
    {
        return match (true) {
            $count === 1 => 'لطلب واحد',
            $count === 2 => 'لطلبين',
            $count <= 10 => "لـ {$count} طلبات",
            default      => "لـ {$count} طلباً",
        };
    }
}
