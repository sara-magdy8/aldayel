<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Collection;
use App\Models\CollectionType;
use App\Models\ContractStatus;
use App\Models\PaymentBeneficiary;
use App\Models\PaymentType;
use App\Models\Property;
use App\Models\PropertyCat;
use App\Models\PropertyRequest;
use App\Models\PropertyStatus;
use App\Models\RentalContract;
use App\Models\SaleContract;
use App\Models\Unit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function summary()
    {
        return response()->json([
            'total_properties'     => Property::count(),
            'properties_by_status' => $this->countByLookup(
                'properties', 'property_statuses', 'property_status_id', 'status'
            ),
            'total_units'          => Unit::count(),
            'units_by_status'      => $this->countByLookup('units', 'property_statuses', 'property_status_id', 'status'),
            'total_clients'        => Client::count(),
            'open_requests'        => PropertyRequest::whereHas('requestStatus', fn ($q) =>
                                        $q->whereIn('name', ['جديد', 'قيد المتابعة']))->count(),
            'active_contracts'     => RentalContract::where('contract_status_id', ContractStatus::idForName('نشط'))->count()
                                      + SaleContract::where('contract_status_id', ContractStatus::idForName('نشط'))->count(),
            'total_collections'    => Collection::sum('amount'),
            'today_collections'    => Collection::whereDate('payment_date', today())->sum('amount'),
            'month_collections'    => Collection::whereMonth('payment_date', now()->month)
                                        ->whereYear('payment_date', now()->year)->sum('amount'),
        ]);
    }

    public function collections(Request $request)
    {
        $query = Collection::with(['client', 'property', 'collectionTypeRef', 'paymentBeneficiary', 'paymentType']);

        if ($request->date_from)       $query->where('payment_date', '>=', $request->date_from);
        if ($request->date_to)         $query->where('payment_date', '<=', $request->date_to);
        if ($ids = $this->lookupIds(CollectionType::class, $request->collection_type))  $query->whereIn('collection_type_id', $ids);
        if ($ids = $this->lookupIds(PaymentBeneficiary::class, $request->beneficiary))  $query->whereIn('payment_beneficiary_id', $ids);
        if ($ids = $this->lookupIds(PaymentType::class, $request->payment_method))      $query->whereIn('payment_type_id', $ids);

        $collections = $query->get();

        // The totals count money actually received, so they skip rows with no
        // payment_date — an outstanding payment link. The list itself still
        // carries them, so the report shows what is pending alongside what was
        // collected without inflating the figures.
        $paid = $collections->whereNotNull('payment_date');

        return response()->json([
            'collections'  => $collections,
            'total_amount' => $paid->sum('amount'),
            'count'        => $paid->count(),
            // avg() is null on an empty set, and round(null) is deprecated in PHP 8.1+.
            'average'      => round($paid->avg('amount') ?? 0, 3),
            'by_type'      => $paid->groupBy('collection_type')->map->sum('amount'),
        ]);
    }

    public function properties(Request $request)
    {
        $query = Property::with(['owner', 'broker', 'manager', 'propertyStatus', 'propertyCat']);

        if ($vals = $this->mappedValues([Property::class, 'listingTypeValue'], $request->listing_type)) $query->whereIn('listing_type', $vals);
        if ($ids = $this->lookupIds(PropertyStatus::class, $request->status))   $query->whereIn('property_status_id', $ids);
        if ($ids = $this->lookupIds(PropertyCat::class, $request->category))    $query->whereIn('property_cat_id', $ids);

        return response()->json([
            'properties'  => $query->get(),
            'by_category' => $this->countByLookup('properties', 'property_cats', 'property_cat_id', 'category'),
            'by_status'   => $this->countByLookup('properties', 'property_statuses', 'property_status_id', 'status'),
            'by_type'     => Property::groupBy('listing_type')
                                ->selectRaw('listing_type, count(*) as count')->get(),
        ]);
    }

    public function contracts(Request $request)
    {
        $rentalQuery = RentalContract::with(['property', 'tenant', 'contractStatus']);
        $saleQuery   = SaleContract::with(['property', 'buyer', 'contractStatus']);

        if ($statusIds = $this->lookupIds(ContractStatus::class, $request->status)) {
            $rentalQuery->whereIn('contract_status_id', $statusIds);
            $saleQuery->whereIn('contract_status_id', $statusIds);
        }

        return response()->json([
            'rental_contracts'   => $rentalQuery->get(),
            'sale_contracts'     => $saleQuery->get(),
            'total_rental_value' => RentalContract::where('contract_status_id', ContractStatus::idForName('نشط'))->sum('total_amount'),
            'total_sale_value'   => SaleContract::whereIn('contract_status_id',
                                        ContractStatus::whereIn('name', ['نشط', 'مكتمل'])->pluck('id'))->sum('total_amount'),
            'expiring_soon'      => RentalContract::where('contract_status_id', ContractStatus::idForName('نشط'))
                                        ->whereBetween('end_date', [now(), now()->addDays(60)])
                                        ->count(),
        ]);
    }

    public function clients(Request $request)
    {
        $query = Client::withCount(['requests', 'rentalContracts', 'saleContracts', 'collections']);

        if ($vals = $this->mappedValues([Client::class, 'typeValue'], $request->type))     $query->whereIn('type', $vals);
        if ($vals = $this->mappedValues([Client::class, 'statusValue'], $request->status)) $query->whereIn('status', $vals);

        return response()->json([
            'clients'   => $query->get(),
            'by_type'   => Client::groupBy('type')->selectRaw('type, count(*) as count')->get(),
            'by_status' => Client::groupBy('status')->selectRaw('status, count(*) as count')->get(),
        ]);
    }

    /**
     * Group a (soft-deleting) table's rows by a lookup table's name, returning
     * [{ <alias>, count }, ...] so the output mirrors the old groupBy('status') shape.
     * Uses the query builder so the domain model's name accessors don't override
     * the aliased SELECT.
     */
    private function countByLookup(string $table, string $lookupTable, string $foreignKey, string $alias)
    {
        return DB::table($table)
            ->join($lookupTable, "{$table}.{$foreignKey}", '=', "{$lookupTable}.id")
            ->groupBy("{$lookupTable}.name")
            ->selectRaw("{$lookupTable}.name as {$alias}, count(*) as count")
            ->get();
    }
}
