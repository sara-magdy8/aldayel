{{--
  The payment link as the client receives it.

  Serves both the first send (PaymentLinkMail) and the expiry chase
  (PaymentLinkReminderMail, which sets $reminder) — same amount, same button,
  same link, only the framing differs.

  Plain tables and inline styles on purpose: mail clients strip <style> blocks,
  flexbox and CSS variables, so none of the payment page's stylesheet can be
  reused here. RTL is set on the elements themselves for the same reason.
--}}
@php($reminder = $reminder ?? false)
<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>رابط الدفع</title>
</head>
<body style="margin:0; padding:0; background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#f3f4f6; padding:24px 12px;" dir="rtl">
    <tr>
        <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="max-width:480px; background:#ffffff; border-radius:16px; overflow:hidden;
                          font-family:'Segoe UI', Tahoma, Arial, sans-serif; color:#1f2937;">
                <tr>
                    <td align="center" style="padding:28px 24px 8px;">
                        @if ($officeLogo)
                            <img src="{{ $officeLogo }}" alt="{{ $officeName }}" height="48"
                                 style="max-height:48px; display:block; border:0;">
                        @else
                            <div style="font-size:20px; font-weight:bold;">{{ $officeName }}</div>
                        @endif
                    </td>
                </tr>

                @if ($reminder)
                    <tr>
                        <td align="center" style="padding:16px 24px 0;">
                            <div style="background:#fef3c7; color:#92400e; border-radius:10px;
                                        padding:10px 16px; font-size:14px; font-weight:bold;">
                                {{ $expiryPhrase }}
                            </div>
                        </td>
                    </tr>
                @endif

                <tr>
                    <td style="padding:16px 24px 0; font-size:16px; line-height:1.7;">
                        مرحباً {{ $collection->client?->full_name }}،
                        <br>
                        @if ($reminder)
                            نذكّرك بأن المبلغ التالي{{ $collection->collection_type ? ' (' . $collection->collection_type . ')' : '' }} ما زال غير مسدد:
                        @else
                            مطلوب سداد المبلغ التالي{{ $collection->collection_type ? ' (' . $collection->collection_type . ')' : '' }}:
                        @endif
                    </td>
                </tr>

                <tr>
                    <td align="center" style="padding:20px 24px 4px;">
                        <div style="font-size:28px; font-weight:bold; color:#16a34a; direction:ltr;">
                            {{ number_format((float) $collection->amount, 3) }} د.ك
                        </div>
                        <div style="font-size:13px; color:#6b7280; padding-top:6px;">
                            فاتورة رقم {{ $collection->collection_number }}
                        </div>
                        {{-- listing_type is a boolean column; the model accessor hands
                             it over already as إيجار / بيع. --}}
                        @if ($property)
                            <div style="font-size:13px; color:#6b7280; padding-top:6px;">
                                {{ $property->name }}
                                <span style="color:#9ca3af;">({{ $property->listing_type }})</span>
                            </div>
                        @endif
                    </td>
                </tr>

                <tr>
                    <td align="center" style="padding:24px;">
                        <a href="{{ $collection->payment_link_url }}"
                           style="display:inline-block; background:#16a34a; color:#ffffff; text-decoration:none;
                                  font-size:16px; font-weight:bold; padding:14px 36px; border-radius:10px;">
                            ادفع الآن
                        </a>
                    </td>
                </tr>

                <tr>
                    {{-- Some clients strip or rewrite the button; the raw URL is the fallback. --}}
                    <td align="center" style="padding:0 24px 8px; font-size:12px; color:#6b7280; line-height:1.8;">
                        أو انسخ الرابط التالي في المتصفح:
                        <br>
                        <span style="direction:ltr; unicode-bidi:embed; word-break:break-all; color:#2563eb;">
                            {{ $collection->payment_link_url }}
                        </span>
                    </td>
                </tr>

                @if ($expiresAt)
                    <tr>
                        <td align="center" style="padding:8px 24px 0; font-size:13px; color:#d97706;">
                            الرابط صالح حتى {{ $expiresAt->format('Y-m-d') }}
                        </td>
                    </tr>
                @endif

                <tr>
                    <td align="center"
                        style="padding:24px; border-top:1px solid #e5e7eb; margin-top:16px;
                               font-size:12px; color:#6b7280; line-height:1.8;">
                        {{ $officeName }}
                        @if ($officePhone)
                            <br>
                            <span style="direction:ltr; unicode-bidi:embed;">{{ $officePhone }}</span>
                        @endif
                        <br>
                        إذا وصلتك هذه الرسالة بالخطأ، تجاهلها ولا تستخدم الرابط.
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
