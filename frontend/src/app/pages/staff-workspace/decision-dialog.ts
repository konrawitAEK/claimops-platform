import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { money } from '../../core/format';
import type { ClaimSummary } from '../../models';

export type DecisionMode = 'info' | 'settle' | 'reject';

export interface DecisionDialogData {
  mode: DecisionMode;
  claim: ClaimSummary;
}

/** What the officer entered; `amount` only for settle. */
export interface DecisionResult {
  text: string;
  amount?: number;
}

const COPY: Record<DecisionMode, { title: string; label: string; action: string; required: boolean }> = {
  info: { title: 'Request information', label: 'Question for the claimant', action: 'Send request', required: true },
  settle: { title: 'Settle claim', label: 'Note (optional)', action: 'Settle', required: false },
  reject: { title: 'Reject claim', label: 'Reason (shown to the claimant)', action: 'Reject', required: true },
};

/** One dialog for the three staff decisions that need input: request info, settle (amount), reject (reason). */
@Component({
  selector: 'app-decision-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ copy.title }} · {{ data.claim.claimNumber }}</h2>
    <form [formGroup]="form" (ngSubmit)="confirm()">
      <mat-dialog-content class="stack">
        @if (data.mode === 'settle') {
          <mat-form-field>
            <mat-label>Settled amount ({{ data.claim.currency }})</mat-label>
            <input matInput type="number" step="0.01" formControlName="amount" />
            <mat-hint>Up to {{ money(data.claim.claimedAmount, data.claim.currency) }} claimed</mat-hint>
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>{{ copy.label }}</mat-label>
          <textarea matInput rows="3" formControlName="text" maxlength="1000"></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button
          mat-flat-button
          type="submit"
          [class.danger]="data.mode === 'reject'"
          [disabled]="form.invalid"
        >
          {{ copy.action }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(420px, 80vw);
      padding-top: 8px !important;
    }
    .danger {
      background: var(--co-error);
    }
  `,
})
export class DecisionDialog {
  protected readonly data = inject<DecisionDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DecisionDialog, DecisionResult>>(MatDialogRef);
  protected readonly copy = COPY[this.data.mode];
  protected readonly money = money;

  protected readonly form = inject(NonNullableFormBuilder).group({
    text: ['', this.copy.required ? [Validators.required, Validators.maxLength(1000)] : [Validators.maxLength(1000)]],
    amount: [
      this.data.claim.claimedAmount,
      this.data.mode === 'settle'
        ? [Validators.required, Validators.min(0.01), Validators.max(this.data.claim.claimedAmount)]
        : [],
    ],
  });

  protected confirm(): void {
    if (this.form.invalid) return;
    const { text, amount } = this.form.getRawValue();
    this.ref.close({ text: text.trim(), amount: this.data.mode === 'settle' ? amount : undefined });
  }
}
