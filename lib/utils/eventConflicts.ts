/**
 * Event Conflict Detection Utility
 * 
 * Detects time conflicts between events to prevent users from
 * selecting overlapping events during registration.
 */

export interface EventWithTiming {
    id: string;
    name: string;
    date?: string; // YYYY-MM-DD
    day?: number; // 1, 2, or 3
    startTime?: string; // "10:30 AM"
    endTime?: string; // "2:00 PM"
    venue?: string;
}

/**
 * Parse time string (e.g., "10:30 AM") to minutes since midnight
 * @returns Minutes since midnight, or null if parsing fails
 */
export function parseTime(timeStr: string | undefined | null): number | null {
    if (!timeStr) return null;

    const match = timeStr.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return null;

    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const period = match[3].toUpperCase();

    let h = hours;

    // Convert to 24-hour format
    if (period === 'PM' && h !== 12) {
        h += 12;
    } else if (period === 'AM' && h === 12) {
        h = 0;
    }

    return h * 60 + minutes;
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
    const s1 = parseTime(start1);
    const s2 = parseTime(start2);

    // If either start time is missing, can't determine conflict
    if (s1 === null || s2 === null) {
        return false;
    }

    // Parse end times, default to end of day (23:59 = 1439 minutes) if missing
    const e1 = parseTime(end1) ?? (24 * 60 - 1); // 1439 minutes (11:59 PM)
    const e2 = parseTime(end2) ?? (24 * 60 - 1);

    // Check overlap: (start1 < end2) AND (start2 < end1)
    return s1 < e2 && s2 < e1;
}

/**
 * Check if two events conflict (same day + overlapping times)
 */
export function doEventsConflict(
    event1: EventWithTiming,
    event2: EventWithTiming
): boolean {
    // Different days = no conflict
    // If date is missing, we check if they might conflict.
    if (event1.date && event2.date && event1.date !== event2.date) {
        return false;
    }

    // Same day, check time overlap
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
