import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { money } from '../../../../core/format';
import { MARKETS } from '../../../../core/labels';
import type { Exposure } from '../../../../models';

/**
 * Outstanding liability per market, one card per market, with a row per claim type and currency.
 *
 * Currencies are never summed: a market with SGD and USD claims shows two rows, because the backend does no FX.
 */
@Component({
  selector: 'app-exposure-cards',
  imports: [MatCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exposure-cards.html',
  styleUrl: './exposure-cards.scss',
})
export class ExposureCards {
  readonly exposures = input.required<Exposure[]>();
  protected readonly money = money;

  protected readonly byMarket = computed(() =>
    MARKETS.map((m) => ({
      ...m,
      rows: this.exposures().filter((e) => e.market === m.code && (e.openClaims > 0 || e.outstandingAmount !== 0)),
    })),
  );
}
