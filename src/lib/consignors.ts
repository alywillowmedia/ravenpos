import type { Consignor } from '../types';

type ConsignorLike = Partial<Consignor>;

function safeTrim(value: string | null | undefined): string {
    return (value || '').trim();
}

export function calculateBoothRent(
    boothSquareFeet: number | null | undefined,
    boothCostPerSquareFoot: number | null | undefined
): number {
    const squareFeet = Number(boothSquareFeet) || 0;
    const costPerFoot = Number(boothCostPerSquareFoot) || 0;
    return Number((squareFeet * costPerFoot).toFixed(2));
}

export function getConsignorDisplayName(consignor: ConsignorLike): string {
    const businessName = safeTrim(consignor.business_name);
    const fullName = `${safeTrim(consignor.first_name)} ${safeTrim(consignor.last_name)}`.trim();

    return businessName || fullName || safeTrim(consignor.name) || 'Unnamed Consignor';
}

export function getConsignorPayToName(consignor: ConsignorLike): string {
    const payToType = consignor.pay_to_type || 'business';
    const businessName = safeTrim(consignor.business_name);
    const fullName = `${safeTrim(consignor.first_name)} ${safeTrim(consignor.last_name)}`.trim();

    if (payToType === 'individual') {
        return fullName || businessName || safeTrim(consignor.name) || 'Unnamed Individual';
    }

    return businessName || fullName || safeTrim(consignor.name) || 'Unnamed Business';
}
