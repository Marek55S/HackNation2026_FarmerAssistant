import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

// Display font for the dark ("trace") look — tight grotesque headlines.
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
});

// Applies the saved look before the first paint (no flash of the other theme).
const THEME_SCRIPT = `try{var t=localStorage.getItem("asystent-wodny:wyglad");if(t==="trace")document.documentElement.dataset.theme="trace"}catch(e){}`;

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
    <html lang="pl" className={`${inter.variable} ${interTight.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
