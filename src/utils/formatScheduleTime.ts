/**
 * Format scheduled interview times for emails / server logs.
 * Railway runs in UTC — never use bare toLocaleString() (shows UTC, not the recruiter's clock).
 */
const DEFAULT_DISPLAY_TZ = process.env.SCHEDULE_DISPLAY_TZ?.trim() || 'Asia/Karachi';

export function resolveScheduleTimeZone(timeZone?: string | null): string {
  const tz = timeZone?.trim();
  if (!tz) return DEFAULT_DISPLAY_TZ;
  try {
    // Throws RangeError for invalid IANA zones
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_DISPLAY_TZ;
  }
}

export function formatScheduledAtForDisplay(
  scheduledAt: string | Date,
  timeZone?: string | null
): string {
  const date = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return String(scheduledAt);
  const tz = resolveScheduleTimeZone(timeZone);
  try {
    return new Intl.DateTimeFormat('en-PK', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
