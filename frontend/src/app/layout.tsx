import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "Asystent Wodny", template: "%s · Asystent Wodny" },
  description: "Woda na Twojej działce — susza, przyczyny i co zrobić, z bezpłatnych danych publicznych.",
  appleWebApp: { capable: true, title: "Asystent Wodny", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1E5B3A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
