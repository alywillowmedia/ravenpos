import type { Consignor } from '../types';

export interface ConsignorRateSchedule {
    id: string;
    consignor_id: string;
    effective_date: string;
    commission_split: number;
    booth_square_feet?: number | null;
    booth_cost_per_square_foot?: number | null;
    monthly_booth_rent: number;
    created_at: string;
    updated_at: string;
}

export function getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getLatestEffectiveSchedule(
    schedules: ConsignorRateSchedule[],
    asOfDate: string = getLocalDateString()
): ConsignorRateSchedule | null {
    const eligible = schedules
        .filter((schedule) => schedule.effective_date <= asOfDate)
        .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
    return eligible[0] || null;
}

export function applyEffectiveConsignorTerms(
    consignor: Consignor,
    schedules: ConsignorRateSchedule[],
    asOfDate: string = getLocalDateString()
): Consignor {
    const latest = getLatestEffectiveSchedule(schedules, asOfDate);
    if (!latest) return consignor;

    return {
        ...consignor,
        commission_split: Number(latest.commission_split),
        booth_square_feet: Number(latest.booth_square_feet ?? consignor.booth_square_feet ?? 0),
        booth_cost_per_square_foot: Number(
            latest.booth_cost_per_square_foot ?? consignor.booth_cost_per_square_foot ?? 0
        ),
        monthly_booth_rent: Number(latest.monthly_booth_rent),
    };
}
