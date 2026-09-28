<?php

namespace App\Http\Controllers;

use App\Models\Collection;
use App\Models\PaymentGateway;
use App\Services\HesabeService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The public face of a payment link: /pay/{token}.
 *
 * Unauthenticated by design — the token in the URL is the only credential, which
 * is why it is long and random. Nothing here trusts a query parameter: the amount
 * charged and the account charged through are both read from the collection row.
 */
class PaymentLinkController extends Controller
{
    /**
     * Open a link. Where the payer goes next depends on what the office allowed in
     * `payment_link_gateways`:
     *
     *   nothing / everything → Hesabe's own hosted page, which lists every method
     *   exactly one method   → straight to it; there is nothing to choose
     *   a real subset        → our picker page, listing only those methods
     *
     * The subset case needs the picker because Hesabe's checkout API takes a single
     * paymentType, not a list — there is no way to ask its hosted page for "these
     * three but not that one".
     */
    public function show(string $token)
    {
        [$collection, $failure] = $this->loadPayable($token);

        if ($failure) {
            return $failure;
        }

        $methods = HesabeService::methodsFor($collection->payment_link_gateways);

        // Nothing to narrow down: let Hesabe present the full list itself rather
        // than making the payer pick twice.
        if ($methods === [] || count($methods) === HesabeService::methodCount()) {
            return $this->startCheckout($collection, HesabeService::PAYMENT_TYPE_INDIRECT);
        }

        if (count($methods) === 1) {
            return $this->startCheckout($collection, $methods[0]['type']);
        }

        return response()->view('payment.methods', [
            'collection' => $collection,
            'methods'    => $methods,
        ]);
    }

    /**
     * Start a checkout for the method the payer chose on the picker page.
     *
     * The slug is re-checked against the collection's own allowed list, so editing
     * the URL cannot reach a method the office deliberately left off the link.
     */
    public function start(string $token, string $method)
    {
        [$collection, $failure] = $this->loadPayable($token);

        if ($failure) {
            return $failure;
        }

        $chosen = null;

        foreach (HesabeService::methodsFor($collection->payment_link_gateways) as $candidate) {
            if ($candidate['slug'] === $method) {
                $chosen = $candidate;
                break;
            }
        }

        if (!$chosen) {
            return $this->result('invalid', $collection, 404);
        }

        return $this->startCheckout($collection, $chosen['type']);
    }

    /**
     * Run the checkout call and bounce the payer to Hesabe's hosted form.
     *
     * Deliberately not cached — each visit starts a fresh checkout, so a payer who
     * abandons the form and re-opens the link is not stuck on a dead token.
     */
    private function startCheckout(Collection $collection, int $paymentType)
    {
        // A fresh reference per attempt: gateways reject a repeated
        // orderReferenceNumber, which would make every retry of an abandoned
        // payment fail. The collection is identified by variable1 instead.
        $orderReference = $collection->collection_number . '-' . now()->format('YmdHis');
        $callback = route('payment-link.callback', $collection->payment_link_token);

        try {
            $url = HesabeService::forGateway($collection->paymentGateway)->checkoutUrl(
                amount: (float) $collection->amount,
                orderReference: $orderReference,
                responseUrl: $callback,
                failureUrl: $callback,
                variables: [
                    'variable1' => (string) $collection->id,
                    'variable2' => (string) $collection->collection_number,
                ],
                paymentType: $paymentType,
            );
        } catch (Throwable $e) {
            // The message can name the merchant account or the reason Hesabe refused —
            // log it, but show the payer the generic page.
            Log::error('Hesabe checkout failed.', [
                'collection_id' => $collection->id,
                'payment_type'  => $paymentType,
                'message'       => $e->getMessage(),
            ]);

            return $this->result('error', $collection, 502);
        }

        $collection->forceFill(['payment_order_reference' => $orderReference])->save();

        return redirect()->away($url);
    }

