import Script from 'next/script';
import { Lexend, Lexend_Deca } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const lexend = Lexend({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800'],
});

const lexendDeca = Lexend_Deca({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
});

export const metadata = {
  title: 'Miaro Verify',
  description: 'Release verification and QA workspace',
};

export const viewport = {
  colorScheme: 'light dark',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${lexend.variable} ${lexendDeca.variable}`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body>
        <Script id="gq-theme" strategy="beforeInteractive">
          {`(function () {
  try {
    // light by default; dark only when the user picked it with the header toggle
    if (localStorage.getItem('gq-theme') === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();`}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
