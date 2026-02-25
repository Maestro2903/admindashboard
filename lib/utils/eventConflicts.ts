/**
 * Event Conflict Detection Utility
 * 
 * Detects time conflicts between events to prevent users from
 * selecting overlapping events during registration.
 */

export interface EventWithTiming {
    id: string;
    name: string;
    date?: string;
    /** Multi-day events: list of dates; used for conflict (same date + time overlap) */
    dates?: string[];
    day?: number;
    startTime?: string;
    endTime?: string;
    venue?: string;
}

/** Get all dates an event occurs on (dates array or single date) */
export function getEventDates(e: EventWithTiming): string[] {
    if (e.dates?.length) return e.dates;
    if (e.date) return [e.date];
    return [];
}

/** True if two events share at least one date */
function shareADate(e1: EventWithTiming, e2: EventWithTiming): boolean {
    const d1 = new Set(getEventDates(e1));
    const d2 = getEventDates(e2);
    return d2.some((d) => d1.has(d));
}

/**
 * Parse time string to minutes since midnight.
 * Supports: "10:30", "10.30", "10:30 AM", "10:30 PM"
 * @returns Minutes since midnight, or null if parsing fails
 */
export function toMinutes(timeStr: string | undefined | null): number | null {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const trimmed = timeStr.trim();
    if (!trimmed) return null;

    // Normalize "10.30" -> "10:30"
    const normalized = trimmed.replace(/\./g, ':');

    // 24h: "10:30" or "09:00"
    const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
        const hours = parseInt(match24[1], 10);
        const minutes = parseInt(match24[2], 10);
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            return hours * 60 + minutes;
        }
        return null;
    }

    // 12h: "10:30 AM" or "2:00 PM"
    const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match12) {
        let hours = parseInt(match12[1], 10);
        const minutes = parseInt(match12[2], 10);
        const period = match12[3].toUpperCase();
        if (minutes < 0 || minutes > 59) return null;
        if (period === 'PM' && hours !== 12) hours += 12;
        else if (period === 'AM' && hours === 12) hours = 0;
        if (hours < 0 || hours > 23) return null;
        return hours * 60 + minutes;
    }

    return null;
}

/** @deprecated Use toMinutes; kept for backward compatibility */
export function parseTime(timeStr: string | undefined | null): number | null {
    return toMinutes(timeStr);
}

/**
 * Check if two time ranges overlap
 * 
 * Special cases:
 * - If either event has no start time, cannot determine conflict (returns false)
 * - If an event has no end time, it's treated as running until end of day
 * - Events are considered overlapping if: (start1 < end2) AND (start2 < end1)
 */
export function doTimesOverlap(
    start1: string | undefined | null,
    end1: string | undefined | null,
    start2: string | undefined | null,
    end2: string | undefined | null
): boolean {
    const s1 = toMinutes(start1);
    const s2 = toMinutes(start2);

    // If either start time is missing, can't determine conflict
    if (s1 === null || s2 === null) {
        return false;
    }

    // Parse end times, default to end of day (23:59 = 1439 minutes) if missing
    const e1 = toMinutes(end1) ?? (24 * 60 - 1);
    const e2 = toMinutes(end2) ?? (24 * 60 - 1);

    // Overlap: A.start < B.end AND A.end > B.start
    return s1 < e2 && s2 < e1;
}

/**
 * Check if two events conflict (share at least one date + overlapping times)
 */
export function doEventsConflict(
    event1: EventWithTiming,
    event2: EventWithTiming
): boolean {
    if (event1.id === event2.id) return false;
    if (!shareADate(event1, event2)) return false;
    return doTimesOverlap(
        event1.startTime,
        event1.endTime,
        event2.startTime,
        event2.endTime
    );
}

/**
 * Get all event IDs that conflict with the selected event
 */
export function getConflictingEventIds(
    selectedEvent: EventWithTiming,
    allEvents: EventWithTiming[]
): string[] {
    return allEvents
        .filter(event =>
            event.id !== selectedEvent.id &&
            doEventsConflict(selectedEvent, event)
        )
        .map(event => event.id);
}

/**
 * Get all conflicts for multiple selected events
 * Returns a Set of event IDs that conflict with any selected event
 */
export function getAllConflicts(
    selectedEvents: EventWithTiming[],
    availableEvents: EventWithTiming[]
): Set<string> {
    const conflicts = new Set<string>();

    for (const selectedEvent of selectedEvents) {
        const conflictingIds = getConflictingEventIds(selectedEvent, availableEvents);
        conflictingIds.forEach(id => conflicts.add(id));
    }

    return conflicts;
}

/**
 * Check if selecting a new event would create conflicts
 * Returns array of conflicting event names
 */
export function getConflictWarnings(
    eventToSelect: EventWithTiming,
    currentlySelectedEvents: EventWithTiming[]
): string[] {
    return currentlySelectedEvents
        .filter(selected => doEventsConflict(eventToSelect, selected))
        .map(event => event.name);
}
