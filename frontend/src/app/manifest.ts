import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Asystent Wodny – woda na Twojej działce",
    short_name: "Asystent Wodny",
    description: "Susza i retencja na działce rolnej: co zrobić i gdzie, z danych publicznych.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#EEEEE5",
    theme_color: "#FBFBF7",
    lang: "pl",
    categories: ["agriculture", "utilities", "weather"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
