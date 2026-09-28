import { ClientType } from '@/types';

/**
 * نوع العميل — the canonical option list, shared by the client forms and the
 * list filter so they can never drift apart. Values are what the API stores.
 */
export const CLIENT_TYPES: ClientType[] = ['فرد', 'شركة', 'وسيط', 'مسؤول العقار'];
