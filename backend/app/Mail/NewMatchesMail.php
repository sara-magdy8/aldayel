<?php

namespace App\Mail;

use App\Models\Setting;
use App\Support\MailFormat;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * "مطابقات جديدة" — the digest `matches:alert-admins` sends the office admins.
 *
 * One mail per run, grouped by request, listing only the pairings the ledger has
 * not already announced. Grouped that way because the admin's next action is to
 * call clients: each block is one client and what there now is to offer them.
 *
 * A mail per pairing — or per request — would put the office back where it
 * started, opening a dozen near-identical messages to piece together one morning's
 * work. The count of what did not fit is carried instead, with the system one
 * click away.
 */
class NewMatchesMail extends Mailable
{
    use Queueable, SerializesModels;

    /** Request blocks the mail itself renders; the rest are carried as a count. */
    public const MAX_GROUPS = 15;

    /** Properties listed under each request, likewise. */
    public const MAX_PER_GROUP = 5;

    /**
     * @param array<int, array{request: \App\Models\PropertyRequest, properties: \Illuminate\Support\Collection}> $groups
     *        One entry per request that has new matches, each holding only the
     *        properties not previously announced. Never empty — the command does
     *        not send when there is nothing new.
     */
    public function __construct(public array $groups)
    {
    }

    /** Every new pairing in this digest, across all the groups. */
    public function pairCount(): int
    {
        return array_sum(array_map(fn ($g) => $g['properties']->count(), $this->groups));
    }

    public function envelope(): Envelope
    {
        $officeName = Setting::get('office_name', config('app.name'));

        return new Envelope(
            subject: MailFormat::newMatches($this->pairCount())
                . ' ' . MailFormat::forRequests(count($this->groups))
                . " — {$officeName}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.new-matches',
            with: [
                'title'       => 'مطابقات جديدة',
                'groups'      => array_slice($this->groups, 0, self::MAX_GROUPS),
                // Request blocks that did not fit, as a count.
                'extraGroups' => max(0, count($this->groups) - self::MAX_GROUPS),
                'bannerText'  => MailFormat::newMatches($this->pairCount())
                    . ' ' . MailFormat::forRequests(count($this->groups)),
                'officeName'  => Setting::get('office_name', config('app.name')),
                'officeLogo'  => ($logo = Setting::get('office_logo')) ? asset('storage/' . $logo) : null,
                'ctaLabel'    => 'فتح الطلبات',
                'ctaUrl'      => rtrim((string) config('app.frontend_url'), '/') . '/requests/rent',
            ],
        );
    }
}
