import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Users | CIT Takshashila',
  description: 'User management',
};

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
