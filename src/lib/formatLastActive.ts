/**
 * Formats a `last_active_at` timestamp into a human-readable "Active …" string.
 */
export function formatLastActive(dateStr: string | null | undefined, isRTL: boolean): string | null {
  if (!dateStr) return null;

  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (isRTL) {
    if (mins < 60)  return 'פעיל/ה עכשיו';
    if (hours < 24)  return 'פעיל/ה היום';
    if (hours < 48)  return 'פעיל/ה אתמול';
    if (days < 7)    return `פעיל/ה לפני ${days} ימים`;
    if (days < 14)   return 'פעיל/ה לפני שבוע';
    if (days < 30)   return `פעיל/ה לפני ${Math.floor(days / 7)} שבועות`;
    if (days < 60)   return 'פעיל/ה לפני חודש';
    return `פעיל/ה לפני ${Math.floor(days / 30)} חודשים`;
  }

  if (mins < 60)  return 'Active now';
  if (hours < 24)  return 'Active today';
  if (hours < 48)  return 'Active yesterday';
  if (days < 7)    return `Active ${days}d ago`;
  if (days < 14)   return 'Active 1w ago';
  if (days < 30)   return `Active ${Math.floor(days / 7)}w ago`;
  if (days < 60)   return 'Active 1mo ago';
  return `Active ${Math.floor(days / 30)}mo ago`;
}
