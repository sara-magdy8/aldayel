<?php

namespace App\Services;

use App\Models\PaymentGateway;
use App\Support\HesabeCrypt;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Talks to Hesabe's *indirect* checkout API.
 *
 * The flow, end to end:
 *   1. POST the AES-encrypted order to `{base}/checkout` with the accessCode header.
 *   2. Decrypt the reply and read `response.data` — a one-shot payment token.
 *   3. Send the payer to `{base}/payment?data={token}`, where Hesabe hosts the form.
 *   4. Hesabe returns them to our responseUrl/failureUrl with an encrypted `data`
 *      query parameter carrying the outcome, which decryptResponse() unpacks.
 *
 * Credentials are per gateway account (see PaymentGateway), so build the service
 * with forGateway() rather than resolving it from the container.
 *
 * @see https://developer.hesabe.com/docs/guides/hesabe-indirect-integration/
 */
class HesabeService
{
    /** Indirect: Hesabe hosts the method picker (KNET, cards, wallets). */
    public const PAYMENT_TYPE_INDIRECT = 0;

    /**
     * The gateway labels the office picks from (Collection::LINK_GATEWAYS), mapped
     * to a URL-safe slug and Hesabe's direct paymentType.
     *
     * Hesabe has no "show only these methods" parameter — paymentType names exactly
     * one method, or 0 for all of them. Restricting the list therefore has to happen
     * on our own picker page, which sends the chosen method's number from here.
     *
     * Cards and Apple Pay differ by acquirer; KNET and Google Pay do not.
     * @see https://developer.hesabe.com/docs/guides/hesabe-direct-Integration
     */
    private const METHODS = [
        'knet'      => ['label' => 'كي نت',            'mpgs' => 1,  'cybs' => 1],
        'card'      => ['label' => 'فيزا / ماستركارد', 'mpgs' => 2,  'cybs' => 5],
        'applepay'  => ['label' => 'Apple Pay',        'mpgs' => 9,  'cybs' => 10],
        'googlepay' => ['label' => 'Google Pay',       'mpgs' => 16, 'cybs' => 16],
    ];

    /** API contract version the encrypted payload declares. */
    private const VERSION = '2.0';

    /** Result codes that mean the money actually moved. */
    private const SUCCESS_CODES = ['CAPTURED', 'ACCEPT', 'SUCCESS'];

    /** `code` on a checkout reply that was accepted. */
    private const CHECKOUT_SUCCESS_CODE = 200;

    public function __construct(
        private readonly string $baseUrl,
        private readonly string $merchantCode,
        private readonly string $accessCode,
        private readonly string $secretKey,
        private readonly string $ivKey,
    ) {
    }

    /**
     * Build the service from one of the office's saved gateway accounts.
     *
     * @throws RuntimeException when the account is not Hesabe or its credentials
     *                          were never filled in on the settings screen.
     */
    public static function forGateway(PaymentGateway $gateway): self
    {
        if ($gateway->gateway !== 'hesabe') {
            throw new RuntimeException("بوابة الدفع «{$gateway->name}» ليست بوابة هسابة.");
        }

        $credentials = $gateway->credentials ?? [];

        foreach (['merchant_code', 'access_code', 'secret_key', 'iv_key'] as $field) {
            if (blank($credentials[$field] ?? null)) {
                throw new RuntimeException("بيانات بوابة الدفع «{$gateway->name}» غير مكتملة ({$field}).");
            }
        }

        return new self(
            baseUrl: rtrim(self::baseUrl(), '/'),
            merchantCode: (string) $credentials['merchant_code'],
            accessCode: (string) $credentials['access_code'],
            secretKey: (string) $credentials['secret_key'],
            ivKey: (string) $credentials['iv_key'],
        );
    }

    /**
     * Turn a collection's `payment_link_gateways` into the methods to offer, each
     * with the paymentType that routes straight to it.
     *
     * Order follows METHODS, not the stored array, so the picker page always lists
     * KNET first regardless of the order the office ticked the boxes in. Labels the
     * catalog does not know (renamed in the UI, say) are dropped rather than shown
     * as a button that cannot work.
     *
     * @param  array<int, string>|null  $gateways
     * @return array<int, array{slug: string, label: string, type: int}>
     */
    public static function methodsFor(?array $gateways): array
    {
        $selected = array_filter((array) $gateways);
        $acquirer = config('services.hesabe.acquirer') === 'cybs' ? 'cybs' : 'mpgs';
        $methods = [];

        foreach (self::METHODS as $slug => $method) {
            if (in_array($method['label'], $selected, true)) {
                $methods[] = ['slug' => $slug, 'label' => $method['label'], 'type' => $method[$acquirer]];
            }
        }

        return $methods;
    }

