import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DEMO_USERS, MARKETS, homePath } from '../../core/labels';
import type { Market, Role } from '../../models';
import { SessionService } from '../../services/session.service';

/**
 * App shell: top bar with navigation and the role switcher.
 *
 * The switcher stands in for login in this demo. Changing role, name or market updates SessionService, whose identity
 * the HTTP interceptor sends on every API call, and a role change jumps to that role's home page (the route guards
 * would redirect there anyway).
 */
@Component({
  selector: 'app-layout',
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatSelectModule,
    MatIconModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar class="bar">
      <mat-icon>shield</mat-icon>
      <span class="brand">ClaimOps</span>
      <nav class="nav">
        @if (session.identity().role === 'CLAIMANT') {
          <a mat-button routerLink="/claim/new" routerLinkActive="active">Submit claim</a>
          <a mat-button routerLink="/claim/track" routerLinkActive="active">Track claim</a>
        } @else {
          <a mat-button routerLink="/staff" routerLinkActive="active">Workspace</a>
        }
      </nav>
      <span class="grow"></span>
      <div class="switcher">
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [value]="session.identity().role"
          (change)="switchRole($event.value)"
          aria-label="View as"
        >
          <mat-button-toggle value="CLAIMANT">Claimant view</mat-button-toggle>
          <mat-button-toggle value="STAFF">Staff view</mat-button-toggle>
        </mat-button-toggle-group>
        <mat-form-field class="dense pick">
          <mat-select
            aria-label="User"
            [value]="session.identity().name"
            (selectionChange)="session.setName($event.value)"
          >
            @for (name of users(); track name) {
              <mat-option [value]="name">{{ name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="dense pick">
          <mat-select
            aria-label="Market"
            [value]="session.identity().market"
            (selectionChange)="setMarket($event.value)"
          >
            @for (m of markets; track m.code) {
              <mat-option [value]="m.code">{{ m.code }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
    </mat-toolbar>
    <main class="content">
      <router-outlet />
    </main>
  `,
  styles: `
    .bar {
      gap: 12px;
      flex-wrap: wrap;
      height: auto;
      min-height: 64px;
      padding: 8px 16px;
      background: var(--mat-sys-surface-container);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .brand {
      font: var(--mat-sys-title-large);
      font-weight: 700;
    }
    .nav a.active {
      background: var(--mat-sys-secondary-container);
    }
    .switcher {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .pick {
      width: 110px;
    }
    .content {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }
  `,
})
export class AppLayout {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly markets = MARKETS;

  protected users(): string[] {
    return DEMO_USERS[this.session.identity().role];
  }

  protected switchRole(role: Role): void {
    this.session.switchRole(role);
    void this.router.navigateByUrl(homePath(role));
  }

  protected setMarket(market: Market): void {
    this.session.setMarket(market);
  }
}
