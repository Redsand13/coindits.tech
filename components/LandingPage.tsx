"use client";

import React, { useEffect, useState, memo } from "react";
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Zap,
    ArrowUpRight,
    ArrowDownRight,
    ChevronRight,
    Filter,
    ShieldCheck,
    Globe,
    Lock,
    Star,
    LayoutGrid,
    Search,
    MessageSquare,
    Play
} from "lucide-react";
import { getLandingPageData } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// --- Sub-components ---

const Gauge = ({ value, label }: { value: number, label: string }) => {
    const angle = (value / 100) * 180 - 180;
    return (
        <div className="flex flex-col items-center">
            <div className="relative w-24 h-12 overflow-hidden">
                <div className="absolute top-0 left-0 w-24 h-24 rounded-full border-[6px] border-white/5" />
                <div className="absolute top-0 left-0 w-24 h-24 rounded-full border-[6px] border-primary border-b-transparent border-l-transparent rotate-45 opacity-20" />
                <motion.div
                    initial={{ rotate: -180 }}
                    animate={{ rotate: angle }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="absolute top-0 left-0 w-24 h-24 rounded-full border-[6px] border-primary border-b-transparent border-l-transparent origin-center z-10"
                    style={{ borderRightColor: 'var(--primary)', borderTopColor: 'var(--primary)' }}
                />
            </div>
            <div className="mt-1 text-center font-bold text-lg leading-none">{value}</div>
            <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-tight">{label}</div>
        </div>
    );
};

const BentoCard = ({ title, value, change, trend, chartData, index, type = "sparkline" }: any) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05 }}
        className="relative group bg-card/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 hover:bg-card/60 transition-all duration-300 shadow-xl"
    >
        <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-1 group/title cursor-pointer">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider group-hover/title:text-foreground transition-colors">{title}</span>
                <ChevronRight size={12} className="text-muted-foreground/50 group-hover/title:text-primary transition-colors" />
            </div>
        </div>

        <div className="flex items-end justify-between">
            <div className="space-y-1">
                <div className="text-2xl font-black tracking-tight">{value}</div>
                {change && (
                    <div className={cn(
                        "text-xs font-bold flex items-center gap-0.5",
                        trend === 'up' ? "text-green-500" : trend === 'down' ? "text-red-500" : "text-muted-foreground"
                    )}>
                        {trend === 'up' ? <ArrowUpRight size={12} /> : trend === 'down' ? <ArrowDownRight size={12} /> : null}
                        {change}
                    </div>
                )}
            </div>

            {type === "sparkline" ? (
                <div className="h-10 w-24 opacity-60 group-hover:opacity-100 transition-opacity">
                    <Sparkline
                        data={chartData || [20, 25, 22, 28, 24, 30]}
                        width={96}
                        height={40}
                        color={trend === 'up' ? "#22c55e" : trend === 'down' ? "#ef4444" : "#ffffff44"}
                    />
                </div>
            ) : type === "gauge" ? (
                <Gauge value={index === 2 ? 12 : 32} label={index === 2 ? "Extreme Fear" : "Bitcoin"} />
            ) : null}
        </div>
    </motion.div>
);

const CategoryTabs = () => {
    const tabs = ["Top", "Trending", "Watchlist", "Prediction Markets", "Most Visited", "New", "More"];
    const [active, setActive] = useState("Top");

    return (
        <div className="flex items-center gap-8 border-b border-white/5 pb-4 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
                <button
                    key={tab}
                    onClick={() => setActive(tab)}
                    className={cn(
                        "text-sm font-bold transition-all relative whitespace-nowrap",
                        active === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
                    )}
                >
                    {tab}
                    {active === tab && (
                        <motion.div layoutId="activeTab" className="absolute -bottom-[17px] left-0 right-0 h-1 bg-primary rounded-full z-10" />
                    )}
                </button>
            ))}
        </div>
    );
};

