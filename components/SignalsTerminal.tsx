"use client";

import * as React from "react";
import Link from "next/link";
import { useState, useEffect, memo, useMemo } from "react";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  Globe,
  ExternalLink,
  Search,
  ArrowUpRight,
  Trophy,
  Target,
  AlertTriangle,
  Calculator,
  Shield,
  Flame,
  PlusCircle,
  Filter,
  ArrowUpDown,
  RefreshCw,
  HelpCircle,
  Clock,
  Bell,
  BellOff,
} from "lucide-react";
import { useAlertSystem } from "@/lib/hooks/useAlertSystem";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";
import { getMACrossoverSignals } from "@/app/actions";

// --- DATA TYPE ---
export interface SignalData {
  coinId: string;
  symbol: string;
  signalType: "BUY" | "SELL" | "NEUTRAL";
  signalName: string;
  timeframe?: string;
  score: number;
  price: number;
  currentPrice: number;
  change1h: number;
  change24h: number;
  change7d: number;
  volume24h?: number;
  marketCap?: number;
  timestamp: number;
  crossoverTimestamp?: number;
  candlesAgo?: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  volatility: number;
  volatilityTooltip?: string;
  formula: string;
  ema7?: number;
  ema99?: number;
  ema7Prev?: number;
  ema99Prev?: number;
  crossoverStrength?: number;
  fullData?: {
    name: string;
    image: string;
  };
  name?: string;
  image?: string;
  // Tracking Metadata
  firstSeen?: number;
  lastUpdate?: number;
}

const FormatPercent = ({ val }: { val: number }) => {
  const v = val || 0;
  const isUp = v >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center font-bold text-[13px] tabular-nums",
        isUp ? "text-[#0ecb81]" : "text-[#f6465d]",
      )}
    >
      {isUp ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
    </span>
  );
};

const HeaderTooltip = ({ title, content, align = "left" }: { title: string, content: string, align?: "left" | "right" | "center" }) => (
  <div className={cn("flex items-center gap-1.5", align === "right" && "justify-end", align === "center" && "justify-center")}>
    <span>{title}</span>
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle size={12} className="text-muted-foreground/50 hover:text-primary cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-xs font-medium z-50 p-3 bg-popover text-popover-foreground shadow-xl border-border">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);

