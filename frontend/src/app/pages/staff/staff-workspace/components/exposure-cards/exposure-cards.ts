import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MARKETS } from '../../../../../core/labels';
import type { ClaimType, Currency, Exposure, Market } from '../../../../../models';
import { money } from '../../../../../utils/format.util';

interface Totals {
  openClaims: number;
  outstanding: number;
  settled: number;
}

interface CurrencyBlock extends Totals {
  currency: Currency;
  /** Per claim type, only types with any activity. */
  byType: (Totals & { claimType: ClaimType })[];
}

interface MarketCard {
  code: Market;
  name: string;
  /** Always the local currency first, then USD, even when empty, so both are visible at a glance. */
  currencies: CurrencyBlock[];
}

const TYPES: ClaimType[] = ['MOTOR', 'PROPERTY'];

function totals(rows: Exposure[]): Totals {
  return rows.reduce(
    (t, r) => ({
      openClaims: t.openClaims + r.openClaims,
      outstanding: t.outstanding + r.outstandingAmount,
      settled: t.settled + r.settledAmount,
    }),
    { openClaims: 0, outstanding: 0, settled: 0 },
  );
}

function block(rows: Exposure[], currency: Currency): CurrencyBlock {
  const inCurrency = rows.filter((r) => r.currency === currency);
  return {
    currency,
    ...totals(inCurrency),
    byType: TYPES.map((claimType) => ({ claimType, ...totals(inCurrency.filter((r) => r.claimType === claimType)) }))
      .filter((t) => t.openClaims > 0 || t.outstanding !== 0 || t.settled !== 0),
  };
}

/**
 * Liability per market: outstanding (open claims) and settled (paid out), in the local currency and in USD.
 *
 * Amounts are only ever added within one currency. USD can therefore also be totalled across all markets (the first
 * card), while local currencies stay per market because the backend does no FX conversion.
 */
@Component({
  selector: 'app-exposure-cards',
  imports: [MatCardModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exposure-cards.html',
  styleUrl: './exposure-cards.scss',
})
export class ExposureCards {
  readonly exposures = input.required<Exposure[]>();
  protected readonly money = money;

  /** USD across every market: one currency, so a true APAC total. */
  protected readonly usdTotal = computed(() => block(this.exposures(), 'USD'));

  protected readonly byMarket = computed<MarketCard[]>(() =>
    MARKETS.map((m) => {
      const rows = this.exposures().filter((e) => e.market === m.code);
      return { code: m.code, name: m.name, currencies: [block(rows, m.currency), block(rows, 'USD')] };
    }),
  );
}
