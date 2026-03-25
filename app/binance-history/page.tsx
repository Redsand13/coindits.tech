import BinanceHistory from '@/components/BinanceHistory';
import { getBinanceHistoryAction } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function BinanceHistoryPage() {
    // Initial data fetch
    const history = await getBinanceHistoryAction();

    return (
        <BinanceHistory initialData={history} />
    );
}
