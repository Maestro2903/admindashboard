import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Passes | CIT Takshashila',
  description: 'Pass explorer and management',
};

export default function PassesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
