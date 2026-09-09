import type { Metadata } from "next";

export const metadata: Metadata = {
  title:       "AI Platform | منصة الذكاء",
  description: "Advanced AI models at accessible prices",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
