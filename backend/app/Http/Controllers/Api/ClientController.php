<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClientController extends Controller
{
    public function stats()
    {
        return response()->json([
            'total'             => Client::count(),
            'individuals'       => Client::where('type', Client::typeValue('فرد'))->count(),
            'companies'         => Client::where('type', Client::typeValue('شركة'))->count(),
            'brokers'           => Client::where('type', Client::typeValue('وسيط'))->count(),
            'property_managers' => Client::where('type', Client::typeValue('مسؤول العقار'))->count(),
        ]);
    }

    /**
     * Representative data belongs to companies only — blank it out for every
     * other type so a client switched away from شركة keeps no stale values.
     */
    private function clearRepUnlessCompany(array $data, string $type): array
    {
        if ($type !== Client::TYPE_COMPANY) {
            $data['company_rep_name']  = null;
            $data['company_rep_phone'] = null;
        }

        return $data;
    }

    public function index(Request $request)
    {
        // الصفة — derived from what the client is attached to: مالك from owning a
        // property (properties.owner_id), مشتري from buying on a sale contract,
        // مستأجر from renting on a rental contract. withExists keeps it to three
        // subqueries on the page rather than a lookup per row, and the flags are
        // independent — a client can hold none of them, or all three.
        $query = Client::withExists(['ownedProperties', 'rentalContracts', 'saleContracts']);

        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('full_name', 'like', "%{$request->search}%")
                  ->orWhere('phone', 'like', "%{$request->search}%");
            });
        }
        if ($vals = $this->mappedValues([Client::class, 'typeValue'], $request->type))     $query->whereIn('type', $vals);
        if ($vals = $this->mappedValues([Client::class, 'statusValue'], $request->status)) $query->whereIn('status', $vals);
        $this->applyRoleFilter($query, $request->role);

        // Dropdowns ask for a large page so their search results aren't cut to the
        // list page's five rows; capped so a bad `per_page` can't pull the table.
        $perPage = is_numeric($request->per_page) ? min(max((int) $request->per_page, 1), 500) : 20;

        return response()->json($query->latest()->paginate($perPage));
    }

    /**
     * GET /clients/options — slim, capped list for the client comboboxes.
     *
     * Drops the `withExists` role subqueries and every column the list table
     * needs but a combobox does not. `type` stays because the rental contract
     * form keys its company-only document slots off it. See the matching
     * PropertyController::options for what `include` and `limit=0` are for.
     */
    public function options(Request $request)
    {
        $limit   = is_numeric($request->limit) ? min(max((int) $request->limit, 0), 100) : 50;
        $include = is_numeric($request->include) ? (int) $request->include : null;

        $base = fn () => Client::query()->select(['id', 'full_name', 'phone', 'type', 'created_at']);

        $rows = collect();

        if ($limit > 0) {
            $query = $base();

            if ($request->search) {
                $query->where(function ($q) use ($request) {
                    $q->where('full_name', 'like', "%{$request->search}%")
                      ->orWhere('phone', 'like', "%{$request->search}%");
                });
            }
            if ($vals = $this->mappedValues([Client::class, 'typeValue'], $request->type)) $query->whereIn('type', $vals);
            // Excluded here so the prepended copy below is not a duplicate.
            if ($include) $query->where('id', '!=', $include);

            $rows = $query->latest()->limit($limit)->get();
        }

        if ($include && $row = $base()->whereKey($include)->first()) {
            $rows->prepend($row);
        }

        return response()->json($rows->map(fn ($c) => [
            'id'        => $c->id,
            'full_name' => $c->full_name,
            'phone'     => $c->phone,
            'type'      => $c->type,
        ])->values());
    }

    /**
     * الصفة — filter by what the client is attached to. Same relations the
     * `withExists` flags in index() are read from, so the filter and the column
     * can never disagree. Selecting several roles widens the result (OR) rather
     * than demanding a client who holds all of them, matching how the النوع /
     * الحالة filters behave. Unknown values are dropped; an empty selection
     * filters nothing.
     */
    private const ROLE_RELATIONS = [
        'مالك'    => 'ownedProperties',
        'مشتري'   => 'saleContracts',
        'مستأجر'  => 'rentalContracts',
    ];

    private function applyRoleFilter($query, $roles): void
    {
        $relations = array_intersect_key(self::ROLE_RELATIONS, array_flip((array) $roles));

        if (! $relations) {
            return;
        }

        $query->where(function ($q) use ($relations) {
            foreach ($relations as $relation) {
                $q->orWhereHas($relation);
            }
        });
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'full_name'          => 'required|string|max:255',
            'phone'              => 'required|string|max:20',
            'email'              => 'nullable|email|unique:clients,email',
            'type'               => ['required', Rule::in(Client::TYPES)],
            'company_rep_name'   => 'required_if:type,' . Client::TYPE_COMPANY . '|nullable|string|max:255',
            'company_rep_phone'  => 'required_if:type,' . Client::TYPE_COMPANY . '|nullable|string|max:20',
            'notes'              => 'nullable|string',
            'status'             => 'sometimes|in:نشط,غير نشط',
        ]);

        $client = Client::create($this->clearRepUnlessCompany($data, $data['type']));
        return response()->json($client, 201);
    }

    public function show(Client $client)
    {
        return response()->json(
            $client->load([
                'ownedProperties', 'requests.broker', 'rentalContracts', 'saleContracts',
                // Nested lookups feed the collection_type / beneficiary / payment_method accessors.
                'collections.property',
                'collections.collectionTypeRef',
                'collections.paymentBeneficiary',
                'collections.paymentType',
            ])
        );
    }

    public function update(Request $request, Client $client)
    {
        // A partial update may omit `type` — the stored one still decides
        // whether representative data is mandatory.
        $type      = $request->input('type', $client->type);
        $isCompany = $type === Client::TYPE_COMPANY;

        // Demand rep data for a company, but let a partial update that does not
        // touch it through when the record already carries it.
        $repRule = fn (string $column) => $isCompany
            ? ($client->{$column} ? 'sometimes|required' : 'required')
            : 'nullable';

        $data = $request->validate([
            'full_name'         => 'sometimes|string|max:255',
            'phone'             => 'sometimes|string|max:20',
            'email'             => 'nullable|email|unique:clients,email,' . $client->id,
            'type'              => ['sometimes', Rule::in(Client::TYPES)],
            'company_rep_name'  => $repRule('company_rep_name') . '|string|max:255',
            'company_rep_phone' => $repRule('company_rep_phone') . '|string|max:20',
            'notes'             => 'nullable|string',
            'status'            => 'sometimes|in:نشط,غير نشط',
        ]);

        $client->update($this->clearRepUnlessCompany($data, $type));
        return response()->json($client);
    }

    public function destroy(Client $client)
    {
        // Every one of these is a restrictOnDelete key, and the delete is
        // permanent — so refuse it here rather than let MySQL raise it as a 500.
        if (
            $client->ownedProperties()->exists() ||
            $client->requests()->exists() ||
            $client->rentalContracts()->exists() ||
            $client->saleContracts()->exists() ||
            $client->collections()->exists()
        ) {
            return response()->json([
                'message' => 'لا يمكن حذف عميل مرتبط بعقار أو طلب أو عقد أو تحصيل.'
            ], 422);
        }

        $client->delete();
        return response()->json(['message' => 'تم الحذف.']);
    }
}
