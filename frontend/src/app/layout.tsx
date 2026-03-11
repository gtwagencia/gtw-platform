import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GTW Platform',
  description: 'Plataforma de atendimento e CRM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
