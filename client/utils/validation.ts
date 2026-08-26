// Israeli local format: 9-10 digits starting with 0 (ignore spaces/dashes).
export function isValidIsraeliPhone(phone: string): boolean {
  return /^0\d{8,9}$/.test(phone.replace(/\D/g, ''));
}
