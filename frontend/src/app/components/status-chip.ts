import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_LABELS } from '../core/labels';
import type { ClaimStatus } from '../models';

/** Small coloured pill for a claim status. */
@Component({
  selector: 'app-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [class]="'s-' + status()">{{ label() }}</span>`,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      height: 24px;
      padding: 0 10px;
      border-radius: 12px;
      font: var(--mat-sys-label-medium);
      white-space: nowrap;
      color: #fff;
    }
    .s-SUBMITTED {
      background: var(--co-info);
    }
    .s-IN_REVIEW {
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }
    .s-INFO_REQUESTED {
      background: var(--co-warning);
    }
    .s-SETTLED {
      background: var(--co-success);
    }
    .s-REJECTED {
      background: var(--co-error);
    }
  `,
})
export class StatusChip {
  readonly status = input.required<ClaimStatus>();
  protected readonly label = computed(() => STATUS_LABELS[this.status()]);
}
