import type { Routes } from '@angular/router';
import { AppLayout } from './components/app-layout/app-layout';
import { homeRedirect, roleGuard } from './core/guards';

export const routes: Routes = [
  {
    path: '',
    component: AppLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: homeRedirect },
      {
        path: 'claim',
        canActivate: [roleGuard('CLAIMANT')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'new' },
          {
            path: 'new',
            loadComponent: () => import('./pages/submit-claim/submit-claim-page').then((m) => m.SubmitClaimPage),
          },
          {
            path: 'track',
            loadComponent: () => import('./pages/track-claim/track-claim-page').then((m) => m.TrackClaimPage),
          },
        ],
      },
      {
        path: 'staff',
        canActivate: [roleGuard('STAFF')],
        loadComponent: () =>
          import('./pages/staff-workspace/staff-workspace-page').then((m) => m.StaffWorkspacePage),
      },
    ],
  },
  { path: '**', redirectTo: homeRedirect },
];
