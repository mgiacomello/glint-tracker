import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chiaro — Non ti fregano più!",
    short_name: "Chiaro",
    description:
      "Fotografa o carica un documento: Chiaro te lo spiega in parole semplici e ti avvisa se c'è una fregatura.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef2f8",
    theme_color: "#10b981",
    orientation: "portrait",
    lang: "it",
    icons: [
      { src: "/icons/flip-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/flip-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
