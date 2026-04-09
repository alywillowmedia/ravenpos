import { cn } from '../../lib/utils';

export interface Tab {
    id: string;
    label: string;
    icon?: React.ReactNode;
}

interface TabsProps {
    tabs: Tab[];
    activeTab: string;
    onChange: (id: string) => void;
    className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
    return (
        <div className={cn("flex space-x-1 rounded-xl bg-[var(--color-surface)] p-1 border border-[var(--color-border)]", className)}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onChange(tab.id)}
                        className={cn(
                            "w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all duration-200",
                            "ring-[var(--color-card)]/60 ring-offset-2 ring-offset-[var(--color-primary)] focus:outline-none focus:ring-2",
                            isActive
                                ? "bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm"
                                : "text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]"
                        )}
                        type="button"
                    >
                        <div className="flex items-center justify-center gap-2">
                            {tab.icon}
                            {tab.label}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
