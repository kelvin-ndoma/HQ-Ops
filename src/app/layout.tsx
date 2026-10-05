import { Fraunces, Geist } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata = {
  title: { default: "HQ Operations", template: "%s · HQ Operations" },
  description: "Operational source of truth for HQ private events.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
