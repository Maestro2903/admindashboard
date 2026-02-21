import type { Metadata } from 'next';
import { OverviewContent } from './components/OverviewContent';

export const metadata: Metadata = {
  title: 'Overview | CIT Takshashila',
  description: 'Event operations overview dashboard',
};

export default function OverviewPage() {
  return <OverviewContent />;
}
