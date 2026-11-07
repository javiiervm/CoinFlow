import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoinFlow — Personal finance",
  description: "Track balances, transactions, budgets and savings in one place."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101114"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