const NetworkFilters = () => {
    const networks = [
        { name: "All Networks", icon: Globe },
        { name: "BSC", icon: Activity },
        { name: "Solana", icon: Zap },
        { name: "Base", icon: LayoutGrid },
        { name: "Ethereum", icon: Globe },
    ];
    return (
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2">
            {networks.map((n, i) => (
                <button key={i} className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 text-[11px] font-bold transition-all hover:bg-white/5 whitespace-nowrap",
                    i === 0 ? "bg-white/10 border-white/10" : "bg-transparent"
                )}>
                    {i > 0 && <n.icon size={12} className="text-primary" />}
                    {n.name}
                </button>
            ))}
            <div className="h-4 w-px bg-white/10 mx-2" />
            <span className="text-[11px] font-bold text-muted-foreground uppercase cursor-pointer hover:text-foreground transition-colors">More</span>
        </div>
    );
};

const NarrativePills = () => {
    const narratives = [
        { text: "Latest Macro Signals", color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
        { text: "Bullish Accumulation Zones", color: "bg-green-500/10 text-green-400 border-green-500/20" },
        { text: "Institutional Order Flow", color: "bg-primary/10 text-primary border-primary/20" },
        { text: "Volatility Heatmap", color: "bg-red-500/10 text-red-400 border-red-500/20" },
    ];
    return (
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2">
            {narratives.map((n, i) => (
                <button key={i} className={cn(
                    "flex items-center gap-2.5 px-4 py-2 rounded-xl font-bold text-[11px] whitespace-nowrap transition-all hover:bg-white/5 border active:scale-95",
                    n.color
                )}>
                    <div className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor] animate-pulse" />
                    {n.text}
                </button>
            ))}
        </div>
    );
};


const CoinRow = ({ coin, index }: { coin: any, index: number }) => {
    const change24h = coin.price_change_percentage_24h_in_currency || 0;
    const change1h = coin.price_change_percentage_1h_in_currency || 0;
    const change7d = (coin.price_change_percentage_7d_in_currency || 0);

    return (
        <tr className="hover:bg-white/[0.04] transition-colors border-b border-white/5 last:border-0 group cursor-pointer h-16">
            <td className="py-4 pl-4 font-bold text-center text-xs text-muted-foreground/40 w-12">
                <Star size={14} className="mx-auto hover:text-yellow-500 transition-colors" />
            </td>
            <td className="py-4 text-center text-xs font-bold text-muted-foreground/60 w-10">
                {index + 1}
            </td>
            <td className="py-4 min-w-[200px]">
                <div className="flex items-center gap-3">
                    <img src={coin.image} alt={coin.name} className="w-8 h-8 rounded-full" />
                    <div className="flex flex-col">
                        <span className="font-bold text-[13px]">{coin.name}</span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{coin.symbol}</span>
                            <div className="h-4 w-px bg-white/5" />
                            <span className="text-[9px] font-bold bg-white/5 px-1.5 py-0.5 rounded text-muted-foreground">CMC20</span>
                        </div>
                    </div>
                </div>
            </td>
            <td className="py-4 text-right font-bold text-sm">
                ${coin.current_price < 1 ? coin.current_price.toFixed(6) : coin.current_price.toLocaleString()}
            </td>
            <td className={cn("py-4 text-right font-bold text-xs", change1h >= 0 ? "text-green-500" : "text-red-500")}>
                {change1h >= 0 ? '▲' : '▼'} {Math.abs(change1h).toFixed(2)}%
            </td>
            <td className={cn("py-4 text-right font-bold text-xs", change24h >= 0 ? "text-green-500" : "text-red-500")}>
                {change24h >= 0 ? '▲' : '▼'} {Math.abs(change24h).toFixed(2)}%
            </td>
            <td className={cn("py-4 text-right font-bold text-xs hidden lg:table-cell", change7d >= 0 ? "text-green-500" : "text-red-500")}>
                {change7d >= 0 ? '▲' : '▼'} {Math.abs(change7d).toFixed(2)}%
            </td>
            <td className="py-4 text-right font-bold text-sm hidden lg:table-cell">
                ${(coin.market_cap / 1e9).toFixed(2)}B
            </td>
            <td className="py-4 pr-4 text-right w-[140px]">
                {coin.sparkline_in_7d?.price && (
                    <Sparkline
                        data={coin.sparkline_in_7d.price}
                        width={100}
                        height={32}
                        color={change7d >= 0 ? "#22c55e" : "#ef4444"}
                    />
                )}
            </td>
        </tr>
    );
};

