<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ContractStatus;
use App\Models\PaymentType;
use App\Models\Property;
use App\Models\SaleContract;
use App\Models\SaleContractDocument;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SaleContractController extends Controller
{
    /**
     * Named document slots stored one-per-type against a contract.
     * The first two are always required; the last three are required only
     * when the buyer is a company (Client type = شركة).
     */
    private const BASE_DOCUMENTS    = ['civil_id', 'license'];
    private const COMPANY_DOCUMENTS = ['incorporation_contract', 'signature_authorization', 'commercial_extract'];

    private const RELATIONS = ['property.owner', 'unit', 'buyer', 'paymentType', 'contractStatus', 'documents'];

    private function documentTypes(): array
    {
        return array_merge(self::BASE_DOCUMENTS, self::COMPANY_DOCUMENTS);
    }

    public function stats()
    {
        return response()->json([
            'مسودة'  => SaleContract::where('contract_status_id', ContractStatus::idForName('مسودة'))->count(),
            'نشط'    => SaleContract::where('contract_status_id', ContractStatus::idForName('نشط'))->count(),
            'مكتمل'  => SaleContract::where('contract_status_id', ContractStatus::idForName('مكتمل'))->count(),
            'ملغي'   => SaleContract::where('contract_status_id', ContractStatus::idForName('ملغي'))->count(),
        ]);
    }

    public function index(Request $request)
    {
        $query = SaleContract::with(self::RELATIONS);

        if ($ids = $this->lookupIds(ContractStatus::class, $request->status))      $query->whereIn('contract_status_id', $ids);
        if ($ids = $this->lookupIds(PaymentType::class, $request->payment_method))  $query->whereIn('payment_type_id', $ids);
        if ($request->search) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('contract_number', 'like', "%{$search}%")
                  ->orWhereHas('buyer', fn ($bq) =>
                      $bq->where('full_name', 'like', "%{$search}%")
                  );
            });
        }

        // Page size comes from the table's "عرض N سجل" dropdown; capped so a bad
        // `per_page` can't pull the entire table.
        $perPage = is_numeric($request->per_page) ? min(max((int) $request->per_page, 1), 500) : 20;

        return response()->json($query->latest()->paginate($perPage));
    }

    public function store(Request $request)
    {
        // Company buyers must supply the three extra incorporation documents.
        $isCompany = optional(Client::find($request->buyer_id))->type === 'شركة';

        $data = $request->validate([
            'contract_number' => 'nullable|string|unique:sale_contracts,contract_number',
            'property_id'    => 'required|exists:properties,id',
            'unit_id'        => 'nullable|exists:units,id',
            'buyer_id'       => 'required|exists:clients,id',
            'contract_date'  => 'required|date',
            'delivery_date'  => 'nullable|date',
            'total_amount'   => 'required|numeric',
            'payment_method' => 'required|exists:payment_types,name',
            'down_payment'   => 'nullable|numeric',
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
            $count = SaleContract::whereYear('created_at', $year)->count() + 1;
            do {
                $candidate = 'SC-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
                $count++;
            } while (SaleContract::where('contract_number', $candidate)->exists());
            $data['contract_number'] = $candidate;
        }

        $contract = SaleContract::create($data);
        $this->storeDocuments($request, $contract);

        return response()->json($contract->load(self::RELATIONS), 201);
    }

    public function show(SaleContract $saleContract)
    {
        return response()->json($saleContract->load(self::RELATIONS));
    }

    public function update(Request $request, SaleContract $saleContract)
    {
        $data = $request->validate([
            'contract_number' => 'sometimes|string|unique:sale_contracts,contract_number,' . $saleContract->id,
            'property_id'    => 'sometimes|exists:properties,id',
            'unit_id'        => 'nullable|exists:units,id',
            'buyer_id'       => 'sometimes|exists:clients,id',
            'contract_date'  => 'sometimes|date',
            'delivery_date'  => 'nullable|date',
            'total_amount'   => 'sometimes|numeric',
            'payment_method' => 'sometimes|exists:payment_types,name',
            'down_payment'   => 'nullable|numeric',
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

        $saleContract->update($data);
        $this->storeDocuments($request, $saleContract);

        return response()->json($saleContract->load(self::RELATIONS));
    }

    public function destroy(SaleContract $saleContract)
    {
        // Remove the stored files as well as the DB rows (cascade drops the rows,
        // but the files on disk would otherwise be orphaned).
        foreach ($saleContract->documents as $document) {
            Storage::disk('public')->delete($document->file_path);
        }

        $saleContract->delete();

        return response()->json(['message' => 'تم الحذف.']);
    }

    /**
     * Store any uploaded document files against the contract. Each type is a
     * single named slot — re-uploading replaces the previous file (disk + row).
     * Shared by store() and update() so both stay identical.
     */
    private function storeDocuments(Request $request, SaleContract $contract): void
    {
        foreach ($this->documentTypes() as $type) {
            if (! $request->hasFile($type)) {
                continue;
            }

            $file = $request->file($type);
            $path = $file->store('sale-contracts/' . $contract->id, 'public');

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

    public function destroyDocument(SaleContract $saleContract, SaleContractDocument $document)
    {
        // Guard against deleting a document that belongs to another contract.
        if ($document->sale_contract_id !== $saleContract->id) {
            return response()->json(['message' => 'المستند لا يخص هذا العقد.'], 403);
        }

        Storage::disk('public')->delete($document->file_path);
        $document->delete();

        return response()->json(['message' => 'تم حذف المستند.']);
    }
}
