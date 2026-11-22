import type { Metadata, Viewport } from "next";
// Fonts are self-hosted from npm (Fontsource): the build needs no network (Docker / Cloud Build)
// and the installed PWA has its fonts offline. Families are mapped to CSS variables in globals.css.
import "@fontsource-variable/inter";
import "@fontsource-variable/red-hat-display";
import "@fontsource-variable/inter-tight";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

// Applies the saved look before the first paint (no flash of the other theme).
const THEME_SCRIPT = `try{var t=localStorage.getItem("asystent-wodny:wyglad");if(t==="trace"){document.documentElement.dataset.theme="trace";var m=document.querySelector('meta[name="theme-color"]');if(m)m.content="#0c1113"}}catch(e){}`;

export const metadata: Metadata = {
  title: { default: "Asystent Wodny", template: "%s · Asystent Wodny" },
  description: "Woda na Twojej działce — susza, przyczyny i co zrobić, z bezpłatnych danych publicznych.",
  appleWebApp: { capable: true, title: "Asystent Wodny", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Status bar matches the top of the page (the light header); the dark look updates it from JS.
  themeColor: "#FBFBF7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: the software keyboard shrinks the layout viewport, so bottom-pinned UI moves above it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        {process.env.MOCK_API === "1" && (
          // MOCK_API: usunąć przed pushem
          <div className="pointer-events-none fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-amber-tint px-3 py-1 text-xs font-semibold text-amber-ink shadow-sm">
            Dane przykładowe (MOCK_API)
          </div>
        )}
        <ServiceWorker />
      </body>
    </html>
  );
}
