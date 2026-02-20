import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format an Indian phone number for display. Returns "—" for falsy values. */
export function formatPhone(phone?: string | null): string {
  if (!phone) return '—';

  const cleaned = phone.replace(/\D/g, '');

  // 10-digit Indian mobile: 98765 43210
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }

  // 12-digit with country code: 91 98765 43210
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }

  // 13-digit with leading +91 already parsed as digits won't happen but handle gracefully
  return phone;
}
