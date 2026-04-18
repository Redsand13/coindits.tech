"use client";

import React, { useState, useEffect, memo, useMemo, useCallback } from "react";
import {
    Activity,
    RefreshCw,
    Search,
    Bell,
    BellOff,
    HelpCircle,
    Copy,
    Filter,
    TrendingUp,
    TrendingDown,
    Database,
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { getAdvancedSignalsAction, getStoredAdvancedSignalsAction } from "@/app/actions";
import { TinyCandle } from "@/components/ui/sparkline";
import type { AdvancedSignal, Timeframe } from "@/lib/services/advanced-algo";

interface AdvancedSignalsTerminalProps {
    initialData?: AdvancedSignal[];
    title: string;
    description: string;
}

const EXCHANGES = [
    { id: "binance_futures", name: "Binance Futures", icon: "https://bin.bnbstatic.com/static/images/common/favicon.ico", status: 'active' },
    { id: "bybit", name: "Bybit", icon: "https://www.bybit.com/favicon.ico", status: 'active' },
    { id: "bitget", name: "Bitget", icon: "https://www.bitget.com/favicon.ico", status: 'active' },
    { id: "coinbase", name: "Coinbase", icon: "https://www.coinbase.com/favicon.ico", status: 'active' },
    { id: "okx", name: "OKX", icon: "https://www.okx.com/favicon.ico", status: 'coming_soon' },
];

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "2h", "4h", "1d"];

