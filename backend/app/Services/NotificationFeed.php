<?php

namespace App\Services;

use App\Models\Collection as CollectionModel;
use App\Models\MatchAlert;
use App\Models\RentalContractExpiryAlert;
use App\Models\User;
use App\Support\MailFormat;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection as SupportCollection;
use Illuminate\Support\Facades\DB;

/**
 * The التنبيهات feed: everything the system has mailed out, in one timeline.
 *
 * There is no notifications table, and deliberately so. Each of the three
 * mailing commands already keeps a ledger of what it sent — `match_alerts`,
 * `rental_contract_expiry_alerts`, and the `payment_link_reminded_at` stamp on
 * `collections` — written only once the mail is actually away. A fourth table
 * duplicating them could only ever disagree with them, and the backlog already
 * on a live system would have no rows in it at all. So the feed is a read over
 * what is already true: turn the three ledgers into one ordered stream, and the
 * page shows exactly the mail that was sent, history included, with nothing for
 * the commands to remember to write.
 *
 * The union is built in SQL rather than merged in PHP because ordering and
 * paging have to span all three: page two of a feed is not page two of each
 * source. Only the ids that survive paging are then hydrated, so a page costs
 * one union query plus one query per source represented on it.
 *
 * Read state is the one thing the ledgers cannot carry — they know the office
 * mailed a tenant, not that an admin has since looked at it — so it lives beside
 * them as `users.notifications_read_at`: the moment that user last opened the
 * feed. Everything sent at or before it is read for them, everything after is
 * not. One column, no per-notification rows, and the badge is the honest answer
 * to "has anything arrived since I last looked".
 *
 * The cost of a single watermark is that read state can only ever move as a
 * whole — there is no marking one notification off and leaving an older one
 * outstanding, because the only thing that moves is the cut line. That is the
 * deliberate trade: opening the page reads everything.
 *
 * One consequence of reading through to the live records: a row describes the
 * record as it stands now, not as the mail froze it. Re-date a lease or change a
 * collection's amount and the feed follows, while the client's inbox still holds
 * the old figure. That is the right trade for what this page is for — the office
 * asks it "what is going on with this contract", not "quote me the mail" — but
 * it is why nothing here should be read as a copy of what was sent. Storing a
 * rendered snapshot per notification would fix that and lose the far more
 * valuable property that the feed cannot drift from the records it describes.
 */
class NotificationFeed
{
    /** A property was found answering an open request (`match_alerts`). */
    public const TYPE_MATCH = 'match';

    /** A lease is nearing its end, or has reached it (`rental_contract_expiry_alerts`). */
    public const TYPE_CONTRACT_EXPIRY = 'contract_expiry';

    /** A payment link is nearing its expiry (`collections.payment_link_reminded_at`). */
    public const TYPE_PAYMENT_LINK = 'payment_link';

    public const TYPES = [self::TYPE_MATCH, self::TYPE_CONTRACT_EXPIRY, self::TYPE_PAYMENT_LINK];

    /** Read-state filters the feed accepts. */
    public const STATUSES = ['all', 'unread', 'read'];

    /**
     * One page of the feed, newest first, as presentation-ready rows.
     *
     * @param array{types?: array<int, string>, status?: string, search?: string|null,
     *              date_from?: string|null, date_to?: string|null, per_page?: int} $filters
     */
    public function paginate(User $user, array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = $this->filtered($user, $filters);

        // source_id breaks the tie so a page boundary cannot land mid-second and
        // show the same row twice — several alerts are written in one command run
        // and share a timestamp to the second.
        $paginator = $query
            ->orderByDesc('n.occurred_at')
            ->orderByDesc('n.source_id')
            ->paginate($perPage);

        $paginator->setCollection($this->present($user, collect($paginator->items())));

        return $paginator;
    }

