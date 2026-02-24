import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import '@/styles/globals.css';
import '@/styles/admin.css';
import { AuthProvider } from '@/features/auth/AuthContext';
import { AdminLayout } from './AdminLayout';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Control Panel | CIT Takshashila',
  description: 'Event Operations Control System',
  icons: { icon: '/tk-logo.svg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className={`${inter.className} bg-[#09090b] text-white antialiased`}>
        <AuthProvider>
          <AdminLayout>{children}</AdminLayout>
        </AuthProvider>
        <Toaster
          richColors
          position="top-right"
          toastOptions={{
            style: {
              background: '#18181b',
              border: '1px solid #27272a',
              color: '#fafafa',
            },
          }}
        />
      </body>
    </html>
  );
}
