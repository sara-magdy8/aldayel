<?php

use App\Console\Commands\AlertAdminsOfMatches;
use App\Console\Commands\ExpireEndedRentalContracts;
use App\Console\Commands\SendPaymentLinkReminders;
use App\Console\Commands\SendRentalContractExpiryAlerts;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/**
 * Chase clients whose payment link is close to expiring.
 *
 * 01:00 office time — quiet enough that a mail landing overnight is read with
 * the morning's inbox, and well clear of the working day the office spends in
 * the collections screen. The timezone matches the app's own (Asia/Kuwait) and
 * is stated anyway, so the hour stays office time if that default ever moves.
 *
 * withoutOverlapping guards the case where a large backlog is still sending
 * when the next day's run is due.
 */
Schedule::command(SendPaymentLinkReminders::class)
    ->dailyAt('01:00')
    ->timezone('Asia/Kuwait')
    ->withoutOverlapping();

/**
 * Close rental contracts whose lease has run out, releasing the property.
 *
 * 01:30, half an hour behind the reminders so the two never contend for the
 * worker, and early enough that a lease which ended yesterday shows its property
 * as available when the office opens. Same office timezone, stated for the same
 * reason.
 *
 * The command is idempotent — a contract it closes no longer matches — so an
 * overlapping or repeated run cannot double-apply anything.
 */
Schedule::command(ExpireEndedRentalContracts::class, ['--reconcile' => true])
    ->dailyAt('00:00')
    ->timezone('Asia/Kuwait')
    ->withoutOverlapping();

/**
 * Warn tenants whose rental contract is nearing its end date.
 *
 * 02:00, half an hour behind the expiry sweep so the two never contend for the
 * worker — and deliberately after it, so a lease that ended yesterday is already
 * closed and its tenant cannot be told "ينتهي عقد الإيجار اليوم" the morning
 * after it actually ended.
 *
 * Daily even though the office may have configured only one reminder: which
 * leases have reached a reminder point changes every night, and the command is
 * silent unless something is genuinely due. The ledger of what was already sent
 * is what makes running it often free — and what makes an overlapping or
 * repeated run unable to mail the same tenant twice.
 */
Schedule::command(SendRentalContractExpiryAlerts::class)
    ->dailyAt('02:00')
    ->timezone('Asia/Kuwait')
    ->withoutOverlapping();

/**
 * Tell the admins about property↔request matches they have not been told about.
 *
 * Hourly through the working day rather than once overnight: a property added at
 * 08:15 is worth acting on the same morning, not the next one. Running this often
 * costs nothing because the command is silent unless something is genuinely new —
 * the match_alerts ledger holds every pairing already announced — so the frequency
 * is free to follow how fast the office actually works.
 *
 * Between 08:00 and 20:00 office time, which is when anyone is there to act on it;
 * a match found at 21:00 is reported at 08:00 with the day's first run. Same
 * timezone as the two commands above, stated for the same reason.
 *
 * withoutOverlapping guards a slow scan still running when the next hour is due;
 * the ledger is only written after a digest is away, so an overlapping or repeated
 * run cannot double-announce anything either.
 */
Schedule::command(AlertAdminsOfMatches::class, [
    // ±10% on size and price. Stated here rather than left to the command's own
    // defaults so the tolerance the office actually runs on is visible next to
    // the hours it runs on — the two get revisited together.
    '--area-margin'  => 10,
    '--price-margin' => 10,
])
    ->hourly()
    ->between('08:00', '20:00')
    ->timezone('Asia/Kuwait')
    ->withoutOverlapping();
