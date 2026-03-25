"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import {
  Search,
  Download,
  Filter,
  Calendar,
  Zap,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Database,
  Layers,
  BarChart3,
  Coins,
  X,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  CheckCircle2,
  ChevronDown
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getBinanceHistoryAction } from "@/app/actions";
import { motion, AnimatePresence } from "framer-motion";

export default function BinanceHistory({ initialData = [] }: { initialData?: any[] }) {
  const [data, setData] = useState<any[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [signalType, setSignalType] = useState("all");
  const [timeframe, setTimeframe] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);

  // Initial stats calculation

  // Export Modal Filters State
  const [modalFromDate, setModalFromDate] = useState("");
  const [modalToDate, setModalToDate] = useState("");
  const [modalSignalType, setModalSignalType] = useState("all");
  const [modalTimeframe, setModalTimeframe] = useState("all");
  const [modalFormat, setModalFormat] = useState<'xlsx' | 'csv'>('xlsx');

  // Modal-specific filtered data calculation
  const modalFilteredData = useMemo(() => {
    return data.filter(item => {
      const matchType = modalSignalType === "all" || item.signal_type === modalSignalType;
      const matchTF = modalTimeframe === "all" || item.timeframe === modalTimeframe;
      
      const ts = item.crossover_timestamp || 0;
      const matchFrom = !modalFromDate || ts >= new Date(modalFromDate).getTime();
      const matchTo = !modalToDate || ts <= new Date(modalToDate + "T23:59:59").getTime();

      return matchType && matchTF && matchFrom && matchTo;
    });
  }, [data, modalFromDate, modalToDate, modalSignalType, modalTimeframe]);

  // Main table filtered data calculation (More robust logic)
  const filteredData = useMemo(() => {
    return data.filter(item => {
      const nameStr = (item.name || "").toLowerCase();
      const symbolStr = (item.symbol || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchSearch = symbolStr.includes(query) || nameStr.includes(query);

      const matchType = signalType === "all" || item.signal_type === signalType;
      const matchTF = timeframe === "all" || item.timeframe === timeframe;
      
      const ts = item.crossover_timestamp || 0;
      const matchFrom = !fromDate || ts >= new Date(fromDate).getTime();
      const matchTo = !toDate || ts <= new Date(toDate + "T23:59:59").getTime();

      return matchSearch && matchType && matchTF && matchFrom && matchTo;
    });
  }, [data, searchQuery, signalType, timeframe, fromDate, toDate]);

  // Combined stats calculation
  const stats = useMemo(() => {
    const total = data.length;
    const buys = data.filter(s => s.signal_type === "BUY").length;
    const sells = data.filter(s => s.signal_type === "SELL").length;
    const uniqueCoins = new Set(data.filter(s => s.symbol).map(s => s.symbol)).size;
    const day = 24 * 60 * 60 * 1000;
    const last24hCount = data.filter(s => (Date.now() - (s.crossover_timestamp || 0)) < day).length;
    const avgScore = total > 0 ? Math.round(data.reduce((acc, s) => acc + (s.score || 0), 0) / total) : 0;

    return { total, buys, sells, uniqueCoins, last24hCount, avgScore };
  }, [data]);

  // Export Logic
  const performExport = () => {
    const headers = ["#", "Date", "Time", "Asset", "Signal", "TF", "Score", "Price", "24h %", "Volume", "EMA7", "EMA99", "Gap"];
    const csvRows = modalFilteredData.map((row, index) => [
        index + 1,
        new Date(row.crossover_timestamp).toLocaleDateString(),
        new Date(row.crossover_timestamp).toLocaleTimeString(),
        row.symbol,
        row.signal_type,
        row.timeframe,
        row.score,
        row.price,
        row.change24h ? `${row.change24h.toFixed(2)}%` : "0.00%",
        row.volume24h ? `$${(row.volume24h / 1e6).toFixed(1)}M` : "0.0M",
        row.ema7,
        row.ema99,
        row.crossoverStrength
    ]);

    const csvContent = [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Signal_History_${modalFormat}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    setShowExportModal(false);
  };

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const currentItems = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="min-h-screen bg-[#F9FAFB] p-8 font-sans text-slate-900">
      <div className="max-w-[1600px] mx-auto space-y-10">
        
        {/* Page Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-4xl font-black text-slate-800 tracking-tight uppercase leading-none">Signal History</h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-loose">All Detected Crossovers Stored In Database</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => {
                // Pre-fill modal filters from main filters
                setModalFromDate(fromDate);
                setModalToDate(toDate);
                setModalSignalType(signalType);
                setModalTimeframe(timeframe);
                setShowExportModal(true);
            }}
            className="h-10 px-6 gap-2 border-[#D1FAE5] bg-[#ECFDF5] text-[#10B981] rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-[#D1FAE5] transition-all shadow-sm"
          >
            <Download size={14} />
            Export
          </Button>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-5">
           <StatCard value={stats.total} label="Total Signals" sub="All signals ever stored" icon={<Database size={14} />} color="#A855F7" bgColor="#F3E8FF" borderColor="#E9D5FF" />
           <StatCard value={stats.buys} label="Buy Signals" sub="EMA7 crossed above EMA99" icon={<TrendingUp size={14} />} color="#22C55E" bgColor="#DCFCE7" borderColor="#BBF7D0" />
           <StatCard value={stats.sells} label="Sell Signals" sub="EMA7 crossed below EMA99" icon={<TrendingDown size={14} />} color="#F43F5E" bgColor="#FFE4E6" borderColor="#FECDD3" />
           <StatCard value={stats.uniqueCoins} label="Unique Coins" sub="Distinct assets detected" icon={<Coins size={14} />} color="#F59E0B" bgColor="#FEF3C7" borderColor="#FDE68A" />
           <StatCard value={stats.last24hCount} label="Last 24h" sub="New signals in past 24 hours" icon={<Clock size={14} />} color="#3B82F6" bgColor="#DBEAFE" borderColor="#BFDBFE" />
           <StatCard value={stats.avgScore} label="Avg Score" sub="Mean confidence across all" icon={<BarChart3 size={14} />} color="#6366F1" bgColor="#E0E7FF" borderColor="#C7D2FE" />
        </div>

        {/* Filter Bar */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
               <Filter size={14} className="text-slate-400" />
               <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Filters</span>
            </div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{filteredData.length} Results</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <FilterGroup label="From">
              <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }} className="w-full bg-white border border-slate-200 rounded-xl px-4 h-11 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-slate-300 transition-all uppercase" />
            </FilterGroup>
            <FilterGroup label="To">
              <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }} className="w-full bg-white border border-slate-200 rounded-xl px-4 h-11 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-slate-300 transition-all uppercase" />
            </FilterGroup>
            <FilterGroup label="Signal">
              <select value={signalType} onChange={(e) => { setSignalType(e.target.value); setCurrentPage(1); }} className="w-full bg-white border border-slate-200 rounded-xl px-4 h-11 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-slate-300 transition-all uppercase appearance-none cursor-pointer">
                <option value="all">All Types</option>
                <option value="BUY">Only Buys</option>
                <option value="SELL">Only Sells</option>
              </select>
            </FilterGroup>
            <FilterGroup label="Timeframe">
               <select value={timeframe} onChange={(e) => { setTimeframe(e.target.value); setCurrentPage(1); }} className="w-full bg-white border border-slate-200 rounded-xl px-4 h-11 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-slate-300 transition-all uppercase appearance-none cursor-pointer">
                <option value="all">All TFs</option>
                <option value="5m">5 Minute</option>
                <option value="15m">15 Minute</option>
                <option value="1h">1 Hour</option>
                <option value="4h">4 Hour</option>
                <option value="1d">1 Day</option>
              </select>
            </FilterGroup>
            <FilterGroup label="Search">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input placeholder="SYMBOL OR NAME..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="w-full bg-white border border-slate-200 rounded-xl pl-10 h-11 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-slate-300 transition-all placeholder:text-slate-300 uppercase" />
              </div>
            </FilterGroup>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-50 h-14 bg-slate-50/50 hover:bg-slate-50/50">
                <TableHead className="w-14 text-center text-[10px] font-black uppercase text-slate-400">#</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em] pl-6">Date / Time</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Asset</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Signal</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em] text-center">Tf</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em] text-center">Score</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em] text-right">Crossover Price</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em] text-right">24h %</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em] text-right pr-10">Volume</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentItems.map((item, idx) => (
                <TableRow key={item.id} className="border-slate-50 hover:bg-slate-50/30 transition-colors h-16 group">
                  <TableCell className="text-center font-bold text-slate-300 text-[11px]">{(currentPage - 1) * itemsPerPage + idx + 1}</TableCell>
                  <TableCell className="pl-6">
                    <div className="flex flex-col">
                       <span className="text-[11px] font-extrabold text-slate-700">{new Date(item.crossover_timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{new Date(item.crossover_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center p-1 border border-slate-100">
                        {item.image ? <img src={item.image} className="w-full h-full object-contain" /> : <span className="text-[9px] font-black text-slate-400">{item.symbol?.slice(0, 1)}</span>}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-extrabold tracking-tight text-slate-800">{item.symbol}</span>
                        <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase truncate max-w-[80px]">{item.name?.split(' ')[0]}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={cn("inline-flex items-center px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest", item.signal_type === "BUY" ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#FFE4E6] text-[#991B1B]")}>{item.signal_type}</div>
                  </TableCell>
                  <TableCell className="text-center font-black text-[11px] text-slate-500">{item.timeframe?.toUpperCase()}</TableCell>
                  <TableCell className="text-center">
                    <span className={cn("text-[13px] font-black", item.score >= 80 ? "text-[#10B981]" : item.score >= 50 ? "text-[#F59E0B]" : "text-[#EF4444]")}>{item.score}</span>
                  </TableCell>
                  <TableCell className="text-right font-bold text-[13px] text-slate-700">${item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right font-bold text-[12px]">{item.change24h?.toFixed(2)}%</TableCell>
                  <TableCell className="text-right pr-10 font-bold text-slate-500 text-[12px]">${((item.volume24h || 50000000) / 1e6).toFixed(1)}M</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-10 py-6 border-t border-slate-50 flex items-center justify-between">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Showing {(currentPage-1)*itemsPerPage+1} - {Math.min(currentPage*itemsPerPage, filteredData.length)} of {filteredData.length}</p>
             <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)}><ChevronLeft size={14}/></Button>
                <div className="flex items-center gap-2 px-2">
                    {[...Array(Math.min(totalPages, 3))].map((_, i) => (
                        <button key={i} onClick={() => setCurrentPage(i+1)} className={cn("text-[10px] font-black w-6 h-6 rounded-md", currentPage === i+1 ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-100")}>{i+1}</button>
                    ))}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={currentPage === totalPages} onClick={() => setCurrentPage(next => next + 1)}><ChevronRight size={14}/></Button>
             </div>
          </div>
        </div>
      </div>

      {/* EXACT REPLICA EXPORT MODAL - UPDATED WITH LOGIC */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowExportModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
            
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="relative w-full max-w-[480px] bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-100 overflow-hidden" >
                {/* Header Section */}
                <div className="p-6 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#E6F9F2] rounded-xl flex items-center justify-center text-[#10B981]">
                            <FileSpreadsheet size={20} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[16px] font-black text-slate-800 tracking-tight uppercase leading-none">Export Signals</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 opacity-80">Filter & Download Data</p>
                        </div>
                    </div>
                    <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-800 transition-colors p-1">
                        <X size={18} />
                    </button>
                </div>

                {/* Content Section */}
                <div className="p-8 pt-2 space-y-7">
                    {/* Date Range Section */}
                    <div className="space-y-3">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Date Range</h3>
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">From</label>
                                <div className="relative group">
                                    <input type="date" value={modalFromDate} onChange={(e) => setModalFromDate(e.target.value)} className="w-full h-8 bg-white border-b border-slate-100 text-[12px] font-bold text-slate-700 outline-none focus:border-slate-400 transition-all uppercase" />
                                    <Calendar className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-800 pointer-events-none" size={14} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">To</label>
                                <div className="relative group">
                                    <input type="date" value={modalToDate} onChange={(e) => setModalToDate(e.target.value)} className="w-full h-8 bg-white border-b border-slate-100 text-[12px] font-bold text-slate-700 outline-none focus:border-slate-400 transition-all uppercase" />
                                    <Calendar className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-800 pointer-events-none" size={14} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Filters Section */}
                    <div className="space-y-3">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Filters</h3>
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">Signal Type</label>
                                <div className="relative group">
                                    <select value={modalSignalType} onChange={(e) => setModalSignalType(e.target.value)} className="w-full h-8 bg-white border-b border-slate-100 text-[12px] font-bold text-slate-700 outline-none appearance-none cursor-pointer">
                                        <option value="all">All Signals</option>
                                        <option value="BUY">Only Buys</option>
                                        <option value="SELL">Only Sells</option>
                                    </select>
                                    <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-800 pointer-events-none" size={14} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">Timeframe</label>
                                <div className="relative group">
                                    <select value={modalTimeframe} onChange={(e) => setModalTimeframe(e.target.value)} className="w-full h-8 bg-white border-b border-slate-100 text-[12px] font-bold text-slate-700 outline-none appearance-none cursor-pointer">
                                        <option value="all">All Timeframes</option>
                                        <option value="15m">15 Minute</option>
                                        <option value="1h">1 Hour</option>
                                        <option value="4h">4 Hour</option>
                                        <option value="1d">1 Day</option>
                                    </select>
                                    <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-800 pointer-events-none" size={14} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* File Format Section */}
                    <div className="space-y-3">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">File Format</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setModalFormat('xlsx')} className={cn("flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-95 text-left", modalFormat === 'xlsx' ? "border-[#10B981] bg-[#E6F9F2]" : "border-slate-50 bg-white hover:bg-slate-50")}>
                                <div className={modalFormat === 'xlsx' ? "text-[#10B981]" : "text-slate-400"}><FileSpreadsheet size={16} /></div>
                                <div className="flex flex-col">
                                    <span className={cn("text-[11px] font-black leading-none mb-0.5", modalFormat === 'xlsx' ? "text-[#10B981]" : "text-slate-700")}>Excel (.xlsx)</span>
                                    <span className={cn("text-[9px] font-bold uppercase leading-none", modalFormat === 'xlsx' ? "text-[#10B981]/60" : "text-slate-400")}>Styled sheet</span>
                                </div>
                            </button>
                            <button onClick={() => setModalFormat('csv')} className={cn("flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-95 text-left", modalFormat === 'csv' ? "border-[#10B981] bg-[#E6F9F2]" : "border-slate-50 bg-white hover:bg-slate-50")}>
                                <div className={modalFormat === 'csv' ? "text-[#10B981]" : "text-slate-400"}><FileText size={16} /></div>
                                <div className="flex flex-col">
                                    <span className={cn("text-[11px] font-black leading-none mb-0.5", modalFormat === 'csv' ? "text-[#10B981]" : "text-slate-700")}>CSV (.csv)</span>
                                    <span className={cn("text-[9px] font-bold uppercase leading-none", modalFormat === 'csv' ? "text-[#10B981]/60" : "text-slate-400")}>Plain text</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Summary & Buttons */}
                    <div className="pt-5 flex items-center justify-between border-t border-slate-50">
                        <div className="flex items-center gap-1.5 opacity-70">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{modalFilteredData.length} records match your filters</span>
                        </div>
                        <div className="flex items-center gap-6">
                            <button onClick={() => setShowExportModal(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-800 transition-colors">Cancel</button>
                            <button onClick={performExport} className="px-5 h-10 bg-[#00CFD5] text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-[0_5px_15px_rgba(0,207,213,0.25)] hover:scale-105 active:scale-95 transition-all">
                                <Download size={12} />
                                Export {modalFilteredData.length}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Subcomponents matching Step 424 (Exact Image Style)
function StatCard({ label, value, sub, icon, color, bgColor, borderColor }: any) {
  return (
    <div className="bg-white border rounded-2xl p-5 space-y-3 shadow-sm relative overflow-hidden transition-all hover:shadow-md" style={{ borderColor }}>
      <div className="flex items-start justify-between relative z-10">
        <div className="text-3xl font-black tracking-tighter" style={{ color }}>{value}</div>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold" style={{ backgroundColor: bgColor, color }}>{icon}</div>
      </div>
      <div className="space-y-0.5 relative z-10">
        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.05em]">{label}</h3>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{sub}</p>
      </div>
      <div className="absolute bottom-0 left-5 right-5 h-1 rounded-t-full opacity-30" style={{ backgroundColor: color }} />
    </div>
  );
}

function FilterGroup({ label, children }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-0.5">{label}</label>
      {children}
    </div>
  );
}