export default function LandingPage({ initialData }: { initialData: any }) {
    const [stats, setStats] = useState<any>(initialData?.stats || null);
    const [topCoins, setTopCoins] = useState<any[]>(initialData?.topCoins || []);
    const [loading, setLoading] = useState(!initialData);

    useEffect(() => {
        if (!initialData) {
            const fetchData = async () => {
                const data = await getLandingPageData();
                if (data) {
                    setStats(data.stats);
                    setTopCoins(data.topCoins);
                }
                setLoading(false);
            };
            fetchData();
        }
    }, [initialData]);

    return (
        <div className="relative min-h-screen pb-40 space-y-8 animate-in fade-in duration-700">


            {/* Top Market Cards (Bento) */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {loading ? (
                    [...Array(5)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl bg-white/5" />)
                ) : (
                    <>
                        <BentoCard
                            index={0}
                            title="Terminal Volume"
                            value={stats?.vol24h || "$0.00B"}
                            change="+12.4%"
                            trend="up"
                            chartData={[15, 18, 16, 22, 25]}
                        />
                        <BentoCard
                            index={1}
                            title="Bullish Momentum"
                            value={stats?.bullishCount || "0"}
                            change="ACTIVE FLOW"
                            trend="up"
                            chartData={[5, 12, 8, 15, 20]}
                        />
                        <BentoCard
                            index={2}
                            type="gauge"
                            title="Signal Pressure"
                            value={Math.round((stats?.bullishCount / (stats?.tokensTotal || 1)) * 100) || 45}
                        />
                        <BentoCard
                            index={4}
                            title="Assets Scanned"
                            value={stats?.tokensTotal || "0"}
                            change="LIVE SCAN"
                            trend="neutral"
                        />
                    </>
                )}
            </div>

            {/* Narratives Section */}
            <div className="py-2">
                <NarrativePills />
            </div>

            {/* Filters bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-end gap-4 py-2 border-t border-white/5 pt-6">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-[11px] font-bold text-muted-foreground uppercase h-8 px-3 rounded-lg hover:bg-white/5">
                        <Filter size={14} className="mr-1.5" /> Filters
                    </Button>
                    <Button variant="ghost" size="sm" className="text-[11px] font-bold text-muted-foreground uppercase h-8 px-3 rounded-lg hover:bg-white/5">
                        <LayoutGrid size={14} className="mr-1.5" /> Columns
                    </Button>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-card/20 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                                <th className="py-5 pl-4 text-center w-12">#</th>
                                <th className="py-5 text-center w-10">Rank</th>
                                <th className="py-5 text-left">Name</th>
                                <th className="py-5 text-right">Price</th>
                                <th className="py-5 text-right">1h %</th>
                                <th className="py-5 text-right">24h %</th>
                                <th className="py-5 text-right hidden lg:table-cell">7d %</th>
                                <th className="py-5 text-right hidden lg:table-cell">Market Cap</th>
                                <th className="py-5 pr-4 text-right w-[140px]">Last 7 Days</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                [...Array(10)].map((_, i) => (
                                    <tr key={i} className="border-b border-white/5">
                                        <td colSpan={9} className="p-4"><Skeleton className="h-12 w-full rounded-lg bg-white/5" /></td>
                                    </tr>
                                ))
                            ) : (
                                topCoins.map((coin, i) => (
                                    <CoinRow key={coin.id} coin={coin} index={i} />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>


        </div>
    );
}

