import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, type MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { forkJoin } from 'rxjs';
import { Alert } from '../../../../components/alert/alert';
import { StatusChip } from '../../../../components/status-chip/status-chip';
import { errorText } from '../../../../core/api';
import { dateTime, money } from '../../../../core/format';
import { STATUS_LABELS } from '../../../../core/labels';
import type { AuditEntry, ClaimDetail, ClaimStatus } from '../../../../models';
import { StaffService } from '../../../../services/staff.service';

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
  templateUrl: './claim-drawer.html',
  styleUrl: './claim-drawer.scss',
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
