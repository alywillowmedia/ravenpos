export interface PublicStorefrontSettings {
    store_name: string;
    hero_badge_text: string;
    hero_heading: string;
    hero_subheading: string;
    hero_body: string;
    hero_search_placeholder: string;
    hero_primary_cta_label: string | null;
    hero_primary_cta_href: string | null;
    hero_background_image_url: string | null;
    hero_feature_image_url: string | null;
    hero_accent_image_url: string | null;
}

export const DEFAULT_PUBLIC_STOREFRONT_SETTINGS: PublicStorefrontSettings = {
    store_name: 'Ravenlia Galleria',
    hero_badge_text: 'Curated Marketplace',
    hero_heading: 'Ravenlia Galleria',
    hero_subheading: 'Where art lives, stories linger, and community gathers.',
    hero_body: 'Explore local antiques, handmade goods, and uncommon finds online, then visit us in person.',
    hero_search_placeholder: 'Search for items...',
    hero_primary_cta_label: 'Shop Categories',
    hero_primary_cta_href: '#categories',
    hero_background_image_url: null,
    hero_feature_image_url: null,
    hero_accent_image_url: null,
};

export function normalizePublicStorefrontSettings(
    value: Partial<PublicStorefrontSettings> | null | undefined
): PublicStorefrontSettings {
    return {
        store_name: value?.store_name ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.store_name,
        hero_badge_text: value?.hero_badge_text ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.hero_badge_text,
        hero_heading: value?.hero_heading ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.hero_heading,
        hero_subheading: value?.hero_subheading ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.hero_subheading,
        hero_body: value?.hero_body ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.hero_body,
        hero_search_placeholder: value?.hero_search_placeholder ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.hero_search_placeholder,
        hero_primary_cta_label: value?.hero_primary_cta_label ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.hero_primary_cta_label,
        hero_primary_cta_href: value?.hero_primary_cta_href ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.hero_primary_cta_href,
        hero_background_image_url: value?.hero_background_image_url ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.hero_background_image_url,
        hero_feature_image_url: value?.hero_feature_image_url ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.hero_feature_image_url,
        hero_accent_image_url: value?.hero_accent_image_url ?? DEFAULT_PUBLIC_STOREFRONT_SETTINGS.hero_accent_image_url,
    };
}
