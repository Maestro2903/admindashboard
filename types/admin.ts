export type PaymentStatus = 'pending' | 'success' | 'failed';
export type PassStatus = 'paid' | 'used';

/** Admin role for organizer users. Default (if missing) is manager. */
export type AdminRole = 'viewer' | 'manager' | 'superadmin';

/** Pass types from Firestore */
export type PassType = 'day_pass' | 'group_events' | 'proshow' | 'sana_concert';

// ─── Clean AdminRecord (unified server transformer output) ──────────────────

/** The canonical record shape sent to the frontend. Never send raw Firestore docs. */
export interface AdminRecord {
  id: string;           // passId
  userId: string;
  name: string;
  email: string;
  college: string;
  phone: string;
  passType: string;
  passStatus: PassStatus;
  paymentStatus: PaymentStatus;
  amount: number;
  teamName?: string;
  teamId?: string;
  teamMembersCount?: number;
  teamMembersCheckedIn?: number;
  eventNames: string[];
  scanned: boolean;
  scannedBy?: string;
  usedAt?: string;
  createdAt: string;
  isArchived?: boolean;
}

/** Expandable row team member detail */
export interface TeamMemberDetail {
  memberId?: string;
  name: string;
  phone: string;
  isLeader: boolean;
  checkedIn: boolean;
  checkedInAt?: string;
  checkedInBy?: string;
}

/** Team detail for expandable rows */
export interface TeamDetail {
  teamId: string;
  teamName: string;
  totalMembers: number;
  leaderName: string;
  paymentStatus: string;
  members: TeamMemberDetail[];
}

// ─── Overview / Stats ───────────────────────────────────────────────────────

export interface OverviewStats {
  totalSuccessfulPayments: number;
  revenue: number;
  activePasses: number;       // status = 'paid'
  usedPasses: number;         // status = 'used'
  pendingPayments: number;
  teamsRegistered: number;
  totalUsers: number;
  registrationsToday: number;
  registrationsYesterday: number;
  passDistribution: Record<string, number>;  // passType -> count
}

export interface ActivityFeedItem {
  id: string;
  type: 'scan' | 'payment' | 'team' | 'pass';
  message: string;
  timestamp: string;
}

// ─── Operations (core table) ────────────────────────────────────────────────

export interface OperationsFilters {
  passType?: string;
  paymentStatus?: PaymentStatus;
  passStatus?: PassStatus;
  dateFrom?: string;
  dateTo?: string;
  scanned?: 'scanned' | 'not_scanned' | 'all';
  eventId?: string;
  q?: string;
}

export interface PaginatedResponse<T> {
  records: T[];
  page: number;
  pageSize: number;
  total?: number;
  totalPages?: number;
  nextCursor?: string | null;
}

// ─── Existing types kept for backward compatibility ─────────────────────────

/** Success-only unified table record (no amount, no internal IDs in table). */
export interface CleanUnifiedRecord {
  userId: string;
  name: string;
  college: string;
  phone: string;
  email: string;
  eventName: string;
  passType: string;
  paymentStatus: 'success';
  createdAt: string;
}

/** CleanUnifiedRecord + passId for row identity and bulk/detail actions (not displayed). */
export type CleanUnifiedRecordWithId = CleanUnifiedRecord & { passId: string };

/** Full financial view record (superadmin only). */
export interface FinancialRecord {
  userId: string;
  passId: string;
  paymentId: string;
  name: string;
  email: string;
  college: string;
  phone: string;
  eventName: string;
  passType: string;
  amount: number;
  paymentStatus: string;
  orderId: string;
  createdAt: string;
}

/** Operations view record. No amount, orderId, or internal IDs. */
export interface OperationsRecord {
  passId: string;
  name: string;
  email: string;
  college: string;
  phone: string;
  eventName: string;
  passType: string;
  payment: 'Confirmed';
  createdAt: string;
}

export interface UnifiedAdminRecord {
  passId: string;
  userId: string;
  name: string;
  email: string;
  college: string;
  phone: string;
  isOrganizer: boolean;