    /**
     * How many notifications this user has not seen — the sidebar badge.
     *
     * Counted over the union rather than off a stored total: the three ledgers
     * grow from scheduled commands that know nothing about who has read what, so
     * any cached counter would drift the first night they run.
     */
    public function unreadCount(User $user): int
    {
        return $this->filtered($user, ['status' => 'unread'])->count();
    }

    /**
     * The union, narrowed by everything in `$filters` except ordering and paging.
     *
     * Shared by paginate() and unreadCount() so the badge can never disagree with
     * the list it is counting.
     *
     * @param array<string, mixed> $filters
     */
    private function filtered(User $user, array $filters): Builder
    {
        $types  = $this->normaliseTypes($filters['types'] ?? []);
        $search = $this->normaliseSearch($filters['search'] ?? null);

        $query = DB::query()->fromSub($this->union($types, $search), 'n');

        if (! empty($filters['date_from'])) {
            $query->whereDate('n.occurred_at', '>=', $filters['date_from']);
        }

        if (! empty($filters['date_to'])) {
            $query->whereDate('n.occurred_at', '<=', $filters['date_to']);
        }

        match ($filters['status'] ?? 'all') {
            'unread' => $this->whereUnread($query, $user),
            'read'   => $this->whereRead($query, $user),
            default  => null,
        };

        return $query;
    }

    // ── The union ───────────────────────────────────────────────────────────

    /**
     * The three ledgers as one stream of (type, source_id, occurred_at).
     *
     * Only the three columns paging needs are selected. Everything a row
     * displays is loaded afterwards, for the twenty-odd ids that survive — the
     * union itself must stay cheap because counting it is what draws the badge.
     *
     * @param array<int, string> $types
     */
    private function union(array $types, ?string $search): Builder
    {
        $parts = [];

        if (in_array(self::TYPE_MATCH, $types, true)) {
            $parts[] = $this->matchSource($search);
        }

        if (in_array(self::TYPE_CONTRACT_EXPIRY, $types, true)) {
            $parts[] = $this->contractExpirySource($search);
        }

        if (in_array(self::TYPE_PAYMENT_LINK, $types, true)) {
            $parts[] = $this->paymentLinkSource($search);
        }

        $union = array_shift($parts);

        foreach ($parts as $part) {
            // unionAll, not union: the three sources cannot collide, and dropping
            // the DISTINCT saves sorting the whole stream to prove it.
            $union->unionAll($part);
        }

        return $union;
    }

    /** Property↔request pairings the admins were told about. */
    private function matchSource(?string $search): Builder
    {
        $query = DB::table('match_alerts')->selectRaw(
            "'" . self::TYPE_MATCH . "' as type, match_alerts.id as source_id, match_alerts.created_at as occurred_at"
        );

        if ($search !== null) {
            // Inner joins on belongsTo sides, so no row can be duplicated; the
            // client is left-joined because a request could outlive its client row.
            $query->join('properties', 'properties.id', '=', 'match_alerts.property_id')
                ->join('requests', 'requests.id', '=', 'match_alerts.request_id')
                ->leftJoin('clients', 'clients.id', '=', 'requests.client_id')
                ->where(fn ($q) => $q
                    ->where('properties.name', 'like', $search)
                    ->orWhere('properties.property_code', 'like', $search)
                    ->orWhere('clients.full_name', 'like', $search));
        }

        return $query;
    }

    /** Lease-expiry notices, including the closing one at days_before = 0. */
    private function contractExpirySource(?string $search): Builder
    {
        $query = DB::table('rental_contract_expiry_alerts')->selectRaw(
            "'" . self::TYPE_CONTRACT_EXPIRY . "' as type, rental_contract_expiry_alerts.id as source_id,"
            . ' rental_contract_expiry_alerts.created_at as occurred_at'
        );

        if ($search !== null) {
            $query->join('rental_contracts', 'rental_contracts.id', '=', 'rental_contract_expiry_alerts.rental_contract_id')
                ->leftJoin('clients', 'clients.id', '=', 'rental_contracts.tenant_id')
                ->leftJoin('properties', 'properties.id', '=', 'rental_contracts.property_id')
                ->where(fn ($q) => $q
                    ->where('rental_contracts.contract_number', 'like', $search)
                    ->orWhere('clients.full_name', 'like', $search)
                    ->orWhere('properties.name', 'like', $search));
        }

        return $query;
    }

