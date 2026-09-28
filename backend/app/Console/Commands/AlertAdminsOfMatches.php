<?php

namespace App\Console\Commands;

use App\Mail\NewMatchesMail;
use App\Models\MatchAlert;
use App\Models\PropertyRequest;
use App\Models\RequestStatus;
use App\Models\User;
use App\Services\PropertyMatcher;
use App\Support\MailFormat;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Tell the office admins about property↔request matches they have not heard about.
 *
 * Scheduled hourly through the working day (see routes/console.php). Each run
 * walks every open request, finds the available properties answering it, drops
 * the pairings already in `match_alerts`, and mails one digest of whatever is
 * left. A run with nothing new sends nothing — which is what makes running it
 * often safe, and what lets it replace the alert that used to fire from the
 * create endpoints.
 *
 * Scanning rather than hooking the controllers also means a match is found
 * however it came about: an edit, a bulk import, a seeder, or a row changed
 * straight in the database.
 *
 * The ledger is written only after the mail is away, so a send that fails is
 * simply retried on the next run instead of being silently marked as announced.
 *
 * Everything the command says is mirrored to the log: under cron nobody reads
 * the console output, and the log is the only record of what a run did.
 */
class AlertAdminsOfMatches extends Command
{
    protected $signature = 'matches:alert-admins
                            {--dry-run : Show what would be sent without mailing or recording anything}
                            {--seed : Record every current match as already announced, without mailing}
                            {--area-margin=10 : Size tolerance, percent. 0 matches the size exactly}
                            {--price-margin=10 : Price tolerance, percent. 0 matches the price exactly}';

    protected $description = 'Email the admins about new property matches for open requests';

    public function handle(PropertyMatcher $matcher): int
    {
        $areaMargin  = (float) $this->option('area-margin');
        $priceMargin = (float) $this->option('price-margin');
        $dryRun      = (bool) $this->option('dry-run');
        $seed        = (bool) $this->option('seed');

        /** @var array<int, array{request: PropertyRequest, properties: \Illuminate\Support\Collection}> $groups */
        $groups = [];
        /** @var array<int, array{property_id: int, request_id: int}> $pairs */
        $pairs = [];

        $this->candidates()->chunkById(100, function ($requests) use ($matcher, $areaMargin, $priceMargin, &$groups, &$pairs) {
            // One lookup for the whole chunk: a query per request would be most
            // of the work this command does.
            $announced = MatchAlert::announcedFor($requests->pluck('id')->all());

            foreach ($requests as $request) {
                $properties = $matcher->propertiesFor($request, $areaMargin, $priceMargin)->latest()->get();

                $new = $properties->whereNotIn('id', $announced->get($request->id, []))->values();

                if ($new->isEmpty()) {
                    continue;
                }

                $groups[] = ['request' => $request, 'properties' => $new];

                foreach ($new as $property) {
                    $pairs[] = ['property_id' => $property->id, 'request_id' => $request->id];
                }
            }
        });

        if (! $pairs) {
            $this->info('No new matches.');
            return self::SUCCESS;
        }

        $summary = MailFormat::newMatches(count($pairs)) . ' ' . MailFormat::forRequests(count($groups));

        if ($seed) {
            $this->recordPairs($pairs);
            $this->info("Seeded {$summary} as already announced. Nothing was mailed.");
            return self::SUCCESS;
        }

        if ($dryRun) {
            $this->report($groups);
            $this->info("Would send {$summary}. Nothing was mailed or recorded.");
            return self::SUCCESS;
        }

        $emails = User::adminAlertEmails();

        // Nothing was announced, so nothing is recorded — once an admin exists,
        // the next run reports these same matches rather than having lost them.
        if (! $emails) {
            $this->warn('No active admin has an email address; nothing sent.');
            return self::SUCCESS;
        }

        $this->recordPairs($pairs);

        try {
            Mail::to($emails)->send(new NewMatchesMail($groups));
        } catch (Throwable $e) {
            $this->error("Failed to mail {$summary}: {$e->getMessage()}");

            return self::FAILURE;
        }

        $this->info("Sent {$summary} to " . count($emails) . ' admin(s).');

        return self::SUCCESS;
    }

    /**
     * Console output doubles as a log line, so a cron run leaves a trail.
     */
    public function info($string, $verbosity = null): void
    {
        Log::info("[matches:alert-admins] {$string}");

        parent::info($string, $verbosity);
    }

    public function warn($string, $verbosity = null): void
    {
        Log::warning("[matches:alert-admins] {$string}");

        parent::warn($string, $verbosity);
    }

    public function error($string, $verbosity = null): void
    {
        Log::error("[matches:alert-admins] {$string}");

        parent::error($string, $verbosity);
    }

    /**
     * Open requests, newest first, carrying what both the matcher and the mail
     * read — without the eager loads each request would be its own handful of
     * queries.
     *
     * Completed (مكتمل) requests are excluded here rather than in the matcher:
     * propertiesFor() constrains the property side only, so the caller owns the
     * request side of the filter.
     */
    private function candidates()
    {
        $completedId = RequestStatus::idForName('مكتمل');

        return PropertyRequest::with(PropertyMatcher::REQUEST_RELATIONS)
            ->when($completedId, fn($q) => $q->where('request_status_id', '!=', $completedId));
    }

    /**
     * insertOrIgnore rather than insert: the unique index on the pair means an
     * overlapping run cannot double-record, and a pair already present is simply
     * left alone.
     *
     * @param array<int, array{property_id: int, request_id: int}> $pairs
     */
    private function recordPairs(array $pairs): void
    {
        $now = now();

        MatchAlert::insertOrIgnore(array_map(
            fn($pair) => $pair + ['created_at' => $now, 'updated_at' => $now],
            $pairs,
        ));
    }

    /** @param array<int, array{request: PropertyRequest, properties: \Illuminate\Support\Collection}> $groups */
    private function report(array $groups): void
    {
        $this->table(
            ['Request', 'Client', 'New matches'],
            array_map(fn($group) => [
                $group['request']->id,
                $group['request']->client?->full_name ?? '—',
                $group['properties']->pluck('property_code')->implode(', '),
            ], $groups),
        );
    }
}
