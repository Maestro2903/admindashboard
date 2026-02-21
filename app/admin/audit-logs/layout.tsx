import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Audit Logs | CIT Takshashila',
  description: 'Admin action audit log history',
};

export default function AuditLogsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
