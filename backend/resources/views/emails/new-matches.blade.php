{{--
  مطابقات جديدة — the digest sent by `matches:alert-admins` (NewMatchesMail).

  One block per request that gained matches since the last run: the client and
  their criteria, then only the properties the ledger had not already announced.
  Read top to bottom it is a call list — client, what to offer them, their number.
--}}
@extends('emails.layouts.match-alert')
@use('App\Support\MailFormat', 'Fmt')

@section('content')
    @foreach ($groups as $group)
        @php($request = $group['request'])
        @php($properties = $group['properties'])

        {{-- ── الطلب ─────────────────────────────────────────── --}}
        <tr>
            <td style="padding:24px 24px 8px;">
                <div style="font-size:15px; font-weight:bold;">
                    {{ Fmt::text($request->client?->full_name) }}
                    <span style="font-size:12px; font-weight:normal; color:#6b7280;">
                        — طلب {{ $request->request_type }}
                    </span>
                </div>
                @if ($request->client?->phone)
                    <div style="font-size:12px; color:#9ca3af; padding-top:2px; {{ Fmt::LTR }}">
                        {{ $request->client->phone }}
                    </div>
                @endif
                {{-- The criteria, so the admin can judge the fit without opening
                     the system. Only what the request actually stated. --}}
                <div style="font-size:12px; color:#6b7280; padding-top:6px; line-height:1.9;">
                    {{ Fmt::text($request->category) }}
                    @if ($request->activity) · {{ $request->activity }} @endif
                    @if ($request->governorate) · {{ $request->governorate }}{{ $request->area_name ? ' - ' . $request->area_name : '' }} @endif
                    @if ($request->area !== null) · {{ Fmt::size($request->area) }} @endif
                    @if ($request->price !== null) · {{ Fmt::money($request->price) }} @endif
                </div>
            </td>
        </tr>

        {{-- ── العقارات الجديدة المطابقة ─────────────────────── --}}
        <tr>
            <td style="padding:0 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                       style="border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
                    <tr>
                        <td style="{{ Fmt::HEAD }}">العقار</td>
                        <td style="{{ Fmt::HEAD }}">الموقع</td>
                        <td style="{{ Fmt::HEAD }}">المساحة</td>
                        <td style="{{ Fmt::HEAD }}">السعر</td>
                    </tr>
                    @foreach ($properties->take(\App\Mail\NewMatchesMail::MAX_PER_GROUP) as $property)
                        <tr>
                            <td style="{{ Fmt::CELL }}">
                                {{ Fmt::text($property->name) }}
                                @if ($property->property_code)
                                    <br>
                                    <span style="font-size:11px; color:#9ca3af;">{{ $property->property_code }}</span>
                                @endif
                            </td>
                            <td style="{{ Fmt::CELL }}">{{ Fmt::text($property->address) }}</td>
                            <td style="{{ Fmt::CELL }}">{{ Fmt::size($property->area) }}</td>
                            <td style="{{ Fmt::CELL }}">{{ Fmt::propertyPrice($property) }}</td>
                        </tr>
                    @endforeach
                </table>

                @if ($properties->count() > \App\Mail\NewMatchesMail::MAX_PER_GROUP)
                    {{-- Phrased as a labelled count rather than "و N عقاراً آخر":
                         the adjective would have to agree with the number too, and
                         a colon reads correctly for every N. --}}
                    <div style="padding:8px 2px 0; font-size:12px; color:#6b7280;">
                        عقارات أخرى مطابقة لهذا الطلب: {{ $properties->count() - \App\Mail\NewMatchesMail::MAX_PER_GROUP }}
                    </div>
                @endif
            </td>
        </tr>
    @endforeach

    @if ($extraGroups > 0)
        <tr>
            <td style="padding:20px 24px 0; font-size:12px; color:#6b7280;">
                طلبات أخرى لها مطابقات جديدة: {{ $extraGroups }} — افتح النظام لعرض القائمة كاملة.
            </td>
        </tr>
    @endif
@endsection
