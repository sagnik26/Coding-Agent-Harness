import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Craftly",
  description: "Craftly — streaming web surface for the coding agent harness",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
