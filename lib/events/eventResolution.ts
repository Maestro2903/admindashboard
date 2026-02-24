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

export interface AdminEventDisplayInput {
  pass: Record<string, unknown>;
  payment: Record<string, unknown> | null;
  team?: Record<string, unknown> | null;
}

export interface AdminEventDisplay {
  eventCategory: string;
  eventDisplay: string | null;
  dayDisplay: string | null;
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

/**
 * Admin-only resolver for how passes should be displayed in tables.
 *
 * Columns:
 * - TYPE  → always from payment.passType (frontend already maps to labels)
 * - EVENT → varies by passType (see below)
 * - DAY   → derived from selectedDays (date or range)
 *
 * This resolver is deterministic and only uses:
 * - payments.passType
 * - payments.selectedDays
 * - payments.selectedEvents
 * - passes.passType
 * - teams.teamName
 * - passes.teamSnapshot
 */
export function resolveAdminEventDisplay(input: AdminEventDisplayInput): AdminEventDisplay {
  const { pass, payment, team } = input;

  const passTypeRaw =
    getString(payment ?? {}, 'passType') ??
    getString(pass, 'passType') ??
    '';
  const passType = passTypeRaw as string;

  // Helper to normalise day from selectedDays arrays or single fields.
  const toIso = (value: unknown): string | null => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    const maybe = value as { toDate?: () => Date };
    if (typeof maybe?.toDate === 'function') {
      const d = maybe.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    }
    return null;
  };

  // Extract selectedDays from payment (primary) or pass; format to
  // "27 Feb 2026" or "26–28 Feb 2026".
  const formatDayLabel = (): string | null => {
    const days =
      (payment?.selectedDays as string[] | undefined) ??
      (pass.selectedDays as string[] | undefined);
    if (!Array.isArray(days) || days.length === 0) return null;

    const sorted = [...days].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const toDate = (d: string): Date | null => {
      const iso = toIso(d);
      if (!iso) return null;
      const parsed = new Date(iso);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const firstDate = toDate(first);
    const lastDate = toDate(last);
    if (!firstDate || !lastDate) return null;

    const fmt = new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });

    if (sorted.length === 1) {
      return fmt.format(firstDate);
    }

    const sameMonth =
      firstDate.getUTCFullYear() === lastDate.getUTCFullYear() &&
      firstDate.getUTCMonth() === lastDate.getUTCMonth();

    const startDay = firstDate.getUTCDate().toString().padStart(2, '0');
    const endDay = lastDate.getUTCDate().toString().padStart(2, '0');
    const monthYear = fmt.format(firstDate).split(' ').slice(1).join(' ');

    if (sameMonth) {
      return `${startDay}–${endDay} ${monthYear}`;
    }
    // Different month/year: fall back to "26 Feb 2026 – 01 Mar 2026"
    const fmtFull = (d: Date) =>
      new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }).format(d);
    return `${fmtFull(firstDate)} – ${fmtFull(lastDate)}`;
  };

  // Helper to convert an event slug like "solo-singing" into "Solo Singing".
  const formatSlugLabel = (slug: string | undefined): string | null => {
    if (!slug) return null;
    return slug
      .replace(/[-_]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const dayDisplay = formatDayLabel();

  // Day Pass
  if (passType === 'day_pass') {
    const selectedEvents =
      (payment?.selectedEvents as string[] | undefined) ??
      (pass.selectedEvents as string[] | undefined) ??
      [];
    const firstSlug = Array.isArray(selectedEvents) && selectedEvents.length > 0 ? selectedEvents[0] : undefined;

    return {
      eventCategory: 'Day Pass',
      // Show primary event/competition (e.g. "Solo Singing").
      eventDisplay: formatSlugLabel(firstSlug),
      dayDisplay,
    };
  }

  // Group Events
  if (passType === 'group_events') {
    // For group events, the Event column should reflect the actual
    // event(s) the team registered for, not just the team name.
    const selectedEvents =
      (payment?.selectedEvents as string[] | undefined) ??
      (pass.selectedEvents as string[] | undefined) ??
      [];

    const labels =
      Array.isArray(selectedEvents) && selectedEvents.length > 0
        ? selectedEvents.map((slug) => formatSlugLabel(slug) ?? slug)
        : [];

    const eventDisplay =
      labels.length > 0 ? labels.join(', ') : 'Group Event';

    return {
      eventCategory: 'Group Events',
      eventDisplay,
      dayDisplay,
    };
  }

  // Proshow
  if (passType === 'proshow') {
    return {
      eventCategory: 'Proshow',
      eventDisplay: 'Proshow',
      dayDisplay,
    };
  }

  // Sana Concert
  if (passType === 'sana_concert') {
    const selectedEvents = (payment?.selectedEvents as string[] | undefined) ?? [];
    const extraCount = Array.isArray(selectedEvents) ? selectedEvents.length : 0;
    const base = 'Sana Concert';
    const eventDisplay =
      extraCount > 1 ? `${base} + ${extraCount} Events` : base;

    return {
      eventCategory: 'Sana Concert',
      eventDisplay,
      dayDisplay,
    };
  }

  // Fallback for unknown / legacy types
  return {
    eventCategory: passType || 'Other',
    eventDisplay: passType || 'Other',
    dayDisplay: null,
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
