<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\NotificationFeed;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The التنبيهات screen: the mail the system has sent, and whether it arrived
 * since this user last looked.
 *
 * Read-only over the alert ledgers themselves — nothing here can send, unsend or
 * edit a notification, because the scheduled commands own that entirely (see
 * NotificationFeed). The only thing this controller writes is one timestamp on
 * the user opening the page, and only ever for the user making the request.
 *
 * Open to every authenticated user rather than admins alone: the feed is the
 * office's operational picture of what its clients were told, which is the same
 * standing as the contracts and collections screens a staff user already has.
 */
class NotificationController extends Controller
{
    public function __construct(private readonly NotificationFeed $feed)
    {
    }

    /** GET /api/notifications — one page of the feed, plus the badge count. */
    public function index(Request $request)
    {
        $filters = $request->validate([
            'types'     => 'sometimes|array',
            'types.*'   => ['string', Rule::in(NotificationFeed::TYPES)],
            'status'    => ['sometimes', Rule::in(NotificationFeed::STATUSES)],
            'search'    => 'sometimes|nullable|string|max:255',
            'date_from' => 'sometimes|nullable|date',
            'date_to'   => 'sometimes|nullable|date|after_or_equal:date_from',
        ]);

        // Page size comes from the table's "عرض N سجل" dropdown; capped so a bad
        // `per_page` can't pull the whole feed, as on the other list endpoints.
        $perPage = is_numeric($request->per_page) ? min(max((int) $request->per_page, 1), 500) : 20;

        $user = $request->user();

        return response()->json(
            $this->feed->paginate($user, $filters, $perPage)->toArray()
            + [
                // Counted alongside the page rather than left to a second
                // round-trip: the badge and the list are read from the same
                // union, so shipping them together is what stops them
                // disagreeing on screen.
                'unread_count' => $this->feed->unreadCount($user),
                // The watermark these rows were judged against, so the screen can
                // keep highlighting what was new on arrival even after the visit
                // has moved the watermark past them. Null the first time.
                'read_before'  => $user->notifications_read_at?->toIso8601String(),
            ]
        );
    }

    /** GET /api/notifications/unread-count — just the badge, for polling. */
    public function unreadCount(Request $request)
    {
        return response()->json(['unread_count' => $this->feed->unreadCount($request->user())]);
    }

    /**
     * POST /api/notifications/seen — record that this user has opened the feed.
     *
     * Called by the page itself on open, not by a button: read state here is
     * "have you looked since this arrived", so looking is the whole of it. One
     * timestamp, so a feed carrying years of history is marked off in a single
     * statement no matter how large it has grown.
     */
    public function markSeen(Request $request)
    {
        $request->user()->forceFill(['notifications_read_at' => now()])->save();

        return response()->json([
            'unread_count' => 0,
            'message'      => 'تم تعليم التنبيهات كمقروءة.',
        ]);
    }
}
