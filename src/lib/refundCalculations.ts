interface SaleItemForRefundCalculation {
    id: string;
    price: number;
    quantity: number;
    discount_amount?: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
}

function getSaleNetUnits(
    saleItems: SaleItemForRefundCalculation[],
    saleDiscountTotal: number
): Map<string, number> {
    const itemDiscountTotals = new Map<string, number>();
    let subtotalAfterItemDiscounts = 0;
    let totalItemDiscounts = 0;

    for (const item of saleItems) {
        const lineTotal = Math.max(0, Number(item.price || 0) * Math.max(0, Number(item.quantity || 0)));
        const itemDiscount = clamp(Number(item.discount_amount || 0), 0, lineTotal);
        const lineAfterItemDiscount = Math.max(0, lineTotal - itemDiscount);
        subtotalAfterItemDiscounts += lineAfterItemDiscount;
        totalItemDiscounts += itemDiscount;
        itemDiscountTotals.set(item.id, lineAfterItemDiscount);
    }

    const orderDiscountTotal = clamp(
        Number(saleDiscountTotal || 0) - totalItemDiscounts,
        0,
        subtotalAfterItemDiscounts
    );
    const orderDiscountRatio = subtotalAfterItemDiscounts > 0 ? orderDiscountTotal / subtotalAfterItemDiscounts : 0;

    const netUnitByItemId = new Map<string, number>();
    for (const item of saleItems) {
        const qty = Math.max(0, Number(item.quantity || 0));
        if (qty <= 0) {
            netUnitByItemId.set(item.id, 0);
            continue;
        }
        const lineAfterItemDiscount = itemDiscountTotals.get(item.id) || 0;
        const netLineTotal = lineAfterItemDiscount * (1 - orderDiscountRatio);
        netUnitByItemId.set(item.id, netLineTotal / qty);
    }

    return netUnitByItemId;
}

export function calculateProRatedRefundAmount(params: {
    saleItems: SaleItemForRefundCalculation[];
    saleTotal: number;
    saleDiscountTotal: number;
    existingRefundAmount: number;
    alreadyRefundedQuantityBySaleItemId: Record<string, number>;
    selectedRefundQuantityBySaleItemId: Record<string, number>;
}): number {
    const {
        saleItems,
        saleTotal,
        saleDiscountTotal,
        existingRefundAmount,
        alreadyRefundedQuantityBySaleItemId,
        selectedRefundQuantityBySaleItemId,
    } = params;

    const netUnitByItemId = getSaleNetUnits(saleItems, saleDiscountTotal);

    let remainingNetMerchandise = 0;
    let selectedNetMerchandise = 0;

    for (const item of saleItems) {
        const qty = Math.max(0, Number(item.quantity || 0));
        if (qty <= 0) continue;

        const unitNet = netUnitByItemId.get(item.id) || 0;
        const alreadyRefundedQty = clamp(
            Number(alreadyRefundedQuantityBySaleItemId[item.id] || 0),
            0,
            qty
        );
        const remainingQty = qty - alreadyRefundedQty;
        remainingNetMerchandise += unitNet * remainingQty;

        const selectedQty = clamp(
            Number(selectedRefundQuantityBySaleItemId[item.id] || 0),
            0,
            remainingQty
        );
        selectedNetMerchandise += unitNet * selectedQty;
    }

    const remainingRefundable = Math.max(0, Number(saleTotal || 0) - Number(existingRefundAmount || 0));
    if (remainingRefundable <= 0 || remainingNetMerchandise <= 0 || selectedNetMerchandise <= 0) {
        return 0;
    }

    if (selectedNetMerchandise >= remainingNetMerchandise - 0.000001) {
        return roundCurrency(remainingRefundable);
    }

    const proportionalRefund = remainingRefundable * (selectedNetMerchandise / remainingNetMerchandise);
    return roundCurrency(clamp(proportionalRefund, 0, remainingRefundable));
}
