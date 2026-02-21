import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live Check-In | CIT Takshashila',
  description: 'Real-time QR code check-in scanner',
};

export default function LiveCheckinLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
