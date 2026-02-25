/** CANONICAL payment status - only 'success' is financially valid */
export type PaymentStatus = 'success' | 'pending' | 'failed';

/** CANONICAL pass status */
export type PassStatus = 'paid' | 'used';

/** Admin role for organizer users. Default (if missing/invalid) is 'viewer'. */
export type AdminRole = 'viewer' | 'manager' | 'superadmin';

/** Registration lifecycle status */
export type RegistrationStatus = 'pending' | 'converted' | 'cancelled';

/** Pass types from Firestore - closed set */
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

/** Expandable row team member detail - CANONICAL attendance structure */
export interface TeamMemberDetail {
  memberId?: string;
  name: string;
  phone: string;
  isLeader: boolean;
  /** MUST read from attendance.checkedIn, NOT top-level checkedIn */
  checkedIn: boolean;
  /** MUST read from attendance.checkInTime */
  checkedInAt?: string;
  /** MUST read from attendance.checkedInBy */
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

/** Admin-facing projection of a registration row (pending/converted/cancelled). */
export interface RegistrationRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  college: string | null;
  phone: string | null;
  passType: string;
  selectedDays: string[] | null;
  selectedEvents: string[] | null;
  calculatedAmount: number;
  status: RegistrationStatus;
  createdAt: string;
}

export interface RegistrationsListResponse {
  records: RegistrationRow[];
  page: number;
  pageSize: number;
  total?: number;
  totalPages?: number;
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
  eventCategory?: string;
  eventType?: string;
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
  eventCategory?: string;
  eventType?: string;
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
  eventCategory?: string;
  eventType?: string;
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
  eventCategories: string[];
  eventTypes: string[];
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
  eventCategory?: string | null;
  eventType?: string | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
}

export interface GroupEventsMember {
  name: string;
  phone: string;
  email: string | null;
  isLeader: boolean;
  /** MUST read from attendance.checkedIn */
  checkedIn: boolean;
  /** MUST read from attendance.checkInTime */
  checkInTime: string | null;
  /** MUST read from attendance.checkedInBy */
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

// ─── New Admin Passes API contract ────────────────────────────────────────────

export interface AdminPassRow {
  id: string;
  userId: string;
  name: string;
  phone: string;
  college: string | null;
  passType: string;
  eventLabel: string | null;
  selectedDay: string | null;
  amount: number;
  paymentStatus: string;
  isUsed: boolean;
  usedAt: string | null;
  createdAt: string;
}

export interface AdminPassesSummary {
  totalSold: number;
  totalRevenue: number;
  totalUsed: number;
  usagePercentage: number;
}

export interface AdminPassesPagination {
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AdminPassesResponse {
  data: AdminPassRow[];
  summary: AdminPassesSummary;
  pagination: AdminPassesPagination;
}

export interface PassManagementRecord {
  passId: string;
  paymentId?: string;
  userName: string;
  college: string;
  phone: string;
  /** Unified event display label resolved from pass/payment/team data */
  eventName: string;
  /** Full list of event names for this pass (if multi-event) */
  eventNames?: string[];
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
  dayPassDate?: string | null;
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

/** Team rules for group events; stored on event doc as teamConfig */
export interface EventTeamConfig {
  minMembers: number;
  maxMembers: number;
  pricePerPerson: number;
}

export interface AdminEvent {
  id: string;
  name: string;
  category?: string;
  type?: string;
  date?: string;
  /** Multi-day events: list of dates (e.g. ["26/02/26", "27/02/26"]); used with date for day-pass filtering */
  dates?: string[];
  venue?: string;
  startTime?: string;
  endTime?: string;
  allowedPassTypes?: string[];
  isActive?: boolean;
  isArchived?: boolean;
  /** For group events: min/max team size and price per person from DB */
  teamConfig?: EventTeamConfig;
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
