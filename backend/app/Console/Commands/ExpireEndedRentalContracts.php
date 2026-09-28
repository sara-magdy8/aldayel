<?php

namespace App\Console\Commands;

use App\Models\ContractStatus;
use App\Models\Property;
use App\Models\PropertyStatus;
use App\Models\RentalContract;
use App\Models\Unit;
use App\Support\ListingStatus;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/** here check contract status
 * it flips the contract to مكتمل
 * Close rental contracts whose lease has run out, so their property goes back on
 * the market.
 *
 * Scheduled daily at 01:30 office time (see routes/console.php), just after the
 * payment-link reminders. A lease that ended yesterday is over today, and the
 * property it held should be selectable again in the morning.
 *
 * The property is never written here. Moving the contract to مكتمل is enough:
 * the contract's save hook recomputes both the listing status (via
 * App\Support\ListingStatus) and the property's `has_contract` flag from the
 * contracts that remain, and a completed rental no longer claims it. That
 * indirection is what keeps a property held when a second contract still covers
 * it — this command closing one lease cannot free a property another lease is
 * running on.
 *
 * Only نشط contracts are touched. مسودة never started, ملغي was called off, and
 * مكتمل is already where this command would put it.
 */
class ExpireEndedRentalContracts extends Command
{
    protected $signature = 'contracts:expire-ended-rentals
                            {--dry-run : List what would change without writing anything}
                            {--reconcile : Also recheck listings held as مؤجر/محجوز that no live contract backs}';

    protected $description = 'Close rental contracts whose end_date has passed and release their property';

    public function handle(): int
    {
        // Office time on both sides: the app runs on Asia/Kuwait, so "today"
        // here is the day the office would call today, with nothing to convert.
        $today  = Carbon::now()->startOfDay();
        $dryRun = (bool) $this->option('dry-run');
        $closed = 0;

        $activeId = ContractStatus::idForName('نشط');

        if (! $activeId) {
            $this->error('The نشط contract status is missing from contract_statuses.');

            return self::FAILURE;
        }

        RentalContract::query()
            ->with('property:id,name,property_status_id', 'unit:id,unit_number,property_status_id')
            ->where('contract_status_id', $activeId)
            // Everything already ended, not only yesterday's. On a healthy daily
            // run the two are the same set; after a missed night they are not,
            // and a lease that slipped through would otherwise hold its property
            // for good. Re-running is harmless — a closed contract no longer matches.
            ->whereDate('end_date', '<', $today)
            ->chunkById(200, function ($contracts) use ($dryRun, &$closed) {
                foreach ($contracts as $contract) {
                    $listing = $contract->unit_id
                        ? "unit {$contract->unit?->unit_number}"
                        : "property {$contract->property?->name}";

                    if ($dryRun) {
                        $this->line("[dry-run] {$contract->contract_number} ended {$contract->end_date?->toDateString()} → would close ({$listing})");
                        $closed++;
                        continue;
                    }

                    // A normal save, not saveQuietly: the model event is the whole
                    // point — it is what re-derives the listing's status.
                    $contract->update(['status' => 'مكتمل']);

                    $now = $contract->unit_id
                        ? $contract->unit?->fresh()?->status
                        : $contract->property?->fresh()?->status;

                    $this->line("{$contract->contract_number} closed; {$listing} is now {$now}");
                    $closed++;
                }
            });

        $this->info($dryRun
            ? "Would close {$closed} ended rental contract(s)."
            : "Closed {$closed} ended rental contract(s).");

        if ($this->option('reconcile')) {
            $this->reconcile($dryRun);
        }

        return self::SUCCESS;
    }

    /** here check property status
     * Recheck listings whose stored status no longer matches their contracts.
     *
     * Closing a contract above already re-derives its own listing, so this is for
     * the ones no save will ever reach: a property left مؤجر by a lease that was
     * deleted or cancelled before the status became derived, which nothing points
     * at any more and which would otherwise stay off the market for good.
     *
     * Deliberately opt-in rather than part of the nightly run, and deliberately
     * limited to مؤجر / محجوز. A محجوز a colleague set by hand to hold a property
     * for a walk-in is indistinguishable here from a stale one, so this must be a
     * decision someone makes, not something that happens at 01:30. مباع is left
     * alone entirely — a sale is terminal, and re-listing one is never automatic.
     */
    private function reconcile(bool $dryRun): void
    {
        $heldIds = PropertyStatus::whereIn('name', ['مؤجر', 'محجوز'])->pluck('id')->all();

        if (! $heldIds) {
            return;
        }

        $fixed = 0;

        $sweep = function ($query, string $kind, callable $resolve, callable $apply) use ($dryRun, &$fixed) {
            $query->chunkById(200, function ($listings) use ($kind, $resolve, $apply, $dryRun, &$fixed) {
                foreach ($listings as $listing) {
                    $should = $resolve($listing->id);

                    if ($listing->status === $should) {
                        continue;
                    }

                    $prefix = $dryRun ? '[dry-run] ' : '';
                    $this->line("{$prefix}{$kind} #{$listing->id} {$listing->status} → {$should}");

                    if (! $dryRun) {
                        $apply($listing->id);
                    }

                    $fixed++;
                }
            });
        };

        $sweep(
            Property::whereIn('property_status_id', $heldIds),
            'property',
            fn ($id) => ListingStatus::forProperty($id),
            fn ($id) => ListingStatus::syncProperty($id),
        );

        $sweep(
            Unit::whereIn('property_status_id', $heldIds),
            'unit',
            fn ($id) => ListingStatus::forUnit($id),
            fn ($id) => ListingStatus::syncUnit($id),
        );

        $this->info($dryRun
            ? "Would correct {$fixed} stale listing status(es)."
            : "Corrected {$fixed} stale listing status(es).");
    }
}
