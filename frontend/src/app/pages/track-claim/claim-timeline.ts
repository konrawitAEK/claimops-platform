import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { dateTime, money } from '../../core/format';
import type { ClaimDetail } from '../../models';

interface TimelineEntry {
  at: string | null;
  title: string;
  text?: string;
  tone: 'info' | 'warning' | 'success' | 'error' | 'muted';
}

/**
 * Claim activity, oldest first, built from the claim itself (submission, information requests and answers, decision).
 *
 * Built on the client from the claim detail rather than from the staff audit trail, so claimants never see internal
 * events or officer names beyond the assigned handler.
 */
@Component({
  selector: 'app-claim-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="timeline">
      @for (entry of entries(); track $index) {
        <li [class]="'t-' + entry.tone">
          <div class="title">{{ entry.title }}</div>
          @if (entry.at) {
            <div class="caption">{{ when(entry.at) }}</div>
          }
          @if (entry.text) {
            <div class="body2 text">{{ entry.text }}</div>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    .timeline {
      list-style: none;
      margin: 0;
      padding: 0 0 0 20px;
      border-left: 2px solid var(--mat-sys-outline-variant);
    }
    li {
      position: relative;
      padding: 0 0 18px 12px;
      --c: var(--co-info);
    }
    li::before {
      content: '';
      position: absolute;
      left: -27px;
      top: 4px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--c);
    }
    .t-warning {
      --c: var(--co-warning);
    }
    .t-success {
      --c: var(--co-success);
    }
    .t-error {
      --c: var(--co-error);
    }
    .t-muted {
      --c: var(--co-muted);
    }
    .title {
      font: var(--mat-sys-title-small);
    }
    .text {
      white-space: pre-wrap;
      margin-top: 4px;
    }
  `,
})
export class ClaimTimeline {
  readonly claim = input.required<ClaimDetail>();
  protected readonly when = dateTime;

  protected readonly entries = computed<TimelineEntry[]>(() => {
    const c = this.claim();
    const list: TimelineEntry[] = [
      { at: c.submittedAt, title: 'Claim submitted', text: c.incidentDescription, tone: 'info' },
    ];
    if (c.assignedHandler) {
      list.push({ at: null, title: `Under review by ${c.assignedHandler}`, tone: 'muted' });
    }
    for (const r of c.infoRequests) {
      list.push({ at: r.requestedAt, title: 'More information requested', text: r.question, tone: 'warning' });
      if (r.answeredAt) list.push({ at: r.answeredAt, title: 'You replied', text: r.answer ?? '', tone: 'info' });
    }
    if (c.status === 'SETTLED') {
      list.push({
        at: c.decidedAt,
        title: `Settled for ${money(c.settledAmount, c.currency)}`,
        text: c.decisionNote ?? undefined,
        tone: 'success',
      });
    } else if (c.status === 'REJECTED') {
      list.push({ at: c.decidedAt, title: 'Claim rejected', text: c.decisionNote ?? undefined, tone: 'error' });
    }
    return list;
  });
}