  passType: string;
  passStatus: PassStatus;
  usedAt?: string;
  scannedBy?: string;

  eventRegistered?: string[];
  eventNames?: string[];

  teamId?: string;
  teamName?: string;
  teamMembersCount?: number;
  teamMembersCheckedIn?: number;
  teamDetails?: Array<{
    memberId?: string;
    name?: string;
    phone?: string;
    isLeader?: boolean;
    checkedIn?: boolean;
  }>;

  paymentStatus: PaymentStatus;

  createdAt: string;
}

export interface OverviewMetrics {
  totalSuccessfulRegistrations?: number;
  registrationsToday?: number;
  registrationsPerPassType?: Record<string, number>;
}

export interface FilterOptions {
  passTypes: string[];
  events: Array<{ id: string; name: string }>;
  passStatuses: PassStatus[];
  paymentStatuses: PaymentStatus[];
}

export interface UnifiedDashboardResponse {
  records: CleanUnifiedRecordWithId[];
  page: number;
  pageSize: number;
  total?: number;
  totalPages?: number;
  nextCursor?: string | null;
  filters?: FilterOptions;
  metrics?: OverviewMetrics;
}

export interface FinancialDashboardResponse {
  records: FinancialRecord[];
  page: number;
  pageSize: number;
  total?: number;
  totalPages?: number;
  nextCursor?: string | null;
  filters?: FilterOptions;
  metrics?: OverviewMetrics;
  /** Total revenue from all passes matching current filters (pass type, event, date range). */
  summary?: { totalRevenue: number };
}

export interface OperationsDashboardResponse {
  records: OperationsRecord[];
  page: number;
  pageSize: number;
  total?: number;
  totalPages?: number;
  nextCursor?: string | null;
  filters?: FilterOptions;
  metrics?: OverviewMetrics;
}

export interface UnifiedDashboardQuery {
  page?: number;
  pageSize?: number;
  cursor?: string | null;
  passType?: string | null;
  eventId?: string | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
}

export interface GroupEventsMember {
  name: string;
  phone: string;
  email: string | null;
  isLeader: boolean;
  checkedIn: boolean;
  checkInTime: string | null;
  checkedInBy: string | null;
}

export interface GroupEventsTeam {
  teamId: string;
  teamName: string;
  totalMembers: number;
  leaderName: string;
  leaderPhone: string;
  leaderCollege: string;
  paymentStatus: string;
  members: GroupEventsMember[];
}

export interface PassManagementRecord {
  passId: string;
  paymentId?: string;
  userName: string;
  college: string;
  phone: string;
  eventName: string;
  amount: number;
  paymentStatus: 'success';
  passStatus: PassStatus;
  createdAt: string;
  usedAt: string | null;
  scannedBy: string | null;
  teamName?: string;
  totalMembers?: number;
  checkedInCount?: number;
  team?: GroupEventsTeam;
}

export interface PassManagementResponse {
  records: PassManagementRecord[];
  page: number;
  pageSize: number;
  total?: number;
  summary?: {
    totalSold: number;
    totalRevenue: number;
    totalUsed: number;
    remaining: number;
    totalTeams?: number;
    totalParticipants?: number;
    checkedInCount?: number;
  };
}

export type PassManagementType = 'day_pass' | 'group_events' | 'proshow' | 'sana_concert';

export interface PassFiltersState {
  from?: string;
  to?: string;
  passStatus?: PassStatus | 'all';
  scanned?: 'scanned' | 'not_scanned' | 'all';
  amountMin?: number;
  amountMax?: number;
  teamSizeMin?: number;
  teamSizeMax?: number;
  checkedInMin?: number;
  checkedInMax?: number;
}

export interface AdminEvent {
  id: string;
  name: string;
  category?: string;
  type?: string;
  date?: string;
  venue?: string;
  allowedPassTypes?: string[];
  isActive?: boolean;
  isArchived?: boolean;
}

/** Audit log entry */
export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminName?: string;
  action: string;
  targetCollection: string;
  targetId: string;
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  ipAddress?: string;
  timestamp: string;
}
