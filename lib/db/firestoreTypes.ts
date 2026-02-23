import type { Timestamp } from 'firebase/firestore';

/** User profile stored in Firestore users/{uid} */
export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  college: string;
  phone: string;
  isOrganizer?: boolean;
  /** Admin role for organizers. Used for registrations (superadmin) vs operations (all). */
  adminRole?: 'viewer' | 'manager' | 'superadmin';
  photoURL?: string | null;
  photoPath?: string | null;
  createdAt: Timestamp | { toDate: () => Date };
  updatedAt?: Timestamp | Date;
  referralCode?: string;
  invitedUsers?: string[];
  inviteCount?: number;
  dayPassUnlocked?: boolean;
  inviteUnlockedAt?: Timestamp | Date;
}

export interface UserProfileUpdate {
  name: string;
  college: string;
  phone: string;
  photoURL?: string | null;
  photoPath?: string | null;
}

/** Read-optimized aggregated document for admin dashboard */
export interface AdminDashboardDoc {
  userId: string;
  profile: {
    name: string;
    email: string;
    phone: string;
    college: string;
    isOrganizer: boolean;
    createdAt: Timestamp | Date | null;
  };
  payments: Array<{
    paymentId: string;
    amount: number;
    passType: string;
    status: 'pending' | 'success' | 'failed';
    createdAt: Timestamp | Date | null;
    eventIds?: string[];
    eventCategory?: string;
    eventType?: string;
  }>;
  passes: Array<{
    passId: string;
    passType: string;
    status: 'paid' | 'used';
    amount: number;
    createdAt: Timestamp | Date | null;
    usedAt?: Timestamp | Date | null;
    teamId?: string;
    eventIds?: string[];
    eventCategory?: string;
    eventType?: string;
  }>;
  teams: Array<{
    teamId: string;
    teamName: string;
    totalMembers: number;
    paymentStatus: string;
    passId?: string;
    eventIds?: string[];
  }>;
  summary: {
    totalPayments: number;
    totalAmountPaid: number;
    totalPasses: number;
    totalTeams: number;
  };
  filterPassTypes?: string[];
  filterPaymentStatuses?: string[];
  filterEventIds?: string[];
  filterEventCategories?: string[];
  filterEventTypes?: string[];
  updatedAt: Timestamp | Date;
}
