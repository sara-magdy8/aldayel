<?php

namespace App\Console\Commands;

use App\Mail\RentalContractExpiryMail;
use App\Models\ContractStatus;
use App\Models\RentalContract;
use App\Models\RentalContractExpiryAlert;
use App\Models\Setting;
use Illuminate\Support\Collection;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Tell tenants about their lease ending — both before and after.
 *
 * The office decides on the التنبيهات screen how many reminders it wants per
 * lease and how many days before the end each one fires — settings
 * `rental_expiry_alert_count` and `rental_expiry_alert_days`. Configure [60, 30, 7]
 * and a tenant hears three times: two months out, a month out, and the week
 * before. A fourth mail, the closing notice, goes out once the lease has
 * actually run out, unless the office switches it off
 * (`rental_ended_alert_enabled`). The two are independent: an office can want
 * only the run-up, or only the notice.
 *
 * Scheduled daily at 02:00 office time (see routes/console.php). A run with
 * nothing due sends nothing, and a lease that has had all its mail is never
 * written to again — the `rental_contract_expiry_alerts` ledger holds one row
 * per (contract, offset) already sent, with offset 0 standing for the closing
 * notice. Rows are written only after the mail is away, so a failed send is
 * retried on the next run rather than silently marked as announced.
 *
 * Reminders are owed rather than dated: a lease is due its 30-day notice on any
 * run where it has 30 days or fewer left and that notice has not been sent. A
 * night the command was down therefore catches up the next morning instead of
 * losing the reminder, and a lease already inside several reminder points (a
 * contract entered late, say) sends one mail carrying its real days-left, with
 * every passed offset marked off at once rather than a burst of mails.
 *
 * Silent by design when there is nobody to write to: a tenant with no email on
 * file is skipped, not reported as a failure — the office chose to record that
 * client without an address, and there is nothing to fix. Their offsets stay
 * unrecorded, so the mail goes out on the next run if an address is added.
 */
class SendRentalContractExpiryAlerts extends Command
{
    /**
     * Contract states a closing notice may be sent for.
     *
     * نشط is included alongside the closed states because this command runs half
     * an hour after `contracts:expire-ended-rentals`: on a night that one did not
     * run, an ended lease is still sitting as نشط and its tenant should hear all
     * the same. ملغي is excluded — that lease was called off, and telling its
     * tenant it "ran its course" would be wrong — and so is مسودة, which never
     * started.
     */
    private const ENDED_STATES = ['نشط', 'منتهي', 'مكتمل'];

    protected $signature = 'contracts:send-expiry-alerts
                            {--dry-run : List who would be mailed without sending or recording anything}
                            {--seed : Mark every currently-due mail as already sent, without mailing}';

    protected $description = 'Email tenants whose rental contract is nearing — or has passed — its end date';

    public function handle(): int
    {
        // The office's configured reminder points, earliest first, and whether
        // the closing notice is wanted. Neither set means the feature is
        // switched off, not that something is missing.
        $offsets      = Setting::rentalExpiryAlertDays();
        $endedEnabled = Setting::rentalEndedAlertEnabled();

        if (! $offsets && ! $endedEnabled) {
            $this->info('No rental-expiry alerts are configured.');

            return self::SUCCESS;
        }

        $activeId = ContractStatus::idForName('نشط');

        if (! $activeId) {
            $this->error('The نشط contract status is missing from contract_statuses.');

            return self::FAILURE;
        }

        // Office time on both sides: the app runs on Asia/Kuwait, so "today"
        // here is the day the office would call today, with nothing to convert.
        $today   = Carbon::now()->startOfDay();
        $sent    = 0;
        $skipped = 0;

        if ($offsets) {
            $this->sweep(
                $this->upcoming($activeId, $today, max($offsets)),
                fn (RentalContract $contract, int $daysLeft, Collection $announced) => array_values(array_diff(
                    // Every reminder point this lease has reached and the tenant
                    // has not been told about. Usually one; more only after a gap.
                    array_filter($offsets, fn ($offset) => $offset >= $daysLeft),
                    $announced->get($contract->id, []),
                )),
                $today,
                $sent,
                $skipped,
            );
        }

        if ($endedEnabled) {
            $this->sweep(
                $this->ended($today),
                fn (RentalContract $contract, int $daysLeft, Collection $announced) => in_array(
                    RentalContractExpiryAlert::ENDED_NOTICE,
                    $announced->get($contract->id, []),
                    true,
                ) ? [] : [RentalContractExpiryAlert::ENDED_NOTICE],
                $today,
                $sent,
                $skipped,
            );
        }

        $this->info(match (true) {
            (bool) $this->option('seed')    => "Seeded {$sent} lease(s) as already mailed. Nothing was sent.",
            (bool) $this->option('dry-run') => "Would mail {$sent} tenant(s); {$skipped} have no email.",
            default                         => "Mailed {$sent} tenant(s); skipped {$skipped} with no email.",
        });

        return self::SUCCESS;
    }