    /** How many methods the office is able to choose between. */
    public static function methodCount(): int
    {
        return count(self::METHODS);
    }

    /** Sandbox or live host, per `services.hesabe.mode`. */
    public static function baseUrl(): string
    {
        return config('services.hesabe.mode') === 'live'
            ? config('services.hesabe.live_url')
            : config('services.hesabe.sandbox_url');
    }

    /**
     * Run the checkout call and return the hosted payment page URL to redirect to.
     *
     * @param  array<string, string>  $variables  variable1…variable5 — echoed back
     *                                            untouched in the response, which is
     *                                            how we tie the callback to a row.
     * @param  int  $paymentType  0 to let Hesabe present every method, or one of the
     *                            numbers from METHODS to go straight to that one.
     * @throws RuntimeException on a transport failure or a rejected order; the
     *                          message is safe to log but not to show a payer.
     */
    public function checkoutUrl(
        float $amount,
        string $orderReference,
        string $responseUrl,
        string $failureUrl,
        array $variables = [],
        int $paymentType = self::PAYMENT_TYPE_INDIRECT,
    ): string {
        $payload = [
            'merchantCode'         => $this->merchantCode,
            // KWD is a 3-decimal currency; sending 12.5 for 12.500 is a different order.
            'amount'               => number_format($amount, 3, '.', ''),
            'currency'             => config('services.hesabe.currency', 'KWD'),
            'paymentType'          => $paymentType,
            'responseUrl'          => $responseUrl,
            'failureUrl'           => $failureUrl,
            'orderReferenceNumber' => $orderReference,
            'version'              => self::VERSION,
        ];

        // Only the five documented slots exist; anything else is dropped rather than
        // sent, because Hesabe rejects the whole order on an unknown field.
        foreach (range(1, 5) as $i) {
            $payload["variable{$i}"] = (string) ($variables["variable{$i}"] ?? '');
        }

        $encrypted = HesabeCrypt::encrypt(json_encode($payload, JSON_UNESCAPED_UNICODE), $this->secretKey, $this->ivKey);

        $response = Http::asMultipart()
            ->withHeaders([
                'accessCode' => $this->accessCode,
                'Accept'     => 'application/json',
            ])
            ->withOptions(['verify' => (bool) config('services.hesabe.verify_ssl', true)])
            ->timeout(30)
            ->post("{$this->baseUrl}/checkout", [
                ['name' => 'data', 'contents' => $encrypted],
            ]);

        if ($response->failed()) {
            throw new RuntimeException("تعذّر الاتصال ببوابة الدفع (HTTP {$response->status()}).");
        }

        $decoded = $this->decode($response->body());

        // A rejected order comes back as status:false — surface Hesabe's own message,
        // it is the only thing that says *why* (bad access code, amount, merchant…).
        if (!($decoded['status'] ?? false) || (int) ($decoded['code'] ?? 0) !== self::CHECKOUT_SUCCESS_CODE) {
            $message = $decoded['message'] ?? 'استجابة غير مفهومة من بوابة الدفع.';
            throw new RuntimeException("رفضت بوابة الدفع الطلب: {$message}");
        }

        $token = $decoded['response']['data'] ?? null;

        if (blank($token)) {
            throw new RuntimeException('لم ترجع بوابة الدفع رمز الدفع.');
        }

        return "{$this->baseUrl}/payment?data={$token}";
    }

    /**
     * Unpack the `data` parameter Hesabe puts on the response/failure URL.
     *
     * @return array<string, mixed>|null null when the value was not encrypted with
     *                                   this account's keys — i.e. forged, or aimed
     *                                   at a different gateway account.
     */
    public function decryptResponse(string $data): ?array
    {
        $plain = HesabeCrypt::decrypt($data, $this->secretKey, $this->ivKey);

        if ($plain === false) {
            return null;
        }

        $decoded = json_decode($plain, true);

        return is_array($decoded) ? $decoded : null;
    }

    /** Did this decrypted payment response settle? */
    public static function isSuccessful(array $payload): bool
    {
        $result = $payload['response']['resultCode'] ?? $payload['resultCode'] ?? null;

        return in_array(strtoupper((string) $result), self::SUCCESS_CODES, true);
    }

    /**
     * Decode a checkout reply, which is encrypted on success but can arrive as
     * plain JSON when Hesabe rejects the request before it decrypts our payload
     * (a bad access code, for instance).
     *
     * @return array<string, mixed>
     */
    private function decode(string $body): array
    {
        $plain = HesabeCrypt::decrypt($body, $this->secretKey, $this->ivKey);
        $decoded = json_decode($plain === false ? $body : $plain, true);

        return is_array($decoded) ? $decoded : [];
    }
}
