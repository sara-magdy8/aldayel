<?php

namespace App\Console\Commands;

use App\Models\Client;
use App\Models\Property;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * One-off backfill for the الوسيط / مسؤول العقار move onto the clients table.
 *
 * Properties used to carry the broker and the property manager as two free-text
 * pairs (`broker_name` + `broker_phone_num`, `manager_name` + `manager_phone_num`).
 * They are clients now, picked from a dropdown and stored as `broker_id` /
 * `manager_id`. This command turns every distinct name/phone pair already typed
 * into the properties table into a client of the matching type (وسيط / مسؤول
 * العقار) and links the property to it, so nothing entered before the change is
 * lost.
 *
 * Safe to run more than once: a property that already has the id set is skipped,
 * and an existing client is reused rather than duplicated. Matching is on the
 * digits of the phone number when there is one (so "9 999 8888" and "99998888"
 * are the same person), otherwise on the trimmed name.
 *
 *   php artisan properties:link-broker-manager-clients --dry-run   # report only
 *   php artisan properties:link-broker-manager-clients             # write
 */
class LinkPropertyBrokerManagerClients extends Command
{
    protected $signature = 'properties:link-broker-manager-clients
                            {--dry-run : Report what would be created and linked without writing anything}';

    protected $description = 'Create clients from the legacy broker/manager name+phone columns on properties and link them';

    /** The two roles this backfills: property column prefix => client type. */
    private const ROLES = [
        'broker'  => 'وسيط',
        'manager' => 'مسؤول العقار',
    ];

    /** Existing + newly created clients, keyed by "<type>|<phone digits or name>". */
    private array $index = [];

    private bool $dryRun = false;

    private array $stats = [
        'scanned'          => 0,
        'brokers_linked'   => 0,
        'managers_linked'  => 0,
        'clients_created'  => 0,
        'clients_reused'   => 0,
        'without_phone'    => 0,
    ];

    public function handle(): int
    {
        $this->dryRun = (bool) $this->option('dry-run');

        if ($this->dryRun) {
            $this->warn('وضع المعاينة — لن يتم حفظ أي تغيير.');
        }

        $this->buildIndex();

        Property::query()
            ->where(function ($q) {
                $q->whereNull('broker_id')->orWhereNull('manager_id');
            })
            ->orderBy('id')
            ->chunkById(200, function ($properties) {
                foreach ($properties as $property) {
                    $this->processProperty($property);
                }
            });

        $this->newLine();
        $this->table(['', 'العدد'], [
            ['العقارات التي تمت معالجتها', $this->stats['scanned']],
            ['ربط وسيط',                    $this->stats['brokers_linked']],
            ['ربط مسؤول عقار',              $this->stats['managers_linked']],
            ['عملاء تم إنشاؤهم',            $this->stats['clients_created']],
            ['عملاء موجودون تمت إعادة استخدامهم', $this->stats['clients_reused']],
            ['بدون رقم هاتف (تم الحفظ باسم فقط)',  $this->stats['without_phone']],
        ]);

        return self::SUCCESS;
    }

    /**
     * Load every existing broker/manager client once, so the whole backfill runs
     * against memory instead of a query per property, and so two properties that
     * name the same broker converge on one client.
     */
    private function buildIndex(): void
    {
        $types = array_map([Client::class, 'typeValue'], array_values(self::ROLES));

        Client::whereIn('type', $types)->get()->each(function (Client $client) {
            $this->indexClient($client);
        });
    }

    private function processProperty(Property $property): void
    {
        $this->stats['scanned']++;
        $updates = [];   // column => client id, written in one statement below
        $report  = [];   // human-readable version of the same, for the console

        foreach (self::ROLES as $column => $type) {
            $idColumn = "{$column}_id";
            if ($property->{$idColumn} !== null) {
                continue;
            }

            // Raw, not the accessor — the accessor now reads through the relation
            // this command is about to fill in.
            $name  = trim((string) $property->getRawOriginal("{$column}_name"));
            $phone = trim((string) $property->getRawOriginal("{$column}_phone_num"));

            if ($name === '' && $phone === '') {
                continue;
            }

            // A row with only a phone still identifies someone; label it so the
            // client list never shows a nameless entry.
            $client = $this->resolveClient($type, $name !== '' ? $name : $phone, $phone);

            $updates[$idColumn] = $client->id;
            $report[] = "{$type}: " . $this->describe($client);
            $this->stats[$column === 'broker' ? 'brokers_linked' : 'managers_linked']++;
        }

        if (! $updates) {
            return;
        }

        $this->line("عقار #{$property->id} — " . implode('، ', $report));

        if (! $this->dryRun) {
            // Query builder rather than $property->update(): this is a data
            // migration, so it must not fire model events or bump updated_at.
            DB::table('properties')->where('id', $property->id)->update($updates);
        }
    }

    /** Find the client this name/phone already refers to, or create it. */
    private function resolveClient(string $type, string $name, string $phone): Client
    {
        $key = $this->lookupKey($type, $name, $phone);

        if (isset($this->index[$key])) {
            $this->stats['clients_reused']++;
            return $this->index[$key];
        }

        if ($phone === '') {
            $this->stats['without_phone']++;
        }

        $attributes = [
            'full_name' => $name,
            // `clients.phone` is NOT NULL; an empty string records "not known"
            // without inventing a number.
            'phone'     => $phone,
            'type'      => $type,
            'status'    => 'نشط',
            'notes'     => 'أُنشئ تلقائيًا من بيانات العقارات (' . $type . ').',
        ];

        // Unsaved in --dry-run: it still goes into the index, so the rest of the
        // run reports the same de-duplication a real run would perform.
        $client = $this->dryRun ? new Client($attributes) : Client::create($attributes);

        $this->stats['clients_created']++;
        $this->indexClient($client);

        return $client;
    }

    /**
     * How a client reads in the console. A --dry-run client was never saved, so
     * it has no id to quote — name it instead of printing a meaningless 0.
     */
    private function describe(Client $client): string
    {
        return $client->exists
            ? "#{$client->id} {$client->full_name}"
            : "عميل جديد «{$client->full_name}»";
    }

    /**
     * Register a client under every key a property could look it up by, so the
     * next property naming the same person reuses it instead of creating a twin.
     * `??=` keeps the first client seen for a key — earlier rows win over later
     * near-duplicates, which makes repeat runs stable.
     */
    private function indexClient(Client $client): void
    {
        $type = $client->type;

        foreach ([$this->phoneKey($type, $client->phone), $this->nameKey($type, $client->full_name)] as $key) {
            if ($key !== null) {
                $this->index[$key] ??= $client;
            }
        }
    }

    /**
     * The single key a property's broker/manager is matched by. The phone is
     * authoritative when the property recorded one — two people can share a name,
     * so a name match must not override a differing number. Only a property with
     * no phone at all falls back to matching on the name.
     */
    private function lookupKey(string $type, string $name, string $phone): string
    {
        return $this->phoneKey($type, $phone) ?? $this->nameKey($type, $name) ?? "{$type}|blank";
    }

    /** Digits only, so "9 999-8888" and "99998888" are the same person. */
    private function phoneKey(string $type, ?string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $phone);

        return $digits === '' ? null : "{$type}|phone|{$digits}";
    }

    /** Whitespace collapsed and case-folded, for the same reason. */
    private function nameKey(string $type, ?string $name): ?string
    {
        $normalised = preg_replace('/\s+/u', ' ', trim((string) $name));

        return $normalised === '' ? null : "{$type}|name|" . mb_strtolower($normalised);
    }
}