    /**
     * Load a link that is ready to be paid.
     *
     * @return array{0: Collection|null, 1: \Illuminate\Http\Response|null} the
     *         collection, or the page explaining why it cannot be paid.
     */
    private function loadPayable(string $token): array
    {
        $collection = Collection::where('payment_link_token', $token)
            ->with(['client', 'paymentGateway'])
            ->first();

        if (!$collection || $collection->collection_method !== 'payment_link') {
            return [null, $this->result('invalid', null, 404)];
        }

        if ($collection->isPaid()) {
            return [null, $this->result('already_paid', $collection)];
        }

        if ($collection->paymentLinkExpired()) {
            return [null, $this->result('expired', $collection, 410)];
        }

        $gateway = $collection->resolvePaymentGateway();

        if (!$gateway) {
            Log::warning('Payment link opened with no usable gateway account.', [
                'collection_id' => $collection->id,
                // The two cases need different fixes: configure an account, versus
                // edit this collection to say which of several accounts to charge.
                'reason' => PaymentGateway::count() > 1
                    ? 'collection names no gateway and the office has several'
                    : 'no gateway account is configured',
            ]);

            return [null, $this->result('error', $collection, 503)];
        }

        // Pin the account that is about to be charged. The callback decrypts with
        // whatever the row names, so a fallback that stayed in memory would leave
        // the response unreadable — and the office's record should show where the
        // money actually went.
        if ($collection->payment_gateway_id !== $gateway->id) {
            $collection->forceFill(['payment_gateway_id' => $gateway->id])->save();
            $collection->setRelation('paymentGateway', $gateway);
        }

        return [$collection, null];
    }

    /**
     * Where Hesabe returns the payer — used for both responseUrl and failureUrl,
     * since the outcome is inside the encrypted payload either way.
     *
     * Accepts GET and POST: Hesabe redirects with GET, but a webhook configured on
     * the merchant panel posts the same encrypted `data` here.
     */
    public function callback(Request $request, string $token)
    {
        $collection = Collection::where('payment_link_token', $token)->with('paymentGateway')->first();

        if (!$collection || !$collection->paymentGateway) {
            return $this->result('invalid', null, 404);
        }

        $data = $request->input('data');

        if (blank($data)) {
            return $this->result('failed', $collection);
        }

        try {
            $payload = HesabeService::forGateway($collection->paymentGateway)->decryptResponse((string) $data);
        } catch (Throwable $e) {
            Log::error('Hesabe callback could not be processed.', [
                'collection_id' => $collection->id,
                'message'       => $e->getMessage(),
            ]);

            return $this->result('error', $collection, 502);
        }

        // Undecryptable means it was not signed with this account's keys: a forged
        // or misdirected callback. Never let it touch the row.
        if ($payload === null) {
            Log::warning('Hesabe callback failed decryption.', ['collection_id' => $collection->id]);
            return $this->result('error', $collection, 400);
        }

        $details = $payload['response'] ?? [];

        // The response echoes back what we sent; if it names a different collection,
        // the payer landed on the wrong link and the row must not be marked paid.
        if (isset($details['variable1']) && (string) $details['variable1'] !== (string) $collection->id) {
            Log::warning('Hesabe callback referenced another collection.', [
                'collection_id' => $collection->id,
                'variable1'     => $details['variable1'],
            ]);

            return $this->result('error', $collection, 400);
        }

        if (!HesabeService::isSuccessful($payload)) {
            // Only a still-open link degrades to failed — a later declined retry must
            // not undo a payment that already settled, nor overwrite the response that
            // recorded it.
            if (!$collection->isPaid()) {
                $collection->forceFill([
                    'payment_status'           => Collection::PAYMENT_FAILED,
                    'payment_gateway_response' => $payload,
                ])->save();
            }

            return $this->result('failed', $collection);
        }

        // Re-entering the callback (refresh, webhook after redirect) must not
        // rewrite a settled payment.
        if (!$collection->isPaid()) {
            $collection->forceFill([
                'payment_status'    => Collection::PAYMENT_PAID,
                'payment_reference' => $details['paymentId'] ?? null,
                'payment_paid_at'   => now(),
                // The office's own reporting filters on payment_date, so a link that
                // settles has to fill it in the same way a manual collection would.
                'payment_date'      => $collection->payment_date ?? now()->toDateString(),
                // The full decrypted payload, kept for reconciliation and disputes.
                'payment_gateway_response' => $payload,
            ])->save();
        }

        return $this->result('paid', $collection->fresh(['client']));
    }

    /** Render the payer-facing outcome page. */
    private function result(string $state, ?Collection $collection, int $status = 200)
    {
        return response()->view('payment.result', [
            'state'      => $state,
            'collection' => $collection,
        ], $status);
    }
}
