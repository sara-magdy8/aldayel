<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Collection;
use App\Models\ContractStatus;
use App\Models\Property;
use App\Models\PropertyRequest;
use App\Models\RentalContract;
use App\Models\SaleContract;
use App\Models\Unit;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /** Arabic (Gregorian) month names, indexed 1–12. */
    private const AR_MONTHS = [
        1 => 'يناير', 2 => 'فبراير', 3 => 'مارس', 4 => 'أبريل',
        5 => 'مايو', 6 => 'يونيو', 7 => 'يوليو', 8 => 'أغسطس',
        9 => 'سبتمبر', 10 => 'أكتوبر', 11 => 'نوفمبر', 12 => 'ديسمبر',
    ];

    public function index()
    {
        // Status breakdowns as [{ name, value }, ...] straight from the lookup tables,
        // so the card labels/values stay in sync with whatever rows the admin maintains.
        $propertiesStatus = $this->statusBreakdown('properties', 'property_statuses', 'property_status_id');
        $unitsStatus      = $this->statusBreakdown('units', 'property_statuses', 'property_status_id');
        $requestsStatus   = $this->statusBreakdown('requests', 'request_statuses', 'request_status_id');

        // "Open" = requests not in the closed (مكتمل) status — a business metric, computed server-side.
        $openRequests = (int) $requestsStatus->whereNotIn('name', ['مكتمل'])->sum('value');

        $activeStatusId = ContractStatus::idForName('نشط');
        $rentalActive = RentalContract::where('contract_status_id', $activeStatusId)->count();
        $saleActive   = SaleContract::where('contract_status_id', $activeStatusId)->count();

        // Monthly collected amount for the trailing 6 months (oldest → newest).
        $monthly = [];
        for ($i = 5; $i >= 0; $i--) {
            $date   = now()->subMonths($i);
            $amount = Collection::whereYear('payment_date', $date->year)
                ->whereMonth('payment_date', $date->month)
                ->sum('amount');

            $monthly[] = [
                'month'  => self::AR_MONTHS[$date->month],
                'amount' => (float) $amount,
            ];
        }

        $recentRequests = PropertyRequest::with(['client', 'broker', 'requestStatus', 'propertyCat'])
            ->latest()->take(5)->get()
            ->map(fn ($r) => [
                'client'   => $r->client->full_name ?? '—',
                'type'     => $r->request_type,
                'category' => $r->category,
                'status'   => $r->status,
                'date'     => optional($r->created_at)->toDateString(),
            ]);

        $recentCollections = Collection::with(['client', 'collectionTypeRef', 'paymentType'])
            ->latest('payment_date')->take(5)->get()
            ->map(fn ($c) => [
                'client' => $c->client->full_name ?? '—',
                'amount' => (float) $c->amount,
                'type'   => $c->collection_type,
                'method' => $c->payment_method,
                'date'   => optional($c->payment_date)->toDateString(),
            ]);

        return response()->json([
            'cards' => [
                'properties' => ['total' => Property::count()],
                'units'      => ['total' => Unit::count()],
                'requests'   => ['open'  => $openRequests],
                'contracts'  => [
                    'active' => $rentalActive + $saleActive,
                    'rental' => $rentalActive,
                    'sale'   => $saleActive,
                ],
                'today_collections' => (float) Collection::whereDate('payment_date', today())->sum('amount'),
                'month_collections' => (float) Collection::whereMonth('payment_date', now()->month)
                    ->whereYear('payment_date', now()->year)->sum('amount'),
            ],
            'monthly_collections' => $monthly,
            'properties_status'   => $propertiesStatus,
            'units_status'        => $unitsStatus,
            'requests_status'     => $requestsStatus,
            'recent_requests'     => $recentRequests,
            'recent_collections'  => $recentCollections,
        ]);
    }

    /**
     * Count a (soft-deleting) entity table grouped by a lookup table, returning
     * every lookup row as [{ name, value }, ...] (including zero-count rows).
     */
    private function statusBreakdown(string $entityTable, string $lookupTable, string $foreignKey)
    {
        return DB::table($lookupTable)
            ->leftJoin($entityTable, function ($join) use ($entityTable, $lookupTable, $foreignKey) {
                $join->on("{$entityTable}.{$foreignKey}", '=', "{$lookupTable}.id");
            })
            ->groupBy("{$lookupTable}.id", "{$lookupTable}.name")
            ->orderBy("{$lookupTable}.id")
            ->selectRaw("{$lookupTable}.name as name, count({$entityTable}.id) as value")
            ->get()
            ->map(fn ($row) => ['name' => $row->name, 'value' => (int) $row->value]);
    }
}
