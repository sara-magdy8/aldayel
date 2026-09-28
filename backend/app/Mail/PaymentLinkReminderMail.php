<?php

namespace App\Mail;

use App\Models\Collection;
use App\Models\Setting;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * A nudge that the payment link is about to expire.
 *
 * Sent by `collections:send-payment-link-reminders` on the day that falls
 * `payment_link_reminder_days` before the link's expiry — never by the admin UI.
 *
 * Reuses the `emails.payment-link` template with `reminder: true`: the client
 * gets the same amount, the same button and the same link, only framed as a
 * reminder. One template means a change to the payment button cannot drift
 * between the first mail and the chase.
 */
class PaymentLinkReminderMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param int $daysLeft Whole days from today until the link stops working,
     *                      counted in the office's timezone by the command.
     */
    public function __construct(public Collection $collection, public int $daysLeft)
    {
    }

    public function envelope(): Envelope
    {
        $officeName = Setting::get('office_name', config('app.name'));

        return new Envelope(
            // No "رابط دفع" prefix on the number here — expiryPhrase() already
            // says it, and the subject line has to survive being truncated.
            subject: "تذكير: {$this->expiryPhrase()} — {$this->collection->collection_number} — {$officeName}",
            // Replies belong with the office, not the transactional from-address.
            replyTo: array_filter([Setting::get('office_email')]),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.payment-link',
            with: [
                'collection'   => $this->collection,
                // Optional: a collection need not be tied to a property.
                'property'     => $this->collection->property,
                'officeName'   => Setting::get('office_name', config('app.name')),
                'officeLogo'   => ($logo = Setting::get('office_logo')) ? asset('storage/' . $logo) : null,
                'officePhone'  => Setting::get('office_phone'),
                'expiresAt'    => $this->collection->paymentLinkExpiresAt(),
                'reminder'     => true,
                'expiryPhrase' => $this->expiryPhrase(),
            ],
        );
    }

    /** Arabic has its own plural forms; "خلال 2 أيام" reads wrong. */
    public function expiryPhrase(): string
    {
        return match (true) {
            $this->daysLeft <= 0 => 'ينتهي رابط الدفع اليوم',
            $this->daysLeft === 1 => 'ينتهي رابط الدفع غداً',
            $this->daysLeft === 2 => 'ينتهي رابط الدفع بعد يومين',
            $this->daysLeft <= 10 => "ينتهي رابط الدفع خلال {$this->daysLeft} أيام",
            default => "ينتهي رابط الدفع خلال {$this->daysLeft} يوماً",
        };
    }
}
