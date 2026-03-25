"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Zap,
  Sun,
  Moon,
  Settings,
  Activity,
  TrendingUp,
  TrendingDown,
  LogOut,
  Globe,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMarketSnapshot } from "@/app/actions";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("coinpree_auth");
    setIsLoggedIn(false);
    router.push("/login");
  };

  React.useEffect(() => {
    setMounted(true);
    setIsLoggedIn(!!localStorage.getItem("coinpree_auth"));
    const fetchSnapshot = async () => {
      const data = await getMarketSnapshot();
      if (data) setSnapshot(data);
    };
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [pathname]);

  // Check if we are on the login/signup pages
  if (pathname === "/login" || pathname === "/signup") {
    return (
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
        <main className="flex-1 w-full h-full">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans relative">
      {/* Ambient Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      </div>

      {/* Top Bar */}
      <header className="h-[60px] border-b border-white/5 bg-background/60 backdrop-blur-xl flex items-center px-6 z-50 shrink-0 sticky top-0">
        {/* Logo Area */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-all active:scale-95">
            <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shrink-0 overflow-hidden border border-white/10">
              <img src="/coinpree.png" alt="Coinpree" className="w-full h-full object-cover brightness-0 invert" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-foreground text-xl tracking-tight leading-none">
                Coinpree
              </span>
              <span className="text-[11px] font-semibold text-primary uppercase tracking-wider mt-1">
                Algo Terminal
              </span>
            </div>
          </Link>
        </div>

        {/* Vertical Divider */}
        <div className="h-8 w-px bg-white/5 mx-6 hidden md:block" />

        {/* Navigation */}
        <div className="hidden md:flex items-center gap-1.5 mr-6">
          {isLoggedIn && (
            <>
              {[
                { name: "Exchange Futures", href: "/exchange-futures" },
                { name: "Market Overview", href: "/futures" },
                { name: "Advanced Signals", href: "/advanced-signals" },
                { name: "Binance History", href: "/binance-history" }
              ].map((link) => (
                <Link key={link.href} href={link.href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "h-9 text-xs font-semibold uppercase tracking-wider px-4 transition-all rounded-lg",
                      pathname === link.href
                        ? "bg-primary/10 text-primary hover:bg-primary/15"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    {link.name}
                  </Button>
                </Link>
              ))}
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Right Side Actions */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-xl transition-all"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            suppressHydrationWarning
          >
            {mounted ? (theme === "dark" ? <Sun size={20} /> : <Moon size={20} />) : <Sun size={20} />}
          </Button>



          {isLoggedIn ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
              onClick={handleLogout}
              title="Logout"
            >
              <LogOut size={20} />
            </Button>
          ) : (
            <Link href="/login">
              <Button
                variant="default"
                className="h-9 text-[11px] font-black uppercase tracking-[0.1em] px-6 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)] transition-all hover:scale-105"
              >
                Log In
              </Button>
            </Link>
          )}
        </div>
      </header>

      <div className="flex flex-1 relative z-10 overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Content Viewport */}
          <main className="flex-1 overflow-y-auto p-6 md:p-10 pb-24 md:pb-10 space-y-10 scroll-smooth">
            <div className="max-w-[1400px] mx-auto">
              {children}
            </div>
          </main>

          <footer className="bg-background/40 backdrop-blur-md border-t border-white/5 py-4 px-8 text-[10px] text-muted-foreground/60 flex items-center justify-between shrink-0 hidden md:flex font-bold uppercase tracking-widest">
            <div>© 2026 Coinpree Algo Terminal</div>
            <div className="flex items-center gap-6">
              <Link href="/disclaimer" className="hover:text-primary transition-colors">Disclaimer</Link>
              <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            </div>
          </footer>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-xl border-t border-white/5 flex items-center justify-around z-50 px-4 pb-safe">
        <Link href="/" className="flex flex-col items-center gap-1 w-full h-full justify-center">
          <div className={cn("p-1.5 rounded-lg transition-colors", pathname === "/" ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
            <Globe size={20} />
          </div>
          <span className={cn("text-[10px] font-semibold uppercase tracking-tight", pathname === "/" ? "text-primary" : "text-muted-foreground")}>Home</span>
        </Link>

        {isLoggedIn ? (
          <>
            <Link href="/exchange-futures" className="flex flex-col items-center gap-1 w-full h-full justify-center">
              <div className={cn("p-1.5 rounded-lg transition-colors", pathname === "/exchange-futures" ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
                <Activity size={20} />
              </div>
              <span className={cn("text-[10px] font-semibold uppercase tracking-tight", pathname === "/exchange-futures" ? "text-primary" : "text-muted-foreground")}>Futures</span>
            </Link>

            <Link href="/advanced-signals" className="flex flex-col items-center gap-1 w-full h-full justify-center">
              <div className={cn("p-1.5 rounded-lg transition-colors", pathname === "/advanced-signals" ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
                <Zap size={20} />
              </div>
              <span className={cn("text-[10px] font-semibold uppercase tracking-tight", pathname === "/advanced-signals" ? "text-primary" : "text-muted-foreground")}>Signals</span>
            </Link>
          </>
        ) : (
          <Link href="/login" className="flex flex-col items-center gap-1 w-full h-full justify-center">
            <div className={cn("p-1.5 rounded-lg transition-colors", pathname === "/login" ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
              <Lock size={20} />
            </div>
            <span className={cn("text-[10px] font-semibold uppercase tracking-tight", pathname === "/login" ? "text-primary" : "text-muted-foreground")}>Login</span>
          </Link>
        )}
      </div>
    </div>
  );
}
