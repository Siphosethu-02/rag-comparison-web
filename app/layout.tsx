import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG vs Fine-tuning vs Hybrid",
  description: "Compare RAG, fine-tuning and hybrid answers side by side.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

