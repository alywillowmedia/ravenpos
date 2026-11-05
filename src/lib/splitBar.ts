export interface SplitBarPart {
    label: string;
    value: number;
    display: string;
    tone: 1 | 2 | 3;
}

export function toSplitBarSegments(parts: SplitBarPart[]): Array<SplitBarPart & { share: number }> {
    const visible = parts.filter((part) => Number.isFinite(part.value) && part.value > 0);
    const total = visible.reduce((sum, part) => sum + part.value, 0);
    return visible.map((part) => ({ ...part, share: (part.value / total) * 100 }));
}
