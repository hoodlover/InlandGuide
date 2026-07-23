// Hover text shared by every piece of Inland Delivery Team artwork in the app.
export const IDT_TITLE = 'Hapag-Lloyd IDT';

// ISO timestamp -> "Jul 12, 2026, 3:04 PM" — the stamp under both rail tools.
export function formatStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
