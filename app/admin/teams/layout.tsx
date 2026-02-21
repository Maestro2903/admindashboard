import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Teams | CIT Takshashila',
  description: 'Team management and attendance',
};

export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
