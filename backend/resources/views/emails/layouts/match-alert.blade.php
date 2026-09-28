{{--
  The shell shared by both match alerts — عقارات مطابقة لطلب (request → properties)
  and طلبات مطابقة لعقار (property → requests). The two carry mirrored content, so
  only the middle differs; header, banner, call-to-action and footer live here and
  cannot drift apart.

  Plain tables and inline styles on purpose: mail clients strip <style> blocks,
  flexbox and CSS variables, so none of the app's stylesheet can be reused here.
  RTL is set on the elements themselves for the same reason.

  Expects: $title, $officeName, $officeLogo, $bannerText, $ctaLabel, $ctaUrl,
  and a `content` section holding the summary and the match table.
--}}
<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }}</title>
</head>
<body style="margin:0; padding:0; background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#f3f4f6; padding:24px 12px;" dir="rtl">
    <tr>
        <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="max-width:640px; background:#ffffff; border-radius:16px; overflow:hidden;
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
                        <div style="background:#dcfce7; color:#166534; border-radius:10px;
                                    padding:10px 16px; font-size:14px; font-weight:bold;">
                            {{ $bannerText }}
                        </div>
                    </td>
                </tr>

                @yield('content')

                <tr>
                    <td align="center" style="padding:24px;">
                        <a href="{{ $ctaUrl }}"
                           style="display:inline-block; background:#16a34a; color:#ffffff; text-decoration:none;
                                  font-size:15px; font-weight:bold; padding:13px 32px; border-radius:10px;">
                            {{ $ctaLabel }}
                        </a>
                    </td>
                </tr>

                <tr>
                    <td align="center"
                        style="padding:20px 24px; border-top:1px solid #e5e7eb;
                               font-size:12px; color:#6b7280; line-height:1.8;">
                        {{ $officeName }}
                        <br>
                        رسالة داخلية تلقائية — تصل إلى مديري النظام فقط.
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
