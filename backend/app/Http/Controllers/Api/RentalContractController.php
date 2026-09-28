<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ContractStatus;
use App\Models\PaymentType;
use App\Models\Property;
use App\Models\RentalContract;
use App\Models\RentalContractDocument;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class RentalContractController extends Controller
{
    /**
     * Named document slots stored one-per-type against a contract.
     * The first two are always required; the last three are required only
     * when the tenant is a company (Client type = شركة).
     */
    private const BASE_DOCUMENTS    = ['civil_id', 'license'];
    private const COMPANY_DOCUMENTS = ['incorporation_contract', 'signature_authorization', 'commercial_extract'];

    private const RELATIONS = ['property.owner', 'unit', 'tenant', 'paymentTerm', 'paymentType', 'contractStatus', 'documents'];

    private function documentTypes(): array
    {
        return array_merge(self::BASE_DOCUMENTS, self::COMPANY_DOCUMENTS);
    }

    public function index(Request $request)
    {
        $this->expirePastContracts();

        $query = RentalContract::with(self::RELATIONS);

        if ($ids = $this->lookupIds(ContractStatus::class, $request->status))      $query->whereIn('contract_status_id', $ids);
        if ($ids = $this->lookupIds(PaymentType::class, $request->payment_method))  $query->whereIn('payment_type_id', $ids);
        if ($request->search) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('contract_number', 'like', "%{$search}%")
                  ->orWhereHas('tenant', fn ($tq) =>
                      $tq->where('full_name', 'like', "%{$search}%")
                  );
            });
        }

        // Page size comes from the table's "عرض N سجل" dropdown; capped so a bad
        // `per_page` can't pull the entire table.
        $perPage = is_numeric($request->per_page) ? min(max((int) $request->per_page, 1), 500) : 20;

        return response()->json($query->latest()->paginate($perPage));
    }

    /**
     * Flip any active contract whose end_date has already passed to "منتهي".
     * Only active contracts are affected — drafts and cancelled contracts are
     * left untouched.
     */
    private function expirePastContracts(): void
    {
        $activeId  = ContractStatus::idForName('نشط');
        $expiredId = ContractStatus::idForName('منتهي');

        if (! $activeId || ! $expiredId) {
            return;
        }

        RentalContract::where('contract_status_id', $activeId)
            ->whereDate('end_date', '<', now()->toDateString())
            ->update(['contract_status_id' => $expiredId]);
    }

    public function stats()
    {
        $this->expirePastContracts();

        return response()->json([
            'مسودة' => RentalContract::where('contract_status_id', ContractStatus::idForName('مسودة'))->count(),
            'نشط'   => RentalContract::where('contract_status_id', ContractStatus::idForName('نشط'))->count(),
            'منتهي' => RentalContract::where('contract_status_id', ContractStatus::idForName('منتهي'))->count(),
            'ملغي'  => RentalContract::where('contract_status_id', ContractStatus::idForName('ملغي'))->count(),
        ]);
    }

    public function store(Request $request)
    {
        // Company tenants must supply the three extra incorporation documents.
        $isCompany = optional(Client::find($request->tenant_id))->type === 'شركة';

        $data = $request->validate([
            'contract_number' => 'nullable|string|unique:rental_contracts,contract_number',
            'property_id'    => 'required|exists:properties,id',
            'unit_id'        => 'nullable|exists:units,id',
            'tenant_id'      => 'required|exists:clients,id',
            'start_date'     => 'required|date',
            'end_date'       => 'required|date|after:start_date',
            'total_amount'   => 'required|numeric',
            'payment_period' => 'required|exists:payment_terms,name',
            'payment_method' => 'required|exists:payment_types,name',
            'deposit_amount' => 'nullable|numeric',
            'notes'          => 'nullable|string',
            'status'         => 'required|exists:contract_statuses,name',
            'civil_id'                => 'required|file|max:10240',
            'license'                 => 'required|file|max:10240',
            'incorporation_contract'  => ($isCompany ? 'required|' : 'nullable|') . 'file|max:10240',
            'signature_authorization' => ($isCompany ? 'required|' : 'nullable|') . 'file|max:10240',
            'commercial_extract'      => ($isCompany ? 'required|' : 'nullable|') . 'file|max:10240',
        ]);

        // Files are persisted separately — keep them out of the mass-assigned data.
        foreach ($this->documentTypes() as $type) {
            unset($data[$type]);
        }

        // Client may supply a custom number (validated unique above); otherwise
        // auto-generate. Loop past any slot already taken by a manual number so
        // the generated value stays unique against the index.
        if (empty($data['contract_number'])) {
            $year  = now()->year;
            $count = RentalContract::whereYear('created_at', $year)->count() + 1;
            do {
                $candidate = 'RC-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
                $count++;
            } while (RentalContract::where('contract_number', $candidate)->exists());
            $data['contract_number'] = $candidate;
        }

        $contract = RentalContract::create($data);
        $this->storeDocuments($request, $contract);

        return response()->json($contract->load(self::RELATIONS), 201);
    }

    public function show(RentalContract $rentalContract)
    {
        return response()->json($rentalContract->load(self::RELATIONS));
    }

    public function update(Request $request, RentalContract $rentalContract)
    {
        $data = $request->validate([
            'contract_number' => 'sometimes|string|unique:rental_contracts,contract_number,' . $rentalContract->id,
            'property_id'    => 'sometimes|exists:properties,id',
            'unit_id'        => 'nullable|exists:units,id',
            'tenant_id'      => 'sometimes|exists:clients,id',
            'start_date'     => 'sometimes|date',
            'end_date'       => 'sometimes|date',
            'total_amount'   => 'sometimes|numeric',
            'payment_period' => 'sometimes|exists:payment_terms,name',
            'payment_method' => 'sometimes|exists:payment_types,name',
            'deposit_amount' => 'nullable|numeric',
            'notes'          => 'nullable|string',
            'status'         => 'sometimes|exists:contract_statuses,name',
            // On edit, documents already exist — any re-uploaded file replaces its slot.
            'civil_id'                => 'nullable|file|max:10240',
            'license'                 => 'nullable|file|max:10240',
            'incorporation_contract'  => 'nullable|file|max:10240',
            'signature_authorization' => 'nullable|file|max:10240',
            'commercial_extract'      => 'nullable|file|max:10240',
        ]);

        foreach ($this->documentTypes() as $type) {
            unset($data[$type]);
        }

        $rentalContract->update($data);
        $this->storeDocuments($request, $rentalContract);

        return response()->json($rentalContract->load(self::RELATIONS));
    }

    public function destroy(RentalContract $rentalContract)
    {
        // Remove the stored files as well as the DB rows (cascade drops the rows,
        // but the files on disk would otherwise be orphaned).
        foreach ($rentalContract->documents as $document) {
            Storage::disk('public')->delete($document->file_path);
        }

        $rentalContract->delete();

        return response()->json(['message' => 'تم الحذف.']);
    }

    /**
     * Store any uploaded document files against the contract. Each type is a
     * single named slot — re-uploading replaces the previous file (disk + row).
     * Shared by store() and update() so both stay identical.
     */
    private function storeDocuments(Request $request, RentalContract $contract): void
    {
        foreach ($this->documentTypes() as $type) {
            if (! $request->hasFile($type)) {
                continue;
            }

            $file = $request->file($type);
            $path = $file->store('rental-contracts/' . $contract->id, 'public');

            $existing = $contract->documents()->where('type', $type)->first();
            if ($existing) {
                Storage::disk('public')->delete($existing->file_path);
                $existing->update(['file_path' => $path, 'file_name' => $file->getClientOriginalName()]);
            } else {
                $contract->documents()->create([
                    'type'      => $type,
                    'file_path' => $path,
                    'file_name' => $file->getClientOriginalName(),
                ]);
            }
        }
    }

    public function destroyDocument(RentalContract $rentalContract, RentalContractDocument $document)
    {
        // Guard against deleting a document that belongs to another contract.
        if ($document->rental_contract_id !== $rentalContract->id) {
            return response()->json(['message' => 'المستند لا يخص هذا العقد.'], 403);
        }

        Storage::disk('public')->delete($document->file_path);
        $document->delete();

        return response()->json(['message' => 'تم حذف المستند.']);
    }
}