    /**
     * Payment links whose reminder has gone out.
     *
     * The stamp is the whole ledger here — there is no separate table — so a
     * collection appears exactly once, on the day it was chased.
     */
    private function paymentLinkSource(?string $search): Builder
    {
        $query = DB::table('collections')
            ->selectRaw(
                "'" . self::TYPE_PAYMENT_LINK . "' as type, collections.id as source_id,"
                . ' collections.payment_link_reminded_at as occurred_at'
            )
            ->whereNotNull('collections.payment_link_reminded_at');

        if ($search !== null) {
            $query->leftJoin('clients', 'clients.id', '=', 'collections.client_id')
                ->where(fn ($q) => $q
                    ->where('collections.collection_number', 'like', $search)
                    ->orWhere('clients.full_name', 'like', $search));
        }

        return $query;
    }

    // ── Read state ──────────────────────────────────────────────────────────

    /**
     * Unread: sent after this user last opened the feed.
     *
     * A user who has never opened it has no watermark, and every notification is
     * new to them — so no condition is added at all rather than comparing
     * against null, which would match nothing.
     *
     * Strictly newer, so an alert written in the very second the page was opened
     * counts as read. The ledgers' timestamps only carry seconds, so that tie
     * cannot be broken — and of the two readings, "the visit covered it" is the
     * one that matches what the user just saw on screen. The window is one
     * second per command run.
     */
    private function whereUnread(Builder $query, User $user): void
    {
        if ($user->notifications_read_at) {
            $query->where('n.occurred_at', '>', $user->notifications_read_at);
        }
    }

    /** Read: the exact inverse — sent at or before that visit. */
    private function whereRead(Builder $query, User $user): void
    {
        if (! $user->notifications_read_at) {
            // Never opened the feed, so nothing is read. Said explicitly: adding
            // no condition here would return the whole feed as read, which is
            // the opposite of the truth.
            $query->whereRaw('1 = 0');

            return;
        }

        $query->where('n.occurred_at', '<=', $user->notifications_read_at);
    }

    // ── Hydration ───────────────────────────────────────────────────────────

    /**
     * Turn one page of (type, source_id) into rows the frontend can render.
     *
     * @param SupportCollection<int, object> $rows
     * @return SupportCollection<int, array<string, mixed>>
     */
    private function present(User $user, SupportCollection $rows): SupportCollection
    {
        $idsByType = $rows->groupBy('type')
            ->map(fn ($group) => $group->pluck('source_id')->map(fn ($id) => (int) $id)->all());

        $records = $this->load($idsByType);
        $stamp   = $user->notifications_read_at;

        return $rows->map(function ($row) use ($records, $stamp) {
            $type = (string) $row->type;
            $id   = (int) $row->source_id;

            // Absent only if the underlying record was deleted between the union
            // and the load — the ledgers cascade, so this is a race, not a state.
            // Dropped rather than rendered as a blank row.
            $record = $records[$type][$id] ?? null;

            if (! $record) {
                return null;
            }

            $occurredAt = Carbon::parse($row->occurred_at);

            return $this->describe($type, $record) + [
                'id'          => "{$type}-{$id}",
                'type'        => $type,
                'source_id'   => $id,
                'occurred_at' => $occurredAt->toIso8601String(),
                'read'        => (bool) $stamp && $occurredAt->lessThanOrEqualTo($stamp),
            ];
        })->filter()->values();
    }

