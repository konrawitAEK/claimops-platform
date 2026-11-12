import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { money } from '../../core/format';
import { MARKETS } from '../../core/labels';
import type { Exposure } from '../../models';

/**
 * Outstanding liability per market, one card per market, with a row per claim type and currency.
 *
 * Currencies are never summed: a market with SGD and USD claims shows two rows, because the backend does no FX.
 */
@Component({
  selector: 'app-exposure-cards',
  imports: [MatCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cards">
      @for (m of byMarket(); track m.code) {
        <mat-card appearance="outlined" [class.empty]="!m.rows.length">
          <div class="card-pad">
            <div class="spread">
              <span class="market">{{ m.code }}</span>
              <span class="caption">{{ m.name }}</span>
            </div>
            @if (m.rows.length) {
              <table class="data-table small">
                <tbody>
                  @for (r of m.rows; track r.claimType + r.currency) {
                    <tr>
                      <td>{{ r.claimType }}</td>
                      <td class="right">{{ r.openClaims }} open</td>
                      <td class="right num strong">{{ money(r.outstandingAmount, r.currency) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <div class="caption none">No open exposure</div>
            }
          </div>
        </mat-card>
      }
    </div>
  `,
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
