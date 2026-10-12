/**
 * The in-game calendar: turning what the model says about a session's events
 * into numbered days.
 *
 * In-game days often span several real sessions, and a model asked to number
 * days drifts. So the model only says, for each event, whether it begins a new
 * day, and the numbering is done here from where the previous session left off.
 */
function dayNumber(key) {
    const match = /(\d+)/.exec(key ?? '');
    return match ? Number.parseInt(match[1], 10) : 0;
}
/** From a stored calendar, the number of its last day and that day's entries. */
export function calendarState(calendar) {
    const lastDay = calendar.reduce((highest, day) => Math.max(highest, dayNumber(day.key)), 0);
    let tail = [];
    for (const day of calendar) {
        if (dayNumber(day.key) === lastDay)
            tail = day.entries ?? [];
    }
    return { lastDay, tail };
}
const dayKey = (day) => `day_${String(day).padStart(3, '0')}`;
/**
 * Numbers a session's events into days, continuing from `previousLastDay`.
 *
 * Events carry on the day already open unless one is marked as starting a new
 * day. The very first event of a campaign opens day one whether marked or not.
 */
export function eventsToDayObjects(events, previousLastDay) {
    let current = previousLastDay;
    let started = previousLastDay > 0;
    const order = [];
    const entriesByDay = new Map();
    for (const event of events) {
        if (event.starts_new_day || !started) {
            current += 1;
            started = true;
        }
        if (!entriesByDay.has(current)) {
            entriesByDay.set(current, []);
            order.push(current);
        }
        entriesByDay.get(current).push(event.text ?? '');
    }
    if (order.length === 0)
        return [];
    const lastDay = Math.max(...order);
    const calendar = [];
    // If this session moved past the day that was open without adding to it, that day is closed out.
    if (previousLastDay && !entriesByDay.has(previousLastDay) && Math.min(...order) > previousLastDay) {
        calendar.push({ key: dayKey(previousLastDay), action: 'update', entries: [], day_complete: true });
    }
    for (const day of order) {
        calendar.push({
            key: dayKey(day),
            action: day <= previousLastDay ? 'update' : 'new',
            entries: entriesByDay.get(day),
            day_complete: day < lastDay,
        });
    }
    return calendar;
}
