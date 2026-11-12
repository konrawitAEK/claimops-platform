import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { Alert } from '../../components/alert';
import { StatusChip } from '../../components/status-chip';
import { errorText, statusOf } from '../../core/api';
import { dateTime, money } from '../../core/format';
import type { ClaimDetail, ClaimSummary } from '../../models';
import { ClaimantService } from '../../services/claimant.service';
import { ClaimTimeline } from './claim-timeline';

const POLL_MS = 10_000;

/**
 * Claimant: look up a claim by number, follow its progress, and reply when the officer asks for more information.
 *
 * The open claim is re-fetched every 10 s until it is decided, so a staff action shows up without a reload. Polling
 * was chosen over SSE or WebSockets to keep the time-boxed build simple.
 */
@Component({
  selector: 'app-track-claim-page',
  imports: [FormsModule, KeyValuePipe, MatCardModule, MatInputModule, MatButtonModule, Alert, StatusChip, ClaimTimeline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './track-claim-page.html',
  styleUrl: './track-claim-page.scss',
})
export class TrackClaimPage implements OnInit {
  /** ?number=CLM-… from the "Track it" link after submitting. */
  readonly number = input<string>();

  private readonly claims = inject(ClaimantService);
  private readonly router = inject(Router);

  protected readonly money = money;
  protected readonly when = dateTime;
  protected query = '';
  protected readonly myClaims = signal<ClaimSummary[]>([]);
  protected readonly claim = signal<ClaimDetail | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected reply = '';
  protected readonly sending = signal(false);
  protected readonly replyError = signal<string | null>(null);

  constructor() {
    const timer = setInterval(() => this.refresh(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  ngOnInit(): void {
    this.claims.myClaims().subscribe({ next: (list) => this.myClaims.set(list), error: () => this.myClaims.set([]) });
    const initial = this.number();
    if (initial) {
      this.query = initial;
      this.search();
    }
  }

  protected search(): void {
    const number = this.query.trim();
    if (!number) return;
    this.loading.set(true);
    this.error.set(null);
    void this.router.navigate([], { queryParams: { number }, replaceUrl: true });
    this.claims
      .byNumber(number)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (claim) => this.claim.set(claim),
        error: (err: unknown) => {
          this.claim.set(null);
          this.error.set(statusOf(err) === 404 ? `No claim ${number} found under your name.` : errorText(err));
        },
      });
  }

  protected open(claimNumber: string): void {
    this.query = claimNumber;
    this.search();
  }

  protected sendReply(claim: ClaimDetail): void {
    const answer = this.reply.trim();
    if (!answer) return;
    this.sending.set(true);
    this.replyError.set(null);
    this.claims
      .reply(claim.id, answer)
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: (updated) => {
          this.claim.set(updated);
          this.reply = '';
        },
        error: (err: unknown) => this.replyError.set(errorText(err, 'Could not send your reply')),
      });
  }

  protected openQuestion(claim: ClaimDetail): string | undefined {
    return claim.infoRequests.find((r) => !r.answeredAt)?.question;
  }

  private refresh(): void {
    const current = this.claim();
    if (!current || current.status === 'SETTLED' || current.status === 'REJECTED' || this.sending()) return;
    this.claims.byNumber(current.claimNumber).subscribe({ next: (claim) => this.claim.set(claim), error: () => {} });
  }
}
