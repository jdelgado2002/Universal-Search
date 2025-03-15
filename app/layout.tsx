import type React from "react"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { Providers } from "@/components/providers"
import { MainNav } from "@/components/main-nav"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "API Integration Service",
  description: "Connect to external APIs like Google Docs",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <main className="min-h-screen bg-background">
              <header className="border-b">
                <div className="container mx-auto py-4 flex justify-between items-center">
                  <h1 className="text-2xl font-bold">API Integration Service</h1>
                  <MainNav />
                </div>
              </header>
              {children}
            </main>
            <Toaster />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  )
}



import './globals.css'