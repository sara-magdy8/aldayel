<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\PaymentLinkMail;
use App\Models\Collection;
use App\Models\CollectionAttachment;
use App\Models\CollectionType;
use App\Models\PaymentBeneficiary;
use App\Models\PaymentType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use RuntimeException;
use Throwable;

class CollectionController extends Controller
{
    public function index(Request $request)
    {
        $query = $this->filtered($request, Collection::with([
            'client', 'property', 'unit', 'attachments',
            'collectionTypeRef', 'paymentBeneficiary', 'paymentType',
            // Columns are pinned: the gateway's `credentials` are secrets and must
            // never ride along on a list response.
            'paymentGateway:id,name,gateway',
        ]));

        // Page size comes from the table's "عرض N سجل" dropdown; capped so a bad
        // `per_page` can't pull the entire table.
        $perPage = is_numeric($request->per_page) ? min(max((int) $request->per_page, 1), 500) : 20;

        return response()->json($query->latest()->paginate($perPage));
    }

    /**
     * Aggregate counters over the whole filtered dataset (not just the current page).
     * Uses the same filters as index() so the stats track the active filters/search.
     */
    public function stats(Request $request)
    {
        $base = $this->filtered($request, Collection::query());

        return response()->json([
            'total'         => (clone $base)->count(),
            'totalAmount'   => (float) (clone $base)->sum('amount'),
            'officeAmount'  => (float) (clone $base)->where('payment_beneficiary_id', PaymentBeneficiary::idForName('المكتب'))->sum('amount'),
            'invoicesCount' => (clone $base)->where('has_invoice', true)->count(),
        ]);
    }

    /**
     * Apply the shared list filters (collection_type, payment_method, beneficiary,
     * date range, search) to a query builder. Keeps index() and stats() identical.
     */
    private function filtered(Request $request, $query)
    {
        if ($ids = $this->lookupIds(CollectionType::class, $request->collection_type))     $query->whereIn('collection_type_id', $ids);
        if ($ids = $this->lookupIds(PaymentType::class, $request->payment_method))          $query->whereIn('payment_type_id', $ids);
        if ($ids = $this->lookupIds(PaymentBeneficiary::class, $request->beneficiary))      $query->whereIn('payment_beneficiary_id', $ids);
        if ($request->date_from)       $query->where('payment_date', '>=', $request->date_from);
        if ($request->date_to)         $query->where('payment_date', '<=', $request->date_to);
        if ($request->search) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('collection_number', 'like', "%{$search}%")
                  ->orWhereHas('client', fn ($cq) =>
                      $cq->where('full_name', 'like', "%{$search}%")
                  );
            });
        }

        return $query;
    }

    /**
     * Validation rules shared by store() and update(), merged over the handful
     * that differ (required vs sometimes). Keeping one list means a new column
     * cannot be accepted on create but silently dropped on edit.
     */
    private function rules(array $overrides): array
    {
        return array_merge([
            'property_id'                 => 'nullable|exists:properties,id',
            'unit_id'                     => 'nullable|exists:units,id',
            'broker'                      => 'nullable|string',
            'collection_method'           => ['nullable', Rule::in(Collection::METHODS)],
            // ── Payment link ───────────────────────────────────────────
            'payment_link_expiry_days'    => 'nullable|integer|min:1|max:365',
            // 0 is a real choice here — "بدون تذكير", not an absent value.
            'payment_link_reminder_days'  => 'nullable|integer|min:0|max:30',
            'payment_link_gateways'       => 'required_if:collection_method,payment_link|nullable|array|min:1',
            'payment_link_gateways.*'     => ['string', Rule::in(Collection::LINK_GATEWAYS)],
            'payment_link_channel'        => ['nullable', Rule::in(Collection::LINK_CHANNELS)],
            // Which saved gateway account issues the link. Nullable, not
            // required_if: an office with no gateway configured yet can still
            // record a link, and older links have no account attached.
            'payment_gateway_id'          => 'nullable|exists:payment_gateways,id',
            // ── Manual ─────────────────────────────────────────────────
            'check_number'                => 'nullable|string',
            'check_bank'                  => 'nullable|string',
            'check_date'                  => 'nullable|date',
            'transfer_bank'               => 'nullable|string',
            'transfer_transaction_number' => 'nullable|string',
            'transfer_date'               => 'nullable|date',
            'card_type'                   => 'nullable|in:فيزا,ماستركارد,مدى',
            'card_transaction_number'     => 'nullable|string',
            'card_last4'                  => 'nullable|string|size:4',
            'notes'                       => 'nullable|string',
            'has_invoice'                 => 'boolean',
            'attachments'                 => 'nullable|array',
            'attachments.*'               => 'file|max:10240',
        ], $overrides);
    }

    /**
     * Null out the settings that belong to the *other* collection method.
     *
     * Without this an edit that switches a link over to a manual payment keeps
     * its old gateways and expiry, so a collection recorded as cash still reads
     * as though a payment link is outstanding. Only applied when the request
     * actually states a method — a partial update that omits it is left alone.
     */
    private function clearUnusedPaymentFields(array $data): array
    {
        if (!array_key_exists('collection_method', $data) || $data['collection_method'] === null) {
            return $data;
        }

        if ($data['collection_method'] === 'manual') {
            return array_merge($data, [
                'payment_link_expiry_days'   => null,
                'payment_link_reminder_days' => null,
                'payment_link_gateways'      => null,
                'payment_link_channel'       => null,
                'payment_gateway_id'         => null,
                'payment_status'             => 'paid',
                'payment_paid_at'            => now(),
            ]);
        }

        return array_merge($data, [
            'check_number' => null, 'check_bank' => null, 'check_date' => null,
            'transfer_bank' => null, 'transfer_transaction_number' => null, 'transfer_date' => null,
            'card_type' => null, 'card_transaction_number' => null, 'card_last4' => null,
        ]);
    }

    /**
     * Mail the link to the address on the client record.
     *
     * @throws RuntimeException when the client has no address to send to — the
     *         one failure the office can actually fix, so it carries a message
     *         meant to be shown rather than only logged.
     */
    private function deliverPaymentLinkEmail(Collection $collection): void
    {
        $email = $collection->client()->value('email');

        if (! $email) {
            throw new RuntimeException('لا يوجد بريد إلكتروني مسجّل لهذا العميل');
        }

        Mail::to($email)->send(new PaymentLinkMail($collection));
    }

    /**
     * Mail the payment link on save, when `email` is the chosen channel.
     *
     * Only `email` is delivered by the system: a `whatsapp` link is opened in the
     * office's own WhatsApp by the frontend, and `copy` is shared by hand.
     *
     * Delivery never fails the request. The collection is already saved by this
     * point, and the office can still copy the link out of the list — losing the
     * whole record because a mail server was unreachable would be far worse.
     */
    private function mailPaymentLink(Collection $collection): void
    {
        if ($collection->collection_method !== 'payment_link'
            || $collection->payment_link_channel !== 'email') {
            return;
        }

        try {
            $this->deliverPaymentLinkEmail($collection);
        } catch (Throwable $e) {
            Log::error('Failed to mail the payment link.', [
                'collection_id' => $collection->id,
                'error'         => $e->getMessage(),
            ]);
        }
    }

    /**
     * POST /collections/{collection}/send-payment-link
     *
     * Re-send the link on demand: for one that never went out, or a client that
     * needs chasing. Unlike the automatic send on save, this one reports back —
     * the office asked for it, so it has to learn whether it worked.
     *
     * Any live payment link may be mailed, whatever channel was picked at save
     * time; the office is choosing to email it now.
     */
    public function sendPaymentLink(Collection $collection)
    {
        if ($collection->collection_method !== 'payment_link' || ! $collection->payment_link_url) {
            return response()->json(['message' => 'لا يوجد رابط دفع لهذا التحصيل'], 422);
        }

        try {
            $this->deliverPaymentLinkEmail($collection);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (Throwable $e) {
            Log::error('Failed to mail the payment link.', [
                'collection_id' => $collection->id,
                'error'         => $e->getMessage(),
            ]);
            return response()->json(['message' => 'تعذّر إرسال البريد الإلكتروني'], 500);
        }

        return response()->json(['message' => 'تم إرسال رابط الدفع إلى بريد العميل']);
    }

    /**
     * POST /collections/{collection}/regenerate-payment-link
     *
     * Issue a replacement link, for one that expired before the client got round to
     * paying — or one the office wants killed because it went to the wrong address.
     * The previous URL stops working the moment this returns.
     *
     * Not restricted to links that have actually expired: an office that needs the
     * old URL dead should not have to wait for it to lapse first. A settled payment
     * is the one case refused — reissuing there would reopen a closed collection.
     *
     * Mails the new link when email is the chosen channel, on the same best-effort
     * terms as save: the link is reissued either way and the response carries the
     * new URL, so a mail server outage never leaves the office without it.
     */
    public function regeneratePaymentLink(Collection $collection)
    {
        if ($collection->collection_method !== 'payment_link') {
            return response()->json(['message' => 'هذا التحصيل ليس رابط دفع'], 422);
        }

        if ($collection->isPaid()) {
            return response()->json(['message' => 'تم دفع هذا التحصيل — لا يمكن إصدار رابط جديد'], 422);
        }

        $collection->reissuePaymentLink();
        $this->mailPaymentLink($collection);

        return response()->json(
            $collection->load(['client', 'property', 'unit', 'attachments', 'collectionTypeRef', 'paymentBeneficiary', 'paymentType', 'paymentGateway:id,name,gateway'])
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules([
            'collection_type' => 'required|exists:collection_types,name',
            'client_id'       => 'required|exists:clients,id',
            'beneficiary'     => 'required|exists:payment_beneficiaries,name',
            'amount'          => 'required|numeric',
            'payment_method'  => 'required|exists:payment_types,name',
            // A payment link has no payment date until the client pays.
            'payment_date'    => 'required_unless:collection_method,payment_link|nullable|date',
        ]));

        unset($data['attachments']);
        $data = $this->clearUnusedPaymentFields($data);
        $collection = Collection::create($data);

        $this->storeAttachments($request, $collection);
        $this->mailPaymentLink($collection);

        return response()->json(
            $collection->load(['client', 'property', 'unit', 'attachments', 'collectionTypeRef', 'paymentBeneficiary', 'paymentType', 'paymentGateway:id,name,gateway']), 201
        );
    }

    public function show(Collection $collection)
    {
        return response()->json($collection->load(['client', 'property', 'unit', 'attachments', 'collectionTypeRef', 'paymentBeneficiary', 'paymentType', 'paymentGateway:id,name,gateway']));
    }

    public function update(Request $request, Collection $collection)
    {
        $data = $request->validate($this->rules([
            'collection_type' => 'sometimes|exists:collection_types,name',
            'client_id'       => 'sometimes|exists:clients,id',
            'beneficiary'     => 'sometimes|exists:payment_beneficiaries,name',
            'amount'          => 'sometimes|numeric',
            'payment_method'  => 'sometimes|exists:payment_types,name',
            'payment_date'    => 'sometimes|nullable|date',
        ]));

        unset($data['attachments']);
        $data = $this->clearUnusedPaymentFields($data);
        $collection->update($data);

        // Newly uploaded files are appended to the existing attachments.
        $this->storeAttachments($request, $collection);

        return response()->json($collection->load(['client', 'property', 'unit', 'attachments', 'collectionTypeRef', 'paymentBeneficiary', 'paymentType', 'paymentGateway:id,name,gateway']));
    }

    public function destroy(Collection $collection)
    {
        // Remove the stored files as well as the DB rows (cascade drops the rows,
        // but the files on disk would otherwise be orphaned).
        foreach ($collection->attachments as $attachment) {
            Storage::disk('public')->delete($attachment->file_path);
        }

        $collection->delete();
        return response()->json(['message' => 'تم الحذف.']);
    }

    /**
     * Store any uploaded `attachments[]` files against the collection.
     * Shared by store() and update() so both stay identical.
     */
    private function storeAttachments(Request $request, Collection $collection): void
    {
        if (!$request->hasFile('attachments')) {
            return;
        }

        foreach ($request->file('attachments') as $file) {
            $path = $file->store('collections/' . $collection->id, 'public');
            $collection->attachments()->create([
                'file_path' => $path,
                'file_name' => $file->getClientOriginalName(),
            ]);
        }
    }

    public function destroyAttachment(Collection $collection, CollectionAttachment $attachment)
    {
        // Guard against deleting an attachment that belongs to another collection.
        if ($attachment->collection_id !== $collection->id) {
            return response()->json(['message' => 'المرفق لا يخص هذا التحصيل.'], 403);
        }

        Storage::disk('public')->delete($attachment->file_path);
        $attachment->delete();

        return response()->json(['message' => 'تم حذف المرفق.']);
    }

    public function generateInvoice(Collection $collection)
    {
        if ($collection->has_invoice) {
            return response()->json([
                'message'        => 'الفاتورة موجودة.',
                'invoice_number' => $collection->invoice_number,
            ]);
        }

        $year  = now()->year;
        $count = Collection::whereYear('created_at', $year)->where('has_invoice', true)->count() + 1;
        $invoiceNumber = 'INV-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);

        $collection->update(['has_invoice' => true, 'invoice_number' => $invoiceNumber]);

        return response()->json(['invoice_number' => $invoiceNumber]);
    }
}