    /**
     * The full records behind one page, keyed as [type][id].
     *
     * One query per source represented on the page, each carrying exactly the
     * relations describe() reads — without them every row would be its own
     * handful of queries.
     *
     * @param SupportCollection<string, array<int, int>> $idsByType
     * @return array<string, array<int, mixed>>
     */
    private function load(SupportCollection $idsByType): array
    {
        $matchIds   = $idsByType->get(self::TYPE_MATCH, []);
        $expiryIds  = $idsByType->get(self::TYPE_CONTRACT_EXPIRY, []);
        $paymentIds = $idsByType->get(self::TYPE_PAYMENT_LINK, []);

        return [
            self::TYPE_MATCH => $matchIds
                ? MatchAlert::with(['property:id,name,property_code', 'request:id,client_id,request_type', 'request.client:id,full_name'])
                    ->whereIn('id', $matchIds)->get()->keyBy('id')->all()
                : [],

            self::TYPE_CONTRACT_EXPIRY => $expiryIds
                ? RentalContractExpiryAlert::with([
                    'contract:id,contract_number,property_id,unit_id,tenant_id,end_date',
                    'contract.property:id,name',
                    'contract.unit:id,unit_number',
                    'contract.tenant:id,full_name,email',
                ])->whereIn('id', $expiryIds)->get()->keyBy('id')->all()
                : [],

            self::TYPE_PAYMENT_LINK => $paymentIds
                ? CollectionModel::with('client:id,full_name,email')
                    ->whereIn('id', $paymentIds)->get()->keyBy('id')->all()
                : [],
        ];
    }

    // ── Presentation ────────────────────────────────────────────────────────

    /**
     * The human half of a row: what it says, who it went to, and where clicking
     * it should land.
     *
     * The wording deliberately echoes the mails themselves (see the Arabic
     * plural forms in RentalContractExpiryMail::expiryPhrase) — the page exists
     * so the office can see what the client received, and it would not serve
     * that if the two read differently.
     *
     * @return array<string, mixed>
     */
    private function describe(string $type, $record): array
    {
        return match ($type) {
            self::TYPE_MATCH           => $this->describeMatch($record),
            self::TYPE_CONTRACT_EXPIRY => $this->describeExpiry($record),
            self::TYPE_PAYMENT_LINK    => $this->describePaymentLink($record),
        };
    }

