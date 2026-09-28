{{--
  عقد الإيجار as the tenant hears about it (RentalContractExpiryMail, sent by
  `contracts:send-expiry-alerts`).

  Serves both framings — the run-up to the end, and the closing notice once the
  lease is over, which sets $ended. Same lease details and same contact footer;
  only the banner and one sentence differ.

  One lease, the tenant's own. Deliberately no link into the system: the tenant
  has no account, so the next step is a phone call to the office and the footer
  carries the number.

  Plain tables and inline styles on purpose: mail clients strip <style> blocks,
  flexbox and CSS variables, so none of the app's stylesheet can be reused here.
  RTL is set on the elements themselves for the same reason. Deliberately not
  sharing the layout with the match alerts — that shell is for internal mail and
  says so in its footer.
--}}
<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>تنبيه قرب انتهاء عقد الإيجار</title>
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

                <tr>
                    <td align="center" style="padding:16px 24px 0;">
                        <div style="background:#fef3c7; color:#92400e; border-radius:10px;
                                    padding:10px 16px; font-size:14px; font-weight:bold;">
                            {{ $expiryPhrase }}
                        </div>
                    </td>
                </tr>

                <tr>
                    <td style="padding:16px 24px 0; font-size:16px; line-height:1.7;">
                        مرحباً {{ $tenant?->full_name }}،
                        <br>
                        @if ($ended)
                            نفيدكم بانتهاء مدة عقد الإيجار التالي:
                        @else
                            نودّ تذكيرك بقرب انتهاء عقد إيجارك التالي:
                        @endif
                    </td>
                </tr>

                {{-- The lease itself. Every row is optional except the dates, so a
                     contract recorded without a unit or an amount still reads. --}}
                <tr>
                    <td style="padding:20px 24px 4px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                               style="border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;
                                      font-size:13px;">
                            <tr>
                                <td style="padding:10px 12px; color:#6b7280; background:#f9fafb; width:40%;">رقم العقد</td>
                                <td style="padding:10px 12px; font-weight:bold;">{{ $contract->contract_number }}</td>
                            </tr>
                            @if ($property)
                                <tr>
                                    <td style="padding:10px 12px; color:#6b7280; background:#f9fafb;">العقار</td>
                                    <td style="padding:10px 12px;">
                                        {{ $property->name }}
                                        @if ($unit)
                                            <span style="color:#9ca3af;">— وحدة {{ $unit->unit_number }}</span>
                                        @endif
                                    </td>
                                </tr>
                            @endif
                            <tr>
                                <td style="padding:10px 12px; color:#6b7280; background:#f9fafb;">تاريخ بداية العقد</td>
                                <td style="padding:10px 12px; direction:ltr; unicode-bidi:embed; text-align:right;">
                                    {{ $contract->start_date?->format('Y-m-d') ?? '—' }}
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:10px 12px; color:#6b7280; background:#f9fafb;">تاريخ انتهاء العقد</td>
                                <td style="padding:10px 12px; font-weight:bold; color:#92400e;
                                           direction:ltr; unicode-bidi:embed; text-align:right;">
                                    {{ $contract->end_date?->format('Y-m-d') ?? '—' }}
                                </td>
                            </tr>
                            @if ($contract->total_amount !== null)
                                <tr>
                                    <td style="padding:10px 12px; color:#6b7280; background:#f9fafb;">قيمة العقد</td>
                                    <td style="padding:10px 12px; direction:ltr; unicode-bidi:embed; text-align:right;">
                                        {{ number_format((float) $contract->total_amount, 3) }} د.ك
                                    </td>
                                </tr>
                            @endif
                        </table>
                    </td>
                </tr>

                <tr>
                    <td style="padding:16px 24px 0; font-size:14px; line-height:1.9; color:#4b5563;">
                        @if ($ended)
                            للتجديد أو لأي استفسار بخصوص العقد، يُرجى التواصل مع المكتب.
                        @else
                            للتجديد أو لأي استفسار بخصوص العقد، يُرجى التواصل مع المكتب قبل تاريخ الانتهاء.
                        @endif
                    </td>
                </tr>

                <tr>
                    <td align="center"
                        style="padding:24px; border-top:1px solid #e5e7eb; margin-top:16px;
                               font-size:12px; color:#6b7280; line-height:1.8;">
                        {{ $officeName }}
                        @if ($officePhone)
                            <br>
                            <span style="direction:ltr; unicode-bidi:embed;">{{ $officePhone }}</span>
                        @endif
                        @if ($officeEmail)
                            <br>
                            <span style="direction:ltr; unicode-bidi:embed;">{{ $officeEmail }}</span>
                        @endif
                        <br>
                        إذا وصلتك هذه الرسالة بالخطأ، يُرجى تجاهلها.
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