// --- ROW COMPONENT ---
const SignalRow = memo(
  ({
    coin,
    index,
    isNew = false,
    firstSeen,
  }: {
    coin: SignalData;
    index: number;
    isNew?: boolean;
    firstSeen?: number;
  }) => {
    const isBuy = coin.signalType === "BUY";
    const isSell = coin.signalType === "SELL";
    const displayPrice = coin.currentPrice || coin.price || 0;

    // Client-only state to prevent hydration mismatch
    const [mounted, setMounted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
      setMounted(true);
      setCurrentTime(Date.now());

      // Update time every 30 seconds for freshness indicator
      const interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 30000);

      return () => clearInterval(interval);
    }, []);

    // Smart time display (client-safe)
    const crossoverTimestamp = coin.crossoverTimestamp || coin.timestamp || 0;
    const timeSinceCrossover = mounted ? currentTime - crossoverTimestamp : 0;
    const isFresh = timeSinceCrossover < 5 * 60 * 1000; // 5 minutes

    // Format time only on client to prevent hydration mismatch
    const crossoverTime = mounted
      ? new Date(crossoverTimestamp).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
      : "Loading...";

    const coinName = coin.name || coin.fullData?.name || coin.symbol;
    const coinImage = coin.image || coin.fullData?.image || "";

    return (
      <TableRow
        className={cn(
          "gecko-table-row group",
          isNew && "animate-pulse bg-primary/5"
        )}
      >
        <TableCell className="w-10 text-center text-muted-foreground text-[11px] font-bold">
          {index + 1}
        </TableCell>
        <TableCell className="min-w-[280px] py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden border border-border group-hover:border-primary/50 transition-colors">
              {coinImage ? (
                <img
                  src={coinImage}
                  alt={coin.symbol}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground">
                  {coin.symbol.slice(0, 2)}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[14px] text-foreground group-hover:text-primary transition-colors">
                  {coin.symbol}
                </span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 h-4 font-bold border-border/50"
                >
                  #{index + 1}
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">
                {coinName}
              </span>
            </div>
          </div>
        </TableCell>

        <TableCell>
          <div className="flex flex-col gap-1.5 items-start text-left">
            <Badge
              className={cn(
                "font-bold text-[10px] px-2 py-0.5 uppercase tracking-wide w-fit border-0 shadow-sm",
                isBuy
                  ? "bg-[#0ecb81]/15 text-[#0ecb81]"
                  : isSell
                    ? "bg-[#f6465d]/15 text-[#f6465d]"
                    : "bg-muted text-muted-foreground border-border",
              )}
            >
              {isBuy ? "BUY" : isSell ? "SELL" : "NEUTRAL"}
            </Badge>

            <span className="text-[11px] font-bold text-foreground leading-tight">
              {coin.signalName.replace(/\s*\(.*?\)/g, "")}
            </span>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded flex items-center gap-1 w-fit">
                {crossoverTime}
              </span>
              <div className="flex flex-col text-[9px] text-muted-foreground/70 font-medium">
                {/* @ts-ignore */}
                {coin.firstSeen && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5 opacity-50" />
                    First: {new Date(coin.firstSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {/* @ts-ignore */}
                {coin.lastUpdate && coin.firstSeen &&
                  new Date(coin.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) !==
                  new Date(coin.firstSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) && (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="w-2.5 h-2.5 opacity-50" />
                      Update: {new Date(coin.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
              </div>
            </div>
          </div>
        </TableCell>

        <TableCell>
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg border-2",
                coin.score >= 70
                  ? "bg-[#0ecb81]/5 text-[#0ecb81] border-[#0ecb81]/20"
                  : coin.score >= 50
                    ? "bg-orange-500/5 text-orange-500 border-orange-500/20"
                    : "bg-[#f6465d]/5 text-[#f6465d] border-[#f6465d]/20",
              )}
            >
              {coin.score}
            </div>
            <div className="flex flex-col text-[10px]">
              <span className="text-muted-foreground font-medium">SIGNAL</span>
              <span className="text-muted-foreground font-medium">SCORE</span>
            </div>
          </div>
        </TableCell>

        <TableCell className="text-right">
          <div className="flex flex-col items-end gap-1">
            <span className="text-[14px] font-bold text-foreground tabular-nums" suppressHydrationWarning>
              $
              {displayPrice < 1
                ? displayPrice.toFixed(6)
                : displayPrice.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            </span>
          </div>
        </TableCell>

        <TableCell className="text-right">
          <FormatPercent val={coin.change1h} />
        </TableCell>

        <TableCell className="text-right">
          <FormatPercent val={coin.change24h} />
        </TableCell>

        <TableCell className="text-right">
          <span className="text-[13px] font-bold text-foreground tabular-nums">
            ${coin.volume24h ? (coin.volume24h / 1e6).toFixed(2) : "0.00"}M
          </span>
        </TableCell>

        <TableCell className="text-right">
          <span className="text-[13px] font-bold text-foreground tabular-nums">
            ${coin.marketCap ? (coin.marketCap / 1e9).toFixed(2) : "0.00"}B
          </span>
        </TableCell>

        <TableCell className="text-right">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "inline-flex items-center justify-center w-10 h-8 rounded-md font-bold text-sm cursor-help select-none transition-colors border",
                    coin.volatility >= 8
                      ? "bg-red-500/10 text-red-500 border-red-500/20"
                      : coin.volatility >= 6
                        ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                        : coin.volatility >= 4
                          ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                          : "bg-green-500/10 text-green-500 border-green-500/20",
                  )}
                >
                  {coin.volatility.toFixed(1)}
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-popover text-popover-foreground border-border p-3 shadow-xl max-w-[250px] z-50">
                <div className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-left">
                  {coin.volatilityTooltip || "No volatility data"}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
      </TableRow >
    );
  },
);

SignalRow.displayName = "SignalRow";

const BentoHeader = ({ signals }: { signals: SignalData[] }) => {
  const buySignals = signals.filter((s) => s.signalType === "BUY").length;
  const sellSignals = signals.filter((s) => s.signalType === "SELL").length;
  const avgScore =
    signals.length > 0
      ? Math.round(
        signals.reduce((sum, s) => sum + s.score, 0) / signals.length,
      )
      : 0;
  const topGainer =
    signals.length > 0
      ? signals.reduce(
        (max, s) => (s.change24h > max.change24h ? s : max),
        signals[0],
      )
      : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="gecko-card p-4 border-l-4 border-l-[#0ecb81] bg-[#0ecb81]/5">
        <div className="flex items-center justify-between mb-2">
          <TrendingUp className="text-[#0ecb81]" size={20} />
          <Badge className="bg-[#0ecb81]/20 text-[#0ecb81] text-[10px] font-bold">
            BULLISH
          </Badge>
        </div>
        <div className="space-y-1">
          <p className="text-3xl font-black text-[#0ecb81]">{buySignals}</p>
          <p className="text-[11px] font-bold text-muted-foreground uppercase">
            Buy Signals Detected
          </p>
        </div>
      </div>

      <div className="gecko-card p-4 border-l-4 border-l-[#f6465d] bg-[#f6465d]/5">
        <div className="flex items-center justify-between mb-2">
          <TrendingDown className="text-[#f6465d]" size={20} />
          <Badge className="bg-[#f6465d]/20 text-[#f6465d] text-[10px] font-bold">
            BEARISH
          </Badge>
        </div>
        <div className="space-y-1">
          <p className="text-3xl font-black text-[#f6465d]">{sellSignals}</p>
          <p className="text-[11px] font-bold text-muted-foreground uppercase">
            Sell Signals Detected
          </p>
        </div>
      </div>

      <div className="gecko-card p-4 border-l-4 border-l-primary bg-primary/5">
        <div className="flex items-center justify-between mb-2">
          <Calculator className="text-primary" size={20} />
          <Badge className="bg-primary/20 text-primary text-[10px] font-bold">
            AVG SCORE
          </Badge>
        </div>
        <div className="space-y-1">
          <p className="text-3xl font-black text-primary">{avgScore}</p>
          <p className="text-[11px] font-bold text-muted-foreground uppercase">
            Average Signal Score
          </p>
        </div>
      </div>

      <div className="gecko-card p-4 border-l-4 border-l-orange-500 bg-orange-500/5">
        <div className="flex items-center justify-between mb-2">
          <Trophy className="text-orange-500" size={20} />
          <Badge className="bg-orange-500/20 text-orange-500 text-[10px] font-bold">
            TOP
          </Badge>
        </div>
        <div className="space-y-1">
          {topGainer ? (
            <>
              <p className="text-xl font-black text-orange-500">
                {topGainer.symbol}
              </p>
              <p className="text-[11px] font-bold text-muted-foreground uppercase">
                +{topGainer.change24h.toFixed(2)}% (24h)
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-black text-orange-500">N/A</p>
              <p className="text-[11px] font-bold text-muted-foreground uppercase">
                No Data
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function SignalsTerminal({
  title,
  description,
  fetchAction,
  initialData = [],
}: {
  title: string;
  description: string;
  fetchAction?: (timeframe?: string) => Promise<SignalData[]>;
  initialData?: SignalData[];
}) {
  const [signals, setSignals] = useState<SignalData[]>(initialData);
  const [loading, setLoading] = useState(initialData.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [newSignalIds, setNewSignalIds] = useState<Set<string>>(new Set());
  const [signalHistory, setSignalHistory] = useState<Map<string, number>>(new Map());
  const { enabled: alertsEnabled, toggleAlerts, triggerAlert } = useAlertSystem();

  // Timeframe
  const [timeframe, setTimeframe] = useState("1h");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, timeframe]);

  // Daily reset at 5:30 AM IST
  useEffect(() => {
    const checkAndResetHistory = () => {
      try {
        const lastReset = localStorage.getItem('coinpree_last_reset');

        // Get current time in IST
        const now = new Date();
        const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

        // Calculate reset time for TODAY (5:30 AM IST)
        const todayReset = new Date(istDate);
        todayReset.setHours(5, 30, 0, 0);

        // If current time is BEFORE 5:30 AM, the reset time was yesterday 5:30 AM
        // behave as if the "trading day" started yesterday at 5:30
        if (istDate < todayReset) {
          todayReset.setDate(todayReset.getDate() - 1);
        }

        // Check if we need to reset
        if (lastReset) {
          const lastResetTimestamp = parseInt(lastReset);
          // Convert last reset timestamp to IST Date for comparison
          const lastResetDate = new Date(lastResetTimestamp);
          const lastResetDateIST = new Date(lastResetDate.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

          // If the last reset was BEFORE the current trading day's start time, we must reset
          if (lastResetDateIST < todayReset) {
            console.log('🔄 Daily reset at 5:30 AM IST - Clearing signal history');
            localStorage.removeItem('coinpree_signal_history');
            localStorage.setItem('coinpree_last_reset', now.getTime().toString());
            setSignalHistory(new Map());
            // Optionally clear current displayed signals if desired, or let them stay until refresh
            // setSignals([]); 
          }
        } else {
          // First time - set last reset to now
          localStorage.setItem('coinpree_last_reset', now.getTime().toString());
        }
      } catch (error) {
        console.warn('Error checking reset:', error);
      }
    };

    // Load existing history from localStorage
    try {
      const stored = localStorage.getItem('coinpree_signal_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        const historyMap = new Map<string, number>(Object.entries(parsed));
        setSignalHistory(historyMap);
      }
    } catch (error) {
      console.warn('Error loading signal history:', error);
    }

    // Check reset on mount
    checkAndResetHistory();

    // Check every minute for reset
    const interval = setInterval(checkAndResetHistory, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        if (document.hidden && !alertsEnabled) return; // Skip background scans unless alerts are on
        setRefreshing(true);
      }

      const action = fetchAction || getMACrossoverSignals;
      // @ts-ignore - Dynamic dispatch
      const newData = await action(timeframe);

      if (!Array.isArray(newData)) {
        console.warn("Invalid data received:", newData);
        return;
      }

      const now = Date.now();
      const existingSignals = new Map<string, SignalData>();
      // Only keep existing signals if they match the current timeframe
      signals
        .filter(s => s.timeframe === timeframe)
        .forEach(s => existingSignals.set(`${s.coinId}-${s.signalType}-${s.crossoverTimestamp}`, s));

      const newIds = new Set<string>();
      const updatedSignals: SignalData[] = newData.map(s => {
        const key = `${s.coinId}-${s.signalType}-${s.crossoverTimestamp}`;
        const existing = existingSignals.get(key);
        if (!existing) newIds.add(key);

        return {
          ...s,
          firstSeen: existing?.firstSeen || s.crossoverTimestamp || s.timestamp || now,
          lastUpdate: now
        };
      });

      // Merge updated signals back into the main list
      updatedSignals.forEach(s => existingSignals.set(`${s.coinId}-${s.signalType}-${s.crossoverTimestamp}`, s));
      const finalSignals = Array.from(existingSignals.values()).sort((a, b) => {
        const timeB = b.crossoverTimestamp || b.timestamp || 0;
        const timeA = a.crossoverTimestamp || a.timestamp || 0;
        return timeB - timeA;
      });

      setSignals(finalSignals);

      if (newIds.size > 0) {
        setNewSignalIds(new Set(Array.from(newIds).map(id => `${id}-${now}`)));
        setTimeout(() => setNewSignalIds(new Set()), 5000);

        if (!isInitialLoad) {
          const firstNew = updatedSignals.find(s => newIds.has(`${s.coinId}-${s.signalType}`));
          if (firstNew) {
            console.log(`🔔 Alert triggering for ${firstNew.symbol}`);
            triggerAlert(
              `New Signal: ${firstNew.symbol}`,
              `${firstNew.signalType} setup detected at $${firstNew.currentPrice.toFixed(4)}`
            );
          }
        }
      }

      setLastUpdate(new Date());
    } catch (err) {
      console.warn("Error fetching signals:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(true); // Initial load
    const interval = setInterval(() => fetchData(false), 60000); // Check for new signals every 60 seconds
    return () => clearInterval(interval);
  }, [timeframe]); // Refetch when timeframe changes

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const filteredSignals = useMemo(() => {
    return signals.filter(
      (s) =>
        s.symbol?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.fullData?.name?.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [signals, searchQuery]);

  // Calculate pagination derived state
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredSignals
    ? filteredSignals.slice(indexOfFirstItem, indexOfLastItem)
    : [];
  const totalPages = filteredSignals
    ? Math.ceil(filteredSignals.length / itemsPerPage)
    : 0;



  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0">
          <div>
            <h1 className="text-lg md:text-3xl font-black text-foreground tracking-tighter uppercase leading-tight">
              {title}
            </h1>
            <p className="text-[10px] md:text-[12px] font-bold text-muted-foreground uppercase opacity-80">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            <div className="flex bg-muted rounded-lg p-1 border border-border shrink-0">
              {["5m", "15m", "30m", "1h", "4h", "1d"].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={cn(
                    "px-3 py-1 text-[11px] font-bold rounded-md transition-all whitespace-nowrap",
                    timeframe === tf
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {refreshing ? (
                <>
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    Updating...
                  </span>
                </>
              ) : (
                <>
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    Live
                  </span>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 gap-2 shrink-0"
            >
              <RefreshCw
                size={14}
                className={cn(refreshing && "animate-spin")}
              />
            </Button>

            <Button
              variant={alertsEnabled ? "default" : "outline"}
              size="sm"
              onClick={toggleAlerts}
              className={cn("h-8 gap-2 shrink-0 font-bold text-[11px]", alertsEnabled ? "bg-primary/20 text-primary border-primary/50 hover:bg-primary/30" : "")}
            >
              {alertsEnabled ? <Bell size={14} className="fill-current" /> : <BellOff size={14} />}
              <span className="hidden sm:inline">ALERTS</span>
            </Button>
          </div>
        </div>

        {/* Mobile Stats Grid (4 Columns as requested) */}
        <div className="grid grid-cols-2 gap-3 md:hidden">
          {/* Buy Signals */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between h-28 relative overflow-hidden">
            <div className="absolute top-2 right-2 opacity-10">
              <TrendingUp size={40} className="text-[#0ecb81]" />
            </div>
            <div className="flex items-start">
              <TrendingUp size={16} className="text-[#0ecb81]" />
            </div>
            <div>
              <span className="text-3xl font-black text-[#0ecb81] tabular-nums tracking-tight">
                {signals.filter(s => s.signalType === 'BUY').length}
              </span>
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none mt-1">
                Buy Signals Detected
              </p>
            </div>
          </div>

          {/* Bullish Sentiment / Placeholder */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between h-28 relative overflow-hidden">
            <div className="absolute top-2 right-2">
              <Badge className="bg-[#0ecb81]/20 text-[#0ecb81] hover:bg-[#0ecb81]/20 border-0 font-bold text-[9px] px-2">BULLISH</Badge>
            </div>
            <div className="mt-auto">
              {/* Placeholder content or stats */}
              <span className="text-[10px] font-bold text-muted-foreground uppercase leading-none block">
                Market Sentiment
              </span>
            </div>
          </div>

          {/* Sell Signals */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between h-28 relative overflow-hidden">
            <div className="absolute top-2 right-2 opacity-10">
              <TrendingDown size={40} className="text-[#f6465d]" />
            </div>
            <div className="flex items-start">
              <TrendingDown size={16} className="text-[#f6465d]" />
            </div>
            <div>
              <span className="text-3xl font-black text-[#f6465d] tabular-nums tracking-tight">
                {signals.filter(s => s.signalType === 'SELL').length}
              </span>
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none mt-1">
                Sell Signals Detected
              </p>
            </div>
          </div>

          {/* Bearish Sentiment / Placeholder */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between h-28 relative overflow-hidden">
            <div className="absolute top-2 right-2">
              <Badge className="bg-[#f6465d]/20 text-[#f6465d] hover:bg-[#f6465d]/20 border-0 font-bold text-[9px] px-2">BEARISH</Badge>
            </div>
            <div className="mt-auto">
              {/* Placeholder content or stats */}
              <span className="text-[10px] font-bold text-muted-foreground uppercase leading-none block">
                Market Sentiment
              </span>
            </div>
          </div>

          {/* Avg Score */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between h-28 relative overflow-hidden">
            <div className="absolute top-2 right-2">
              <Calculator size={40} className="text-primary opacity-10" />
            </div>
            <div className="flex items-start">
              <Calculator size={16} className="text-primary" />
            </div>
            <div>
              <span className="text-3xl font-black text-primary tabular-nums tracking-tight">
                {Math.round(signals.reduce((acc, curr) => acc + curr.score, 0) / (signals.length || 1))}
              </span>
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none mt-1">
                Avg Signal Score
              </p>
            </div>
          </div>

          {/* Top Performer */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between h-28 relative overflow-hidden">
            <div className="absolute top-2 right-2">
              <Trophy size={40} className="text-orange-500 opacity-10" />
            </div>
            <div className="flex items-start">
              <Trophy size={16} className="text-orange-500" />
            </div>
            <div>
              {signals.length > 0 ? (
                <>
                  <span className="text-3xl font-black text-orange-500 tabular-nums tracking-tight uppercase">
                    {signals[0].symbol.slice(0, 3)}
                  </span>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none mt-1">
                    {(signals[0].change24h > 0 ? "+" : "") + signals[0].change24h.toFixed(2)}%
                  </p>
                </>
              ) : (
                <span className="text-xl font-bold text-muted-foreground">--</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <BentoHeader signals={signals} />
      </div>

      <div className="gecko-card flex flex-col md:flex-row items-center justify-between p-3 gap-4">
        <div className="flex items-center gap-2">
          <div className="flex bg-muted/60 p-1 rounded-lg border border-border">
            {["15m", "1h", "4h", "1d"].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                disabled={loading || refreshing}
                className={cn(
                  "px-4 py-1.5 rounded-md text-[11px] font-bold transition-all",
                  timeframe === tf
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  (loading || refreshing) && "opacity-50 cursor-not-allowed",
                )}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full md:w-auto md:min-w-[300px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={14}
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by symbol or name..."
            className="h-9 w-full pl-9 pr-4 rounded-lg border border-border bg-background text-[13px] font-medium outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
          <Activity size={14} />
          <span>{filteredSignals.length} Signals</span>
        </div>
      </div>

      <div className="gecko-card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <Skeleton className="h-10 w-full" />
            </div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[250px]" />
                  <Skeleton className="h-4 w-[200px]" />
                </div>
                <div className="ml-auto space-y-2">
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <AlertTriangle className="text-muted-foreground" size={40} />
              <p className="text-sm font-bold text-muted-foreground">
                {searchQuery
                  ? "No signals match your search"
                  : "No signals detected"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile View: Cards */}
            <div className="md:hidden space-y-3">
              {currentItems.map((coin) => {
                const signalKey = `${coin.coinId}-${coin.timestamp}`;
                const isNew = newSignalIds.has(signalKey);

                return (
                  <div
                    key={signalKey}
                    className={cn(
                      "gecko-card p-4 flex flex-col gap-3",
                      isNew && "animate-pulse border-primary/50 bg-primary/5"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden border border-border">
                          {coin.image || coin.fullData?.image ? (
                            <img
                              src={coin.image || coin.fullData?.image}
                              alt={coin.symbol}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[12px] font-bold text-muted-foreground">{coin.symbol.slice(0, 2)}</span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-foreground">{coin.symbol}</span>
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-bold border-border/50">#{coin.score}</Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-medium">{coin.name || coin.fullData?.name}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[15px] font-bold text-foreground" suppressHydrationWarning>
                          ${coin.currentPrice < 1 ? coin.currentPrice.toFixed(6) : coin.currentPrice.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                        </span>
                        <FormatPercent val={coin.change24h} />
                      </div>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-3 grid grid-cols-2 gap-4 border border-border/50">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase">Signal Type</span>
                        <Badge
                          className={cn(
                            "font-bold text-[11px] px-2 py-1 uppercase tracking-wide w-fit",
                            coin.signalType === "BUY"
                              ? "bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20"
                              : "bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20"
                          )}
                        >
                          {coin.signalType === "BUY" ? "🟢 BUY" : "🔴 SELL"}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase">Detected</span>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className="text-[10px] font-mono font-bold text-foreground border-border/50 bg-background/50" suppressHydrationWarning>
                            {typeof window !== 'undefined' && new Date(coin.crossoverTimestamp || coin.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Badge>
                          <div className="flex flex-col items-end text-[9px] text-muted-foreground/60">
                            {/* @ts-ignore */}
                            {coin.firstSeen && (
                              <span>First: {new Date(coin.firstSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                            {/* @ts-ignore */}
                            {coin.lastUpdate && (
                              <span>Update: {new Date(coin.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground font-medium">Volume</span>
                        <span className="text-[11px] font-bold text-foreground">${coin.volume24h ? (coin.volume24h / 1e6).toFixed(1) : "0.0"}M</span>
                      </div>
                      <div className="flex flex-col text-center">
                        <span className="text-[10px] text-muted-foreground font-medium">Volatility</span>
                        <span className="text-[11px] font-bold text-orange-500">{coin.volatility.toFixed(2)}%</span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] text-muted-foreground font-medium">Score</span>
                        <span className="text-[11px] font-bold text-primary">{coin.score}/100</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="gecko-table-header">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead className="w-[180px]">Coin</TableHead>
                    <TableHead>
                      <HeaderTooltip title="Signal & Timing" content="Type of crossover (Golden/Death) and when it was first detected." />
                    </TableHead>
                    <TableHead>
                      <HeaderTooltip title="Score" content="Algo score (0-100) based on trend strength, RSI, and volatility." />
                    </TableHead>
                    <TableHead className="text-right">
                      <HeaderTooltip title="Price" content="Current market price in USDT (Futures) or USD (Spot)." align="right" />
                    </TableHead>
                    <TableHead className="text-right">
                      <HeaderTooltip title="1H" content="Price change in the last 1 hour." align="right" />
                    </TableHead>
                    <TableHead className="text-right">
                      <HeaderTooltip title="24H" content="Price change in the last 24 hours." align="right" />
                    </TableHead>
                    <TableHead className="text-right">
                      <HeaderTooltip title="Volume" content="24-hour trading volume in USD." align="right" />
                    </TableHead>
                    <TableHead className="text-right">
                      <HeaderTooltip title="Market Cap" content="Total market capitalization." align="right" />
                    </TableHead>
                    <TableHead className="text-right">
                      <HeaderTooltip title="Volatility" content="Volatility score (0-10) based on ATR and price range." align="right" />
                    </TableHead>

                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems.map((coin, idx) => {
                    const signalKey = `${coin.coinId}-${coin.timestamp}`;
                    const isNew = newSignalIds.has(signalKey);

                    return (
                      <SignalRow
                        key={signalKey}
                        coin={coin}
                        index={indexOfFirstItem + idx}
                        isNew={isNew}
                        firstSeen={signalHistory.get(`${coin.coinId}-${coin.signalType}`)}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="text-[11px] font-bold text-muted-foreground">
                Showing {indexOfFirstItem + 1}-
                {Math.min(indexOfLastItem, filteredSignals.length)} of{" "}
                {filteredSignals.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className="h-8 w-8 p-0"
                >
                  &lt;
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p = i + 1;
                    if (totalPages > 5 && currentPage > 3) {
                      p = currentPage - 3 + i;
                      if (p > totalPages) p = totalPages - (4 - i);
                    }
                    return (
                      <Button
                        key={p}
                        variant={currentPage === p ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setCurrentPage(p)}
                        className={cn(
                          "h-8 w-8 p-0 text-[11px] font-bold",
                          currentPage === p ? "bg-primary text-white" : "",
                        )}
                      >
                        {p}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 p-0"
                >
                  &gt;
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SignalsTerminal;
