<?php

namespace App\Console\Commands;

use App\Mail\PaymentLinkReminderMail;
use App\Models\Collection;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Nudge clients whose payment link is about to expire.
 *
 * Scheduled daily at 01:00 office time (see routes/console.php). For every
 * unpaid payment link the reminder day is `expiry - payment_link_reminder_days`;
 * when that day is today, the client gets one mail.
 *
 * Silent by design when there is nothing to send to: a client with no email on
 * file is skipped, not reported as a failure — the office chose to record that
 * client without an address, and there is nothing to fix.
 */
class SendPaymentLinkReminders extends Command
{
    protected $signature = 'collections:send-payment-link-reminders
                            {--dry-run : List who would be mailed without sending anything}';

    protected $description = 'Email clients whose payment link expires in payment_link_reminder_days';

    public function handle(): int
    {
        // Both sides of the comparison are office time: the app runs on
        // Asia/Kuwait, so a link created at 22:00 already belongs to the Kuwaiti
        // day the office would call it, with no conversion to do here.
        $today   = Carbon::now()->startOfDay();
        $dryRun  = (bool) $this->option('dry-run');
        $sent    = 0;
        $skipped = 0;

        $this->candidates()->chunkById(200, function ($collections) use ($today, $dryRun, &$sent, &$skipped) {
            foreach ($collections as $collection) {
                $expiresAt = $collection->paymentLinkExpiresAt();

                // Guarded by whereNotNull on the query, but paymentLinkExpiresAt()
                // also needs created_at — a rare hand-inserted row could lack it.
                if (! $expiresAt) {
                    continue;
                }

                $expiryDay = $expiresAt->copy()->startOfDay();
                $remindOn  = $expiryDay->copy()->subDays($collection->payment_link_reminder_days);

                // Exactly today, not "today or later": a reminder window that has
                // already passed (the command was down for a week, say) is stale —
                // and one that has not arrived yet belongs to a later run.
                if (! $remindOn->equalTo($today)) {
                    continue;
                }

                // The one rule the office asked for: a client with no address on
                // file gets nothing. Filtered in PHP rather than in the query so
                // the summary below can report an honest count of who was passed
                // over — a row dropped by SQL would never reach this loop.
                $email = $collection->client?->email;
                if (! $email) {
                    $skipped++;
                    continue;
                }

                $daysLeft = (int) $today->diffInDays($expiryDay, false);

                if ($dryRun) {
                    $this->line("[dry-run] {$collection->collection_number} → {$email} ({$daysLeft}d left)");
                    $sent++;
                    continue;
                }

                if ($this->remind($collection, $email, $daysLeft)) {
                    $sent++;
                }
            }
        });

        $this->info($dryRun
            ? "Would mail {$sent} reminder(s); {$skipped} client(s) have no email."
            : "Sent {$sent} reminder(s); skipped {$skipped} client(s) with no email.");

        return self::SUCCESS;
    }

    /**
     * Links that could still be chased today.
     *
     * `payment_link_reminder_days` of 0 means "بدون تذكير" in the admin UI — a
     * deliberate choice, not a missing value — so it is excluded alongside null.
     */
    private function candidates()
    {
        return Collection::query()
            ->with('client:id,full_name,email')
            ->where('collection_method', 'payment_link')
            // `failed` links stay chaseable: the client can retry the same URL.
            ->where('payment_status', '!=', Collection::PAYMENT_PAID)
            ->whereNotNull('payment_link_token')
            // No expiry means the link never dies, so there is nothing to warn about.
            ->whereNotNull('payment_link_expiry_days')
            ->where('payment_link_reminder_days', '>', 0)
            ->whereNull('payment_link_reminded_at');
    }

    /**
     * Mail one reminder and stamp the row so it cannot go out twice.
     *
     * A send that throws is logged and swallowed: one unreachable address must
     * not abort the rest of the night's reminders. The stamp is only written on
     * success, but a failed row will not retry tomorrow either — by then its
     * reminder day has passed. Reminders are best-effort; the link itself stays
     * valid and the office can still chase by hand.
     */
    private function remind(Collection $collection, string $email, int $daysLeft): bool
    {
        // Quiet + without timestamps: a reminder is not an edit of the collection,
        // and touching updated_at would reorder the office's list for no reason.
        Collection::withoutTimestamps(
            fn () => $collection->forceFill(['payment_link_reminded_at' => now()])->saveQuietly()
        );

        try {
            Mail::to($email)->send(new PaymentLinkReminderMail($collection, $daysLeft));
        } catch (Throwable $e) {
            Log::error('Failed to mail the payment link reminder.', [
                'collection_id' => $collection->id,
                'error'         => $e->getMessage(),
            ]);

            return false;
        }
        

        return true;
    }
}
