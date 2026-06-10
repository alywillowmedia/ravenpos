const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOP_BASE_PATH = '/shop';

export function slugifyStorefrontName(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function buildVendorPath(vendor: {
    id: string;
    name: string;
    storefront_display_name?: string | null;
    storefront_slug?: string | null;
}): string {
    const slug = vendor.storefront_slug || slugifyStorefrontName(vendor.storefront_display_name || vendor.name);
    if (!slug) return `${SHOP_BASE_PATH}/vendor/${vendor.id}`;
    return `${SHOP_BASE_PATH}/vendor/${slug}`;
}

export function buildItemPath(item: {
    id: string;
    sku: string;
    consignor?: {
        id: string;
        name: string;
        storefront_display_name?: string | null;
        storefront_slug?: string | null;
    } | null;
}): string {
    if (!item.consignor) {
        return `${SHOP_BASE_PATH}/item/${item.id}`;
    }

    const vendorPath = buildVendorPath({
        id: item.consignor.id,
        name: item.consignor.name,
        storefront_display_name: item.consignor.storefront_display_name,
        storefront_slug: item.consignor.storefront_slug,
    });

    return `${vendorPath}/item-${encodeURIComponent(item.sku)}`;
}

export function isUuid(value: string | undefined): boolean {
    if (!value) return false;
    return UUID_REGEX.test(value);
}
