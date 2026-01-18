import React from 'react';
import { Card, CardContent } from '../ui/Card';

interface AnalyticsCardProps {
    title: string;
    children: React.ReactNode;
    className?: string;
}

export function AnalyticsCard({ title, children, className = '' }: AnalyticsCardProps) {
    return (
        <Card variant="outlined" className={`h-full ${className}`}>
            <CardContent className="h-full flex flex-col">
                <h3 className="text-lg font-semibold text-[var(--color-foreground)] mb-4">{title}</h3>
                <div className="flex-1 w-full min-h-[300px]">
                    {children}
                </div>
            </CardContent>
        </Card>
    );
}
