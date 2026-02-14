import type { Consignor } from '../types';

function toDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function getToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function isConsignorScheduled(consignor: Consignor): boolean {
    if (!consignor.is_active || !consignor.scheduled_active_date) return false;
    return toDateOnly(consignor.scheduled_active_date) > getToday();
}

export function isConsignorCurrentlyActive(consignor: Consignor): boolean {
    return consignor.is_active && !isConsignorScheduled(consignor);
}

