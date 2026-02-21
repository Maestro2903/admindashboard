import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payments | CIT Takshashila',
  description: 'Payment management and verification',
};

export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
