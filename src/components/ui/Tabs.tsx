import { useId, type KeyboardEvent } from 'react';
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
    size?: 'md' | 'sm';
    ariaLabel?: string;
}

export function Tabs({ tabs, activeTab, onChange, className, size = 'md', ariaLabel = 'Views' }: TabsProps) {
    const id = useId().replace(/:/g, '');
    const buttonSize = size === 'sm'
        ? 'rounded-md px-3 py-2 text-sm'
        : 'rounded-md px-4 py-2.5 text-sm';

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        let nextIndex: number | null = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex === null) return;

        event.preventDefault();
        onChange(tabs[nextIndex].id);
        const triggers = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        triggers?.[nextIndex]?.focus();
    };

    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            className={cn("flex gap-1 overflow-x-auto rounded-lg bg-[var(--color-surface)] p-1 border border-[var(--color-border)]", className)}
        >
            {tabs.map((tab, index) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        id={`${id}-tab-${tab.id}`}
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onChange(tab.id)}
                        onKeyDown={(event) => handleKeyDown(event, index)}
                        className={cn(
                            "min-w-max flex-1 font-medium leading-5 transition-colors duration-150 focus-visible:z-10",
                            buttonSize,
                            isActive
                                ? "bg-[var(--color-card)] text-[var(--color-primary)] shadow-[var(--shadow-control)]"
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
