import type { Metadata, Viewport } from "next";
import { Lora, Public_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const lora = Lora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-heading",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "STSA Church Directory",
  description: "Staff-only church member directory",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Directory",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1A3A5C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(lora.variable, publicSans.variable)}>
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
