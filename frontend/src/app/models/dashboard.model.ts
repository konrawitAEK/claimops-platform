// Staff dashboard, mirroring exposure/DashboardView.
import type { ClaimStatus, ClaimType } from './claim.model';
import type { Currency, Market } from './common.model';

export interface Exposure {
  market: Market;
  claimType: ClaimType;
  currency: Currency;
  openClaims: number;
  outstandingAmount: number;
  settledAmount: number;
  updatedAt: string;
}

export interface Workload {
  byStatus: Record<ClaimStatus, number>;
  openByHandler: { handler: string; openClaims: number }[];
}

export interface Dashboard {
  exposures: Exposure[];
  workload: Workload;
}