    /** @return array<string, mixed> */
    private function describeMatch(MatchAlert $alert): array
    {
        $property = $alert->property;
        $request  = $alert->request;
        $client   = $request?->client?->full_name ?? MailFormat::DASH;
        $name     = MailFormat::text($property?->name);
        $code     = MailFormat::text($property?->property_code);

        // request_type is stored as a boolean and read back as إيجار / شراء by
        // the model's accessor, which is also what decides the tab to open.
        $isSale = $request?->request_type === 'شراء';

        return [
            'title' => 'عقار مطابق لطلب عميل',
            'body'  => "العقار {$code} — {$name} يطابق طلب العميل {$client}.",
            // Match digests go to every active admin, and which addresses those
            // were at the time is not recorded — the ledger holds the pairing, not
            // the envelope. Named by role rather than guessed at.
            'recipient' => 'مدراء النظام',
            'link'      => $isSale ? '/requests/sale' : '/requests/rent',
            'meta'      => [
                'property_id'   => $property?->id,
                'property_code' => $property?->property_code,
                'property_name' => $property?->name,
                'request_id'    => $request?->id,
                'request_type'  => $request?->request_type,
                'client_name'   => $request?->client?->full_name,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function describeExpiry(RentalContractExpiryAlert $alert): array
    {
        $contract = $alert->contract;
        $days     = (int) $alert->days_before;
        $ended    = $days === RentalContractExpiryAlert::ENDED_NOTICE;

        $number  = MailFormat::text($contract?->contract_number);
        $tenant  = MailFormat::text($contract?->tenant?->full_name);
        $endDate = $contract?->end_date?->toDateString();

        // The lease may be on a whole property rather than on one of its units.
        $place = MailFormat::text($contract?->property?->name);
        if ($contract?->unit?->unit_number) {
            $place .= ' / ' . $contract->unit->unit_number;
        }

        return [
            'title' => $ended ? 'انتهاء عقد إيجار' : 'قرب انتهاء عقد إيجار',
            'body'  => $ended
                ? "انتهى عقد الإيجار {$number} الخاص بالمستأجر {$tenant} على {$place} بتاريخ {$endDate}."
                : "عقد الإيجار {$number} الخاص بالمستأجر {$tenant} على {$place} ينتهي بتاريخ {$endDate}"
                    . ' — ' . $this->beforePhrase($days) . ' من انتهائه.',
            'recipient' => $contract?->tenant?->email,
            'link'      => '/contracts/rent',
            'meta'      => [
                'contract_id'     => $contract?->id,
                'contract_number' => $contract?->contract_number,
                'tenant_name'     => $contract?->tenant?->full_name,
                'property_name'   => $place,
                'end_date'        => $endDate,
                'days_before'     => $days,
                // What separates a warning from the closing notice, for the badge
                // the page renders — the frontend should not re-derive it from 0.
                'ended'           => $ended,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function describePaymentLink(CollectionModel $collection): array
    {
        $client    = MailFormat::text($collection->client?->full_name);
        $number    = MailFormat::text($collection->collection_number);
        $amount    = MailFormat::money($collection->amount);
        $expiresAt = $collection->paymentLinkExpiresAt();
        $days      = (int) $collection->payment_link_reminder_days;

        // Normally set — the command only chases links that have an expiry — but
        // the office can clear it afterwards, and the row stays in the feed.
        $expiry = $expiresAt
            ? " ينتهي بتاريخ {$expiresAt->toDateString()}"
            : '';

        return [
            'title' => 'قرب انتهاء رابط سداد',
            'body'  => "رابط سداد التحصيل {$number} للعميل {$client} بمبلغ {$amount}{$expiry}"
                . ' — ' . $this->beforePhrase($days) . ' من انتهائه.',
            'recipient' => $collection->client?->email,
            'link'      => '/collections',
            'meta'      => [
                'collection_id'     => $collection->id,
                'collection_number' => $collection->collection_number,
                'client_name'       => $collection->client?->full_name,
                'amount'            => (float) $collection->amount,
                'expires_at'        => $expiresAt?->toIso8601String(),
                'payment_status'    => $collection->payment_status,
                'reminder_days'     => $days,
                // Whether the client has since paid — the difference between a
                // reminder that worked and one still outstanding.
                'paid'              => $collection->payment_status === CollectionModel::PAYMENT_PAID,
            ],
        ];
    }

    /**
     * "قبل يومين" / "قبل 3 أيام" / "قبل 30 يوماً" for a reminder's offset.
     *
     * Arabic counts in singular, dual and two plurals; "قبل 2 أيام" reads wrong,
     * which is the same reason the mails carry their own expiryPhrase().
     */
    private function beforePhrase(int $days): string
    {
        return match (true) {
            $days === 1  => 'قبل يوم واحد',
            $days === 2  => 'قبل يومين',
            $days <= 10  => "قبل {$days} أيام",
            default      => "قبل {$days} يوماً",
        };
    }

    // ── Filter normalisation ────────────────────────────────────────────────

    /**
     * The requested types, or all three when nothing valid was asked for —
     * an unrecognised filter must not silently empty the feed.
     *
     * @param  array<int, string>|string  $types
     * @return array<int, string>
     */
    private function normaliseTypes($types): array
    {
        $requested = array_intersect(self::TYPES, (array) $types);

        return $requested ? array_values($requested) : self::TYPES;
    }

    /** A LIKE pattern, or null when the search box is empty. */
    private function normaliseSearch(?string $search): ?string
    {
        $search = trim((string) $search);

        if ($search === '') {
            return null;
        }

        // Escape the wildcards so a client called "50%" searches for itself.
        return '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $search) . '%';
    }
}
