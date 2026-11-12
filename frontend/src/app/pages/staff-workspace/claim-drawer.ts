import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, type MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { forkJoin } from 'rxjs';
import { Alert } from '../../components/alert';
import { StatusChip } from '../../components/status-chip';
import { errorText } from '../../core/api';
import { dateTime, money } from '../../core/format';
import { STATUS_LABELS } from '../../core/labels';
import type { AuditEntry, ClaimDetail, ClaimStatus } from '../../models';
import { StaffService } from '../../services/staff.service';

export interface ClaimDrawerData {
  claimId: string;
}

/** Opens the drawer for one claim, as a full-height panel on the right. */
export function openClaimDrawer(dialog: MatDialog, claimId: string): MatDialogRef<ClaimDrawer> {
  return dialog.open<ClaimDrawer, ClaimDrawerData>(ClaimDrawer, {
    data: { claimId },
    position: { right: '0', top: '0' },
    height: '100vh',
    width: 'min(520px, 100vw)',
    maxWidth: '100vw',
    panelClass: 'side-drawer',
    autoFocus: false,
  });
}

/**
 * Side drawer with everything about one claim: facts, incident details, the information-request thread, the
 * decision and the audit trail.
 *
 * Opened as a MatDialog pinned to the right edge (see `openClaimDrawer`), so it reuses the dialog's focus trap,
 * Escape-to-close and backdrop instead of adding a sidenav to the page layout. It loads the claim and its audit trail
 * itself, so the queue only passes an id. The audit trail comes from the Kafka read model and can lag a just-made
 * change by a moment.
 */
@Component({
  selector: 'app-claim-drawer',
  imports: [KeyValuePipe, MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule, Alert, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      @if (claim(); as c) {
        <div>
          <h2 class="title">{{ c.claimNumber }}</h2>
          <div class="caption">{{ c.claimType }} · {{ c.market }} · {{ c.claimantName }}</div>
        </div>
        <app-status-chip [status]="c.status" />
      } @else {
        <h2 class="title">Claim</h2>
      }
      <button mat-icon-button mat-dialog-close aria-label="Close"><mat-icon>close</mat-icon></button>
    </header>
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <div class="body">
      @if (error(); as message) {
        <app-alert severity="error">{{ message }}</app-alert>
      }

      @if (claim(); as c) {
        <section>
          <h3>Claim</h3>
          <dl>
            <dt>Policy</dt>
            <dd>{{ c.policyNumber }}</dd>
            <dt>Incident date</dt>
            <dd>{{ c.incidentDate }}</dd>
            <dt>Claimed</dt>
            <dd class="num">{{ money(c.claimedAmount, c.currency) }}</dd>
            @if (c.settledAmount !== null) {
              <dt>Settled</dt>
              <dd class="num">{{ money(c.settledAmount, c.currency) }}</dd>
            }
            <dt>Officer</dt>
            <dd>{{ c.assignedHandler ?? 'Unassigned' }}</dd>
            <dt>Submitted</dt>
            <dd>{{ when(c.submittedAt) }}</dd>
            <dt>Last update</dt>
            <dd>{{ when(c.updatedAt) }}</dd>
            @if (c.decidedAt) {
              <dt>Decided</dt>
              <dd>{{ when(c.decidedAt) }}</dd>
            }
          </dl>
        </section>

        <section>
          <h3>Incident</h3>
          <dl>
            @for (d of c.incidentDetails | keyvalue; track d.key) {
              <dt>{{ labelFor(d.key) }}</dt>
              <dd>{{ d.value }}</dd>
            }
          </dl>
          <p class="text">{{ c.incidentDescription }}</p>
        </section>

        @if (c.infoRequests.length) {
          <section>
            <h3>Information requests</h3>
            @for (r of c.infoRequests; track r.id) {
              <div class="thread">
                <div class="caption">{{ r.requestedBy }} asked · {{ when(r.requestedAt) }}</div>
                <div class="text">{{ r.question }}</div>
                @if (r.answeredAt) {
                  <div class="caption reply">{{ c.claimantName }} replied · {{ when(r.answeredAt) }}</div>
                  <div class="text">{{ r.answer }}</div>
                } @else {
                  <div class="caption reply">Waiting for the claimant</div>
                }
              </div>
            }
          </section>
        }

        @if (c.decisionNote) {
          <section>
            <h3>{{ c.status === 'REJECTED' ? 'Rejection reason' : 'Decision note' }}</h3>
            <p class="text">{{ c.decisionNote }}</p>
          </section>
        }

        <section>
          <h3>Audit trail</h3>
          <ol class="audit">
            @for (e of audit(); track e.eventId) {
              <li>
                <span class="caption">{{ when(e.occurredAt) }}</span>
                <span>{{ describe(e) }}</span>
                <span class="caption">by {{ e.actor }}</span>
              </li>
            } @empty {
              <li class="caption">No events recorded yet.</li>
            }
          </ol>
        </section>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 16px 12px 24px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      > div {
        flex: 1;
      }
    }
    .title {
      font: var(--mat-sys-title-large);
      margin: 0;
    }
    .body {
      overflow-y: auto;
      padding: 8px 24px 24px;
    }
    section {
      padding: 12px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    section:last-child {
      border-bottom: 0;
    }
    h3 {
      font: var(--mat-sys-title-small);
      margin: 0 0 8px;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 20px;
      margin: 0;
    }
    dt {
      color: var(--co-muted);
    }
    dd {
      margin: 0;
    }
    .text {
      white-space: pre-wrap;
      margin: 8px 0 0;
    }
    .thread {
      padding: 10px 12px;
      margin-bottom: 8px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container);
    }
    .reply {
      margin-top: 8px;
    }
    .audit {
      list-style: none;
      margin: 0;
      padding: 0;
      li {
        display: grid;
        grid-template-columns: 150px 1fr auto;
        gap: 8px;
        padding: 4px 0;
      }
    }
  `,
})
export class ClaimDrawer implements OnInit {
  private readonly data = inject<ClaimDrawerData>(MAT_DIALOG_DATA);
  private readonly staff = inject(StaffService);

  protected readonly money = money;
  protected readonly when = dateTime;
  protected readonly claim = signal<ClaimDetail | null>(null);
  protected readonly audit = signal<AuditEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    forkJoin({ claim: this.staff.claim(this.data.claimId), audit: this.staff.audit(this.data.claimId) }).subscribe({
      next: ({ claim, audit }) => {
        this.claim.set(claim);
        this.audit.set(audit);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(errorText(err, 'Could not load the claim'));
        this.loading.set(false);
      },
    });
  }

  /** "licensePlate" → "License plate". */
  protected labelFor(key: string): string {
    const words = key.replace(/([A-Z])/g, ' $1').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  protected describe(e: AuditEntry): string {
    const to = STATUS_LABELS[e.newStatus];
    if (!e.previousStatus) return `Submitted (${to})`;
    return `${STATUS_LABELS[e.previousStatus as ClaimStatus]} → ${to}`;
  }
}
