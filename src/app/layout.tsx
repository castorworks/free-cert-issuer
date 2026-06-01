import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Free SSL Certificate Issuer",
  description:
    "Issue free SSL/TLS certificates using Let's Encrypt ACME protocol",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  );
}
