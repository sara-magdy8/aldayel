@php
    // One place decides the wording and colour of every outcome, so a new state
    // cannot end up half-styled.
    $states = [
        'paid'         => ['icon' => '✓', 'tone' => 'ok',   'title' => 'تم الدفع بنجاح',        'body' => 'شكرًا لك، تم استلام مبلغ الدفعة وتسجيلها.'],
        'already_paid' => ['icon' => '✓', 'tone' => 'ok',   'title' => 'تم دفع هذه الفاتورة',    'body' => 'سبق سداد هذا المبلغ، ولا حاجة لأي إجراء آخر.'],
        'failed'       => ['icon' => '✕', 'tone' => 'bad',  'title' => 'لم تكتمل عملية الدفع',   'body' => 'لم يتم خصم أي مبلغ. يمكنك المحاولة مرة أخرى من نفس الرابط.'],
        'expired'      => ['icon' => '⏳', 'tone' => 'warn', 'title' => 'انتهت صلاحية الرابط',    'body' => 'انتهت المدة المحددة لهذا الرابط. يرجى التواصل مع المكتب لإصدار رابط جديد.'],
        'invalid'      => ['icon' => '⚠', 'tone' => 'warn', 'title' => 'الرابط غير صالح',        'body' => 'هذا الرابط غير موجود أو تم إلغاؤه.'],
        'error'        => ['icon' => '⚠', 'tone' => 'bad',  'title' => 'تعذّر إتمام الدفع',      'body' => 'حدث خلل مؤقت في بوابة الدفع. يرجى المحاولة لاحقًا أو التواصل مع المكتب.'],
    ];

    $view = $states[$state] ?? $states['error'];
@endphp

@extends('payment.layout')

@section('title', $view['title'])

@section('content')
    <div class="badge {{ $view['tone'] }}">{{ $view['icon'] }}</div>
    <h1>{{ $view['title'] }}</h1>
    <p>{{ $view['body'] }}</p>

    {{-- Only shown once a real collection was matched; the invalid-link page has none. --}}
    @if ($collection)
        <div class="details">
            <div class="row">
                <span>رقم التحصيل</span>
                <span>{{ $collection->collection_number }}</span>
            </div>
            <div class="row">
                <span>المبلغ</span>
                <span>{{ number_format((float) $collection->amount, 3) }} د.ك</span>
            </div>
            @if ($collection->payment_reference)
                <div class="row">
                    <span>رقم العملية</span>
                    <span>{{ $collection->payment_reference }}</span>
                </div>
            @endif
        </div>
    @endif
@endsection
