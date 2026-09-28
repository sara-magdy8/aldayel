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
 * The payment link, mailed to the client.
 *
 * Sent when the office picks `email` as the link's delivery channel — the one
 * channel the system delivers itself. `whatsapp` is handed to the office to send
 * from their own number, and `copy` is shared by hand.
 *
 * Deliberately not queued: the office expects the mail to be gone by the time the
 * save returns, and no queue worker runs alongside this app.
 */
class PaymentLinkMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Collection $collection)
    {
    }

    public function envelope(): Envelope
    {
        $officeName = Setting::get('office_name', config('app.name'));

        return new Envelope(
            subject: "رابط دفع {$this->collection->collection_number} — {$officeName}",
            // Replies belong with the office, not the transactional from-address.
            replyTo: array_filter([Setting::get('office_email')]),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.payment-link',
            with: [
                'collection' => $this->collection,
                // Optional: a collection need not be tied to a property.
                'property'   => $this->collection->property,
                'officeName' => Setting::get('office_name', config('app.name')),
                'officeLogo' => ($logo = Setting::get('office_logo')) ? asset('storage/' . $logo) : null,
                'officePhone' => Setting::get('office_phone'),
                'expiresAt'  => $this->collection->paymentLinkExpiresAt(),
            ],
        );
    }
}
