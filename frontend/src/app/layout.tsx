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
  title: { default: "Hydrowise", template: "%s · Hydrowise" },
  description: "Woda na Twojej działce — susza, przyczyny i co zrobić, z bezpłatnych danych publicznych.",
  appleWebApp: { capable: true, title: "Hydrowise", statusBarStyle: "default" },
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
        <ServiceWorker />
      </body>
    </html>
  );
}
