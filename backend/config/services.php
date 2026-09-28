<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    | Hesabe payment gateway (indirect integration).
    |
    | Per-merchant credentials are NOT here — they live encrypted on each
    | `payment_gateways` row so one install can collect through several accounts.
    | Only what is the same for every account belongs in this block.
    */
    'hesabe' => [
        // sandbox | live. Sandbox takes test cards only; switch on go-live.
        'mode'       => env('HESABE_MODE', 'sandbox'),
        'sandbox_url' => env('HESABE_SANDBOX_URL', 'https://sandbox.hesabe.com'),
        'live_url'   => env('HESABE_LIVE_URL', 'https://api.hesabe.com'),
        // The office bills in Kuwaiti dinars, matching the د.ك shown in the UI.
        'currency'   => env('HESABE_CURRENCY', 'KWD'),
        // mpgs | cybs — which card acquirer the merchant account sits behind.
        // It decides the paymentType number for cards (2 vs 5) and Apple Pay
        // (9 vs 10), so a wrong value here makes those buttons fail at checkout.
        // Confirm it with Hesabe for the live account; KNET and Google Pay are
        // the same either way.
        'acquirer'   => env('HESABE_ACQUIRER', 'mpgs'),
        // Escape hatch for local XAMPP, whose PHP often ships without a CA bundle.
        // Must stay true in production — off means the checkout call is MITM-able.
        'verify_ssl' => env('HESABE_VERIFY_SSL', true),
    ],

];