    /**
     * Walk one set of contracts, mailing whatever `$resolveDue` says is owed.
     *
     * Shared by both passes because everything except "which mails does this
     * lease still owe" is identical between them — the chunking, the ledger
     * lookup, the missing-address rule, and the dry-run and seed behaviour all
     * have to stay in step, and they only do that by being written once.
     *
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @param callable(RentalContract, int, Collection): array<int, int> $resolveDue
     */
    private function sweep($query, callable $resolveDue, Carbon $today, int &$sent, int &$skipped): void
    {
        $dryRun = (bool) $this->option('dry-run');
        $seed   = (bool) $this->option('seed');

        $query->chunkById(200, function ($contracts) use ($resolveDue, $today, $dryRun, $seed, &$sent, &$skipped) {
            // One lookup for the whole chunk, as in AlertAdminsOfMatches: a
            // query per contract would be most of the work this command does.
            $announced = RentalContractExpiryAlert::announcedFor($contracts->pluck('id')->all());

            foreach ($contracts as $contract) {
                // Guarded by the query, but a hand-inserted row could lack it.
                if (! $contract->end_date) {
                    continue;
                }

                // Negative once the lease is over, which is what tells the mail
                // to frame itself as a closing notice rather than a warning.
                $daysLeft = (int) $today->diffInDays($contract->end_date->copy()->startOfDay(), false);

                $due = $resolveDue($contract, $daysLeft, $announced);

                if (! $due) {
                    continue;
                }

                if ($seed) {
                    $this->recordSent($contract, $due);
                    $sent++;
                    continue;
                }

                // The one rule the office asked for on the payment reminders,
                // and the same one here: a client with no address on file gets
                // nothing. Checked in PHP rather than in the query so the
                // summary can report an honest count of who was passed over —
                // a row dropped by SQL would never reach this loop.
                $email = $contract->tenant?->email;

                if (! $email) {
                    $skipped++;
                    continue;
                }

                if ($dryRun) {
                    $when = $daysLeft < 0
                        ? 'ended ' . abs($daysLeft) . 'd ago'
                        : "{$daysLeft}d left";

                    $this->line("[dry-run] {$contract->contract_number} → {$email} ({$when}, marks " . implode('/', $due) . ')');
                    $sent++;
                    continue;
                }

                if ($this->remind($contract, $email, $daysLeft, $due)) {
                    $sent++;
                }
            }
        });
    }

    /**
     * Live leases close enough to their end to be worth warning about.
     *
     * Bounded by the largest configured offset so the scan stays proportional to
     * what the office actually asked for, and floored at today: everything past
     * that is the closing notice's business, not a warning's.
     *
     * Only نشط contracts. مسودة never started and ملغي was called off, so neither
     * has an end worth defending; مكتمل is already closed.
     */
    private function upcoming(int $activeId, Carbon $today, int $maxOffset)
    {
        return $this->contracts()
            ->where('contract_status_id', $activeId)
            ->whereDate('end_date', '>=', $today)
            ->whereDate('end_date', '<=', $today->copy()->addDays($maxOffset));
    }

    /**
     * Every lease that has run out and still owes its tenant the closing notice.
     *
     * Unbounded on the far side: however long ago a lease ended, its tenant is
     * told once. What stops that becoming a mass mailing is the ledger, not a
     * date window — each contract is written to exactly once, ever. On a system
     * carrying real history, `--seed` marks the existing backlog as already sent
     * before the first live run.
     *
     * The near edge is the day after the end date — a lease ending today has not
     * ended yet, and its tenant is getting "ينتهي عقد الإيجار اليوم" from the
     * pass above.
     */
    private function ended(Carbon $today)
    {
        $stateIds = ContractStatus::whereIn('name', self::ENDED_STATES)->pluck('id')->all();

        return $this->contracts()
            ->whereIn('contract_status_id', $stateIds)
            ->whereDate('end_date', '<', $today)
            // Drop the already-notified in SQL rather than loading them to find
            // out. Without a date window this pass would otherwise walk every
            // lease ever ended, with its property/unit/tenant, on every run —
            // a cost that grows with history while the work never does. The
            // per-chunk ledger check in sweep() still backs this up.
            ->whereNotExists(fn ($q) => $q
                ->from('rental_contract_expiry_alerts')
                ->whereColumn('rental_contract_id', 'rental_contracts.id')
                ->where('days_before', RentalContractExpiryAlert::ENDED_NOTICE));
    }

    /** The columns both passes read: the lease, what it is on, and who holds it. */
    private function contracts()
    {
        return RentalContract::query()
            ->with([
                'property:id,name',
                'unit:id,unit_number',
                'tenant:id,full_name,email',
            ])
            ->whereNotNull('end_date');
    }

    /**
     * Mail one tenant and log the offsets so the same mail cannot go out twice.
     *
     * A send that throws is logged and swallowed: one unreachable address must
     * not abort the rest of the night's mail. Nothing is recorded for a failed
     * send, so it is attempted again on the next run — which is what a notice
     * the tenant never received deserves.
     *
     * @param array<int, int> $offsets
     */
    private function remind(RentalContract $contract, string $email, int $daysLeft, array $offsets): bool
    {
        $this->recordSent($contract, $offsets);
        try {
            Mail::to($email)->send(new RentalContractExpiryMail($contract, $daysLeft));
        } catch (Throwable $e) {
            Log::error('Failed to mail the rental contract expiry alert.', [
                'rental_contract_id' => $contract->id,
                'error'              => $e->getMessage(),
            ]);

            return false;
        }

        

        return true;
    }

    /**
     * insertOrIgnore rather than insert: the unique index on (contract, offset)
     * means an overlapping run cannot double-record, and a mail already logged
     * is simply left alone.
     *
     * @param array<int, int> $offsets
     */
    private function recordSent(RentalContract $contract, array $offsets): void
    {
        $now = now();

        RentalContractExpiryAlert::insertOrIgnore(array_map(fn ($offset) => [
            'rental_contract_id' => $contract->id,
            'days_before'        => $offset,
            'created_at'         => $now,
            'updated_at'         => $now,
        ], $offsets));
    }
}
