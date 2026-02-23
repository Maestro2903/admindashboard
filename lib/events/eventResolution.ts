/**
 * Shared logic for resolving canonical event linkage (eventIds, eventCategory, eventType)
 * from passes, payments, and teams. Used by unified-dashboard, admin/passes, dashboard,
 * payments, and events APIs. Supports legacy fields (selectedEvents, eventId, selectedEvent).
 */

export interface EventInfo {
  id: string;
  name?: string;
  category?: string;
  type?: string;
}

/** Prefer eventIds; if missing, derive from selectedEvents + eventId/selectedEvent (pass legacy). */
export function getEventIdsFromPass(doc: Record<string, unknown>): string[] {
  const eventIds = getStringArray(doc, 'eventIds');
  if (eventIds.length > 0) return eventIds;
  const selected = getStringArray(doc, 'selectedEvents');
  const single = getString(doc, 'eventId') ?? getString(doc, 'selectedEvent');
  if (single && !selected.includes(single)) return [...selected, single];
  return selected;
}

/** Prefer eventIds on payment; otherwise returns empty (caller may derive from linked pass). */
export function getEventIdsFromPayment(doc: Record<string, unknown>): string[] {
  return getStringArray(doc, 'eventIds');
}

/** Prefer eventIds on team; otherwise returns empty. */
export function getEventIdsFromTeam(doc: Record<string, unknown>): string[] {
  return getStringArray(doc, 'eventIds');
}

/** Resolve eventCategory and eventType from pass/payment doc or from events map. */
export function resolveEventCategoryType(
  doc: Record<string, unknown>,
  eventIds: string[],
  eventsById: Map<string, EventInfo>
): { eventCategory?: string; eventType?: string } {
  const fromDoc = {
    eventCategory: getString(doc, 'eventCategory'),
    eventType: getString(doc, 'eventType'),
  };
  if (fromDoc.eventCategory && fromDoc.eventType) return fromDoc;
  const firstEvent = eventIds.length > 0 ? eventsById.get(eventIds[0]) : undefined;
  return {
    eventCategory: fromDoc.eventCategory ?? firstEvent?.category,
    eventType: fromDoc.eventType ?? firstEvent?.type,
  };
}

function getString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === 'string' ? v : undefined;
}

function getStringArray(rec: Record<string, unknown>, key: string): string[] {
  const v = rec[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
