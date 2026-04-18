import AdvancedSignalsTerminal from "@/components/AdvancedSignalsTerminal";

export const dynamic = "force-dynamic";

export default async function AdvancedSignalsPage() {
    return (
        <AdvancedSignalsTerminal
            title="ADVANCED SIGNAL"
            description="Select an exchange to scan for live signals"
            initialData={[]}
        />
    );
}
