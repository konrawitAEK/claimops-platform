import type { Currency } from '../models';

const formatters = new Map<Currency, Intl.NumberFormat>();

/** "SGD 5,000.00"; JPY has no minor unit, so it shows no decimals. */
export function money(amount: number | null | undefined, currency: Currency): string {
  if (amount === null || amount === undefined) return '—';
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' });
    formatters.set(currency, f);
  }
  return f.format(amount);
}

export function dateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
