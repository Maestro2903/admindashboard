import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Events | CIT Takshashila',
  description: 'Event catalog management',
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
