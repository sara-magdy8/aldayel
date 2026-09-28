import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { notificationsService } from '@/services/notifications';

/** How often the badge re-checks on its own, in ms. */
const POLL_INTERVAL = 60_000;

interface NotificationsContextValue {
  /** Unread notifications across the whole feed, for the sidebar badge. */
  unread: number;
  /** Re-read the count from the backend (after marking rows read elsewhere). */
  refresh: () => void;
  /** Publish a count the caller already has, without another round-trip. */
  setUnread: (count: number) => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  unread: 0,
  refresh: () => {},
  setUnread: () => {},
});

export const useNotifications = () => useContext(NotificationsContext);

/**
 * Keeps the sidebar's unread badge in step with the feed.
 *
 * The three alert commands run on a schedule and know nothing about the browser,
 * so notifications appear without anything in the app having asked for them —
 * hence the poll. It is one COUNT over the union, so a minute is frequent enough
 * to feel live and cheap enough to leave running all day.
 *
 * `setUnread` exists so the feed page, which is already told the fresh total by
 * every mark-read call, can hand it straight over instead of triggering a second
 * request for a number it is holding.
 */
export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    notificationsService
      .unreadCount()
      .then(({ unread_count }) => setUnread(unread_count))
      // The badge is decoration; a failed poll leaves the last known count
      // rather than blanking it or bothering the user with a toast.
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [refresh]);

  const value = useMemo<NotificationsContextValue>(
    () => ({ unread, refresh, setUnread }),
    [unread, refresh],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};
