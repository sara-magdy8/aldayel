<?php

namespace App\Mail;

use App\Models\RentalContract;
use App\Models\Setting;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * What the tenant receives about their lease running out — both the run-up
 * ("تنبيه قرب انتهاء عقد الإيجار") and the closing notice once it has actually
 * ended ("انتهاء عقد الإيجار").
 *
 * Sent by `contracts:send-expiry-alerts` on the reminder points the office set
 * on the التنبيهات screen — never by the admin UI. One mail per contract, to the
 * tenant on that contract and nobody else: this is the client's own lease, and
 * a digest listing other tenants' contracts is not something a client may see.
 *
 * The two framings share one template, as PaymentLinkMail and its reminder do:
 * same lease details, same contact footer, only the banner and one sentence
 * differ. One template means a change to how a lease is presented cannot drift
 * between the warning and the notice.
 *
 * Carries no link into the system. The tenant has no account, so the only useful
 * next step is contacting the office, and the footer carries its phone and mail
 * for exactly that. Replies go to the office address for the same reason.
 */
class RentalContractExpiryMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param int $daysLeft Whole days from today until the lease ends, counted
     *                      in the office's timezone by the command. Negative
     *                      once the lease is over, which is what switches this
     *                      mail from a warning to a closing notice.
     */
    public function __construct(public RentalContract $contract, public int $daysLeft)
    {
    }

    /**
     * Whether the lease is already over.
     *
     * Derived from $daysLeft rather than carried as its own flag: a separate
     * boolean could disagree with the number beside it, and "ended" is exactly
     * what a negative days-left means.
     */
    public function ended(): bool
    {
        return $this->daysLeft < 0;
    }

    public function envelope(): Envelope
    {
        $officeName = Setting::get('office_name', config('app.name'));

        return new Envelope(
            subject: ($this->ended() ? '' : 'تنبيه: ')
                . "{$this->expiryPhrase()} — عقد {$this->contract->contract_number} — {$officeName}",
            // Replies belong with the office, not the transactional from-address.
            replyTo: array_filter([Setting::get('office_email')]),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.rental-contract-expiry',
            with: [
                'contract'     => $this->contract,
                'tenant'       => $this->contract->tenant,
                // Optional: the lease may be on a whole property rather than a unit.
                'unit'         => $this->contract->unit,
                'property'     => $this->contract->property,
                'officeName'   => Setting::get('office_name', config('app.name')),
                'officeLogo'   => ($logo = Setting::get('office_logo')) ? asset('storage/' . $logo) : null,
                'officePhone'  => Setting::get('office_phone'),
                'officeEmail'  => Setting::get('office_email'),
                'expiryPhrase' => $this->expiryPhrase(),
                'ended'        => $this->ended(),
            ],
        );
    }

    /** Arabic has its own plural forms; "خلال 2 أيام" reads wrong. */
    public function expiryPhrase(): string
    {
        return match (true) {
            // How long ago is left out on purpose: the exact end date is in the
            // table below, and "انتهى قبل 3 أيام" only reads as a reproach.
            $this->daysLeft < 0   => 'انتهى عقد الإيجار',
            $this->daysLeft === 0 => 'ينتهي عقد الإيجار اليوم',
            $this->daysLeft === 1 => 'ينتهي عقد الإيجار غداً',
            $this->daysLeft === 2 => 'ينتهي عقد الإيجار بعد يومين',
            $this->daysLeft <= 10 => "ينتهي عقد الإيجار خلال {$this->daysLeft} أيام",
            default               => "ينتهي عقد الإيجار خلال {$this->daysLeft} يوماً",
        };
    }
}
