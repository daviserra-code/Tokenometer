import type { Metadata } from "next";
import { Space_Grotesk, Manrope, Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { MobileNav } from "@/components/MobileNav";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["400", "500", "600"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tokenometer — AI Token Wallet & FinOps",
  description:
    "Financial governance for AI token consumption. Track usage, cost, budgets and forecasts across providers, models, projects and teams.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const surface = headers().get("x-tokenometer-surface");
  const isMarketing = surface === "marketing";

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${manrope.variable} ${inter.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- Material Symbols is an icon font, while text fonts use next/font above. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-on-background antialiased selection:bg-primary-container/30">
        {isMarketing ? (
          <main className="min-h-screen bg-background">{children}</main>
        ) : (
          <>
            <Topbar />
            <div className="flex min-h-[calc(100vh-64px)] w-full">
              <Sidebar />
              <main className="relative flex-1 overflow-x-hidden bg-background pb-24 lg:pb-8">
                <div className="brand-glow relative mx-auto max-w-[1600px] p-container-margin">
                  {children}
                </div>
              </main>
            </div>
            <MobileNav />
          </>
        )}
      </body>
    </html>
  );
}