const SignalRow = memo(({
    signal,
    idx,
    onClick
}: {
    signal: AdvancedSignal,
    idx: number,
    onClick: () => void
}) => {
    return (
        <TableRow
            className="group hover:bg-muted/40 transition-colors border-border/40 cursor-pointer text-sm"
            onClick={onClick}
        >
            <TableCell className="pl-6 py-2.5 w-[140px] min-w-[140px]">
                <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[10px] text-muted-foreground leading-tight">
                        {new Date(signal.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="font-mono text-xs font-bold text-foreground">
                        {new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                </div>
            </TableCell>
            <TableCell className="py-2.5 font-medium w-[220px] min-w-[220px]">
                <div className="flex items-center gap-3">
                    {signal.image && (
                        <img
                            src={signal.image}
                            alt={signal.symbol}
                            className="w-8 h-8 rounded-full bg-muted border border-border/50"
                        />
                    )}
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{signal.symbol}</span>
                            {signal.score >= 90 && (
                                <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {signal.reason && signal.reason.map((r, i) => (
                                <span
                                    key={i}
                                    className={cn(
                                        "text-[9px] font-medium text-muted-foreground/80 bg-muted/50 px-1 rounded-[3px] whitespace-nowrap",
                                        i > 1 && "hidden 2xl:inline-block"
                                    )}
                                >
                                    {r}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </TableCell>
            <TableCell className="py-2.5 hidden lg:table-cell w-[130px] min-w-[130px]">
                <div className="w-[100px] h-[24px]">
                    {signal.chartData && signal.chartData.length > 0 ? (
                        <TinyCandle data={signal.chartData} width={100} height={24} />
                    ) : (
                        <div className="h-full w-full bg-muted/20 animate-pulse rounded" />
                    )}
                </div>
            </TableCell>
            <TableCell className="py-2.5 w-[90px] min-w-[90px]">
                <Badge
                    variant="outline"
                    className={cn(
                        "px-2 py-0.5 text-[10px] font-extrabold border-0 ring-1 ring-inset uppercase tracking-wider",
                        signal.type === "BUY"
                            ? "bg-green-500/10 text-green-500 ring-green-500/20"
                            : "bg-red-500/10 text-red-500 ring-red-500/20"
                    )}
                >
                    {signal.type}
                </Badge>
            </TableCell>
            <TableCell className="py-2.5 w-[160px] hidden xl:table-cell">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-muted-foreground">Confidence</span>
                        <span className="font-bold text-foreground">{signal.score}%</span>
                    </div>
                    <Progress value={signal.score} className="h-1 bg-muted/50" />
                </div>
            </TableCell>
            <TableCell className="py-2.5 text-right w-[110px]">
                <span className="font-mono font-bold text-foreground">
                    ${signal.entryPrice < 1 ? signal.entryPrice.toFixed(6) : signal.entryPrice.toLocaleString()}
                </span>
            </TableCell>
            <TableCell className="py-2.5 text-right w-[110px] hidden xl:table-cell">
                <span className="font-mono text-red-500/90 font-medium">
                    ${signal.stopLoss < 1 ? signal.stopLoss.toFixed(6) : signal.stopLoss.toLocaleString()}
                </span>
            </TableCell>
            <TableCell className="py-2.5 text-right w-[110px]">
                <span className="font-mono text-green-500/90 font-medium">
                    ${signal.takeProfit < 1 ? signal.takeProfit.toFixed(6) : signal.takeProfit.toLocaleString()}
                </span>
            </TableCell>
            <TableCell className="py-2.5 text-center w-[80px] hidden 2xl:table-cell">
                <Badge variant="outline" className="text-[10px] font-mono border-border/50">
                    1:{signal.rrRatio.toFixed(1)}
                </Badge>
            </TableCell>
            <TableCell className="py-2.5 text-right pr-6 w-[60px]">
                <div className="flex items-center justify-end">
                    <div className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all">
                        <Copy className="h-3.5 w-3.5" />
                    </div>
                </div>
            </TableCell>
        </TableRow>
    );
});

SignalRow.displayName = "SignalRow";

export default function AdvancedSignalsTerminal({
    initialData,
    title,
    description,
}: AdvancedSignalsTerminalProps) {
    const [selectedExchange, setSelectedExchange] = useState<string>("binance_futures");
    const [signals, setSignals] = useState<AdvancedSignal[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [timeframe, setTimeframe] = useState<Timeframe>("15m");
    const [filterType, setFilterType] = useState<"ALL" | "BUY" | "SELL">("ALL");
    const [minScore, setMinScore] = useState<number>(60);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const { enabled: alertsEnabled, toggleAlerts, triggerAlert } = useAlertSystem();

    // Dedup helper — keyed by symbol+type+minute-bucket so stored→live never double-adds
    const mergeSignals = useCallback((incoming: AdvancedSignal[], existing: AdvancedSignal[]) => {
        const existingKeys = new Set(
            existing.map(s => `${s.symbol}-${s.type}-${Math.floor(s.timestamp / 60_000)}`)
        );
        const fresh = incoming.filter(
            s => !existingKeys.has(`${s.symbol}-${s.type}-${Math.floor(s.timestamp / 60_000)}`)
        );
        return [...fresh, ...existing];
    }, []);

    const fetchSignals = useCallback(async (exchangeId: string) => {
        if (document.hidden && !exchangeId.includes("-init") && !alertsEnabled) return;

        const cleanId = exchangeId.replace("-init", "");
        setLoading(true);
        try {
            const data = await getAdvancedSignalsAction(cleanId, timeframe);
            if (data.length === 0) return;

            const now = Date.now();
            const incoming = data.map(s => ({ ...s, timestamp: now }));

            setSignals(prev => mergeSignals(incoming, prev));

            triggerAlert(
                `New Signal: ${incoming[0].symbol}`,
                `${incoming[0].type} at $${incoming[0].entryPrice.toFixed(4)} — ${incoming.length} signal(s) detected`
            );
        } catch (error) {
            console.error("Failed to fetch signals", error);
        } finally {
            setLoading(false);
        }
    }, [timeframe, alertsEnabled, mergeSignals, triggerAlert]);

    useEffect(() => {
        if (!selectedExchange) return;
        let cancelled = false;

        setSignals([]);
        setHistoryLoaded(false);

        const init = async () => {
            // 1. Load full DB history first (fast SQLite read)
            const stored = await getStoredAdvancedSignalsAction(selectedExchange, timeframe);
            if (cancelled) return;
            if (stored.length > 0) setSignals(stored);
            setHistoryLoaded(true);

            // 2. Kick off live scan after history is in state
            if (!cancelled) fetchSignals(selectedExchange + "-init");
        };

        init();
        const interval = setInterval(() => fetchSignals(selectedExchange), 60_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [selectedExchange, timeframe]);

    const handleLoadHistory = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const stored = await getStoredAdvancedSignalsAction(selectedExchange, timeframe);
            if (stored.length > 0) {
                setSignals(prev => {
                    const existingKeys = new Set(
                        prev.map(s => `${s.symbol}-${s.type}-${Math.floor(s.timestamp / 60_000)}`)
                    );
                    const newStored = stored.filter(
                        s => !existingKeys.has(`${s.symbol}-${s.type}-${Math.floor(s.timestamp / 60_000)}`)
                    );
                    return [...prev, ...newStored];
                });
            }
        } finally {
            setLoadingHistory(false);
        }
    }, [selectedExchange, timeframe]);

    const filteredSignals = useMemo(() => {
        return signals.filter((signal) => {
            if (filterType !== "ALL" && signal.type !== filterType) return false;
            if (signal.score < minScore) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                if (!signal.symbol.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [signals, searchQuery, filterType, minScore]);

    const stats = useMemo(() => {
        return {
            total: filteredSignals.length,
            buy: filteredSignals.filter(s => s.type === "BUY").length,
            sell: filteredSignals.filter(s => s.type === "SELL").length,
            avgScore: filteredSignals.length > 0
                ? Math.round(filteredSignals.reduce((acc, s) => acc + s.score, 0) / filteredSignals.length)
                : 0
        };
    }, [filteredSignals]);

    const copySignal = useCallback((signal: AdvancedSignal) => {
        const text = `🎯 SIGNAL: ${signal.symbol} (${signal.type})
Entry: $${signal.entryPrice}
TP: $${signal.takeProfit}
SL: $${signal.stopLoss}
Score: ${signal.score}/100`;
        navigator.clipboard.writeText(text);
        toast.success("Signal copied");
    }, []);

    return (
        <TooltipProvider>
            <div className="flex flex-col min-h-screen bg-background text-foreground space-y-4 p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto">
                <div className="space-y-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <Activity className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-bold tracking-tight leading-none md:text-xl">
                                        {title}
                                    </h1>
                                    <p className="text-[10px] text-muted-foreground mt-1 md:text-xs">{description}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {/* DB stats pill */}
                                <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-xl bg-muted/50 border border-border/40 text-[11px] font-mono">
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">STORED</span>
                                        <span className="font-bold text-foreground leading-none">{signals.length}</span>
                                    </div>
                                    <div className="w-px h-6 bg-border/40" />
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">BUY</span>
                                        <span className="font-bold text-green-500 leading-none">{signals.filter(s => s.type === "BUY").length}</span>
                                    </div>
                                    <div className="w-px h-6 bg-border/40" />
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">SELL</span>
                                        <span className="font-bold text-red-500 leading-none">{signals.filter(s => s.type === "SELL").length}</span>
                                    </div>
                                    <div className="w-px h-6 bg-border/40" />
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">DB</span>
                                        <span className={cn("font-bold leading-none", historyLoaded ? "text-primary" : "text-muted-foreground/40")}>
                                            {historyLoaded ? "✓" : "…"}
                                        </span>
                                    </div>
                                </div>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleLoadHistory}
                                    disabled={loadingHistory}
                                    className="h-8 px-3 text-xs gap-1.5"
                                >
                                    <Database className={cn("h-3.5 w-3.5", loadingHistory && "animate-pulse")} />
                                    <span className="hidden md:inline">{loadingHistory ? "Loading…" : "DB History"}</span>
                                </Button>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fetchSignals(selectedExchange + "-init")}
                                    disabled={loading}
                                    className={cn("h-8 px-3 text-xs", loading && "opacity-80")}
                                >
                                    <RefreshCw className={cn("h-3.5 w-3.5 md:mr-2", loading && "animate-spin")} />
                                    <span className="hidden md:inline">Refresh</span>
                                </Button>

                                <Button
                                    variant={alertsEnabled ? "default" : "outline"}
                                    size="sm"
                                    onClick={toggleAlerts}
                                    className={cn("h-8 gap-2 font-bold text-[10px]", alertsEnabled ? "bg-primary/20 text-primary border-primary/50" : "")}
                                >
                                    {alertsEnabled ? <Bell size={14} className="fill-current" /> : <BellOff size={14} />}
                                    <span className="hidden md:inline">ALERTS</span>
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="flex overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
                        <div className="flex items-center gap-2 p-1 bg-muted/40 rounded-xl border border-border/40 w-fit">
                            {EXCHANGES.map(ex => (
                                <button
                                    key={ex.id}
                                    onClick={() => ex.status === 'active' && setSelectedExchange(ex.id)}
                                    disabled={ex.status !== 'active'}
                                    title={ex.status === 'banned' ? 'Temporarily unavailable — API access restricted' : undefined}
                                    className={cn(
                                        "flex items-center px-4 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap",
                                        selectedExchange === ex.id
                                            ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                                            : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                                        (ex.status === "coming_soon" || ex.status === "banned") && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <img
                                        src={ex.icon}
                                        className="w-3.5 h-3.5 mr-2 rounded-full"
                                        alt={ex.name}
                                    />
                                    {ex.name}
                                    {ex.status === "coming_soon" && <span className="ml-1.5 opacity-70 text-[9px] uppercase tracking-wide">Soon</span>}
                                    {ex.status === "banned" && <span className="ml-1.5 opacity-70 text-[9px] uppercase tracking-wide text-red-400">Unavailable</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 p-3 bg-card/60 border border-border/40 rounded-xl backdrop-blur-sm shadow-sm">
                        {/* Row 1: search + timeframe + stats */}
                        <div className="hidden md:grid grid-cols-12 items-center gap-6">
                            <div className="col-span-4 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                                <Input
                                    placeholder="Search symbol..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 h-9 bg-background/40 border-border/50 text-xs w-full focus:bg-background/80 transition-all rounded-lg"
                                />
                            </div>

                            <div className="col-span-4 flex items-center justify-center gap-1.5 p-1 bg-muted/30 rounded-lg border border-border/40 w-fit mx-auto">
                                {TIMEFRAMES.map((tf) => (
                                    <button
                                        key={tf}
                                        onClick={() => setTimeframe(tf)}
                                        className={cn(
                                            "px-4 py-1 text-[10px] font-bold rounded-md transition-all uppercase tracking-widest",
                                            timeframe === tf
                                                ? "bg-background text-foreground shadow-sm ring-1 ring-border/30"
                                                : "text-muted-foreground hover:text-foreground hover:bg-background/20"
                                        )}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>

                            <div className="col-span-4 flex items-center justify-end gap-6 text-[11px] font-mono">
                                <div className="flex flex-col items-end">
                                    <span className="text-muted-foreground/60 uppercase tracking-tighter text-[9px]">TOTAL</span>
                                    <span className="font-bold text-foreground">{stats.total}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-muted-foreground/60 uppercase tracking-tighter text-[9px]">BUY/SELL</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-green-500">{stats.buy}</span>
                                        <span className="opacity-20">/</span>
                                        <span className="font-bold text-red-500">{stats.sell}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-muted-foreground/60 uppercase tracking-tighter text-[9px]">AVG SCORE</span>
                                    <span className="font-bold text-primary">{stats.avgScore}</span>
                                </div>
                            </div>
                        </div>

                        {/* Row 2: filters */}
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/30">
                            <Filter className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />

                            {/* Direction */}
                            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">Direction</span>
                            <div className="flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-lg border border-border/40">
                                {(["ALL", "BUY", "SELL"] as const).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setFilterType(t)}
                                        className={cn(
                                            "flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded-md transition-colors outline-none select-none uppercase tracking-widest",
                                            filterType === t
                                                ? t === "BUY"
                                                    ? "bg-green-500/20 text-green-500"
                                                    : t === "SELL"
                                                        ? "bg-red-500/20 text-red-500"
                                                        : "bg-background text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                                        )}
                                    >
                                        {t === "BUY" && <TrendingUp className="h-3 w-3" />}
                                        {t === "SELL" && <TrendingDown className="h-3 w-3" />}
                                        {t}
                                    </button>
                                ))}
                            </div>

                            {/* Divider */}
                            <span className="w-px h-4 bg-border/40 mx-1" />

                            {/* Min Score */}
                            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">Min Score</span>
                            <div className="flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-lg border border-border/40">
                                {[60, 70, 80, 90].map((score) => (
                                    <button
                                        key={score}
                                        type="button"
                                        onClick={() => setMinScore(score)}
                                        className={cn(
                                            "px-3 py-1 text-[10px] font-bold rounded-md transition-colors outline-none select-none",
                                            minScore === score
                                                ? "bg-background text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                                        )}
                                    >
                                        {score}+
                                    </button>
                                ))}
                            </div>

                            {/* Reset — only shown when filters differ from defaults */}
                            {(filterType !== "ALL" || minScore !== 60) && (
                                <button
                                    type="button"
                                    onClick={() => { setFilterType("ALL"); setMinScore(60); }}
                                    className="ml-1 flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md outline-none select-none text-muted-foreground border border-border/50 hover:border-border hover:text-foreground transition-colors"
                                >
                                    <RefreshCw className="h-2.5 w-2.5" />
                                    Reset
                                </button>
                            )}

                        </div>
                    </div>

                    <Card className="border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden shadow-xl rounded-xl">
                        <CardContent className="p-0">
                            <div className="overflow-x-auto overflow-y-auto max-h-[70vh] scrollbar-thin scrollbar-thumb-muted-foreground/20">
                                {loading && signals.length === 0 ? (
                                    <div className="p-8 space-y-4">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <Skeleton key={i} className="h-16 w-full rounded-lg" />
                                        ))}
                                    </div>
                                ) : (
                                    <Table className="relative">
                                        <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-md">
                                            <TableRow className="border-border/40 hover:bg-transparent h-10">
                                                <TableHead className="pl-6 h-10 w-[145px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1 cursor-help">
                                                            Time <HelpCircle className="h-3 w-3 opacity-50" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p>Signal generation time & history</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TableHead>
                                                <TableHead className="h-10 w-[220px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1 cursor-help">
                                                            Pair & Reason <HelpCircle className="h-3 w-3 opacity-50" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p>Asset and primary detection factors</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TableHead>
                                                <TableHead className="h-10 w-[130px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                                                    Chart Preview
                                                </TableHead>
                                                <TableHead className="h-10 w-[90px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1 cursor-help">
                                                            Signal <HelpCircle className="h-3 w-3 opacity-50" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p>Trade direction (Buy/Sell)</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TableHead>
                                                <TableHead className="w-[160px] h-10 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hidden xl:table-cell text-left">
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1 cursor-help">
                                                            Confidence <HelpCircle className="h-3 w-3 opacity-50" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p>Algo score (0-100) based on trend, RSI, volatility</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TableHead>
                                                <TableHead className="text-right h-10 w-[110px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1 justify-end cursor-help ml-auto">
                                                            Entry <HelpCircle className="h-3 w-3 opacity-50" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p>Optimal price level to open the trade</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TableHead>
                                                <TableHead className="text-right h-10 w-[110px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground hidden xl:table-cell">
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1 justify-end cursor-help ml-auto">
                                                            Stop Loss <HelpCircle className="h-3 w-3 opacity-50" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p>Automated exit to limit potential loss</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TableHead>
                                                <TableHead className="text-right h-10 w-[110px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1 justify-end cursor-help ml-auto">
                                                            Target <HelpCircle className="h-3 w-3 opacity-50" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p>Take profit level for this trade setup</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TableHead>
                                                <TableHead className="text-center w-[80px] h-10 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hidden 2xl:table-cell">
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1 justify-center cursor-help">
                                                            R:R <HelpCircle className="h-3 w-3 opacity-50" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p>Risk to Reward Ratio (Target / Stop Loss)</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TableHead>
                                                <TableHead className="text-right w-[60px] pr-6 h-10"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredSignals.map((signal, idx) => (
                                                <SignalRow
                                                    key={`${signal.symbol}-${signal.type}-${idx}`}
                                                    signal={signal}
                                                    idx={idx}
                                                    onClick={() => copySignal(signal)}
                                                />
                                            ))}
                                            {filteredSignals.length === 0 && !loading && (
                                                <TableRow>
                                                    <TableCell colSpan={10} className="h-64 text-center">
                                                        <div className="flex flex-col items-center justify-center gap-3 opacity-40">
                                                            <Activity className="h-10 w-10" />
                                                            <p className="text-sm font-medium">No signals detected for {selectedExchange} on {timeframe}</p>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </TooltipProvider>
    );
}
