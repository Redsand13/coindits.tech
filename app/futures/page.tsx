
import SignalsTerminal from '@/components/SignalsTerminal';
import { getBinanceFuturesSignalsAction, getBinanceBanStatusAction } from '@/app/actions';

export const dynamic = "force-dynamic";

export default async function BinanceFuturesPage() {
    const [initialSignals, banStatus] = await Promise.all([
        getBinanceFuturesSignalsAction("1h"),
        getBinanceBanStatusAction(),
    ]);

    if (banStatus.banned && banStatus.banUntil) {
        const banDate = new Date(banStatus.banUntil).toLocaleDateString("en-US", {
            year: "numeric", month: "long", day: "numeric",
            hour: "2-digit", minute: "2-digit", timeZoneName: "short",
        });
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-8">
                <div className="max-w-lg w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-4">
                    <div className="text-4xl">🚫</div>
                    <h2 className="text-xl font-black text-destructive uppercase tracking-wider">
                        Binance API — IP Banned
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Your server IP was temporarily banned by Binance due to too many REST API requests.
                        Futures signals are unavailable until the ban expires.
                    </p>
                    <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-5 py-3">
                        <p className="text-xs font-bold text-destructive/70 uppercase tracking-widest mb-1">Ban expires</p>
                        <p className="text-sm font-black text-destructive">{banDate}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Other features (Advanced Signals, Landing Page) continue to work normally.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <SignalsTerminal
            title="EXCHANGE FUTURES MARKET"
            description="Futures Data"
            fetchAction={getBinanceFuturesSignalsAction}
            initialData={initialSignals}
        />
    );
}
