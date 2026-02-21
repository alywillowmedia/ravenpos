import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    DEFAULT_PUBLIC_STOREFRONT_SETTINGS,
    normalizePublicStorefrontSettings,
    type PublicStorefrontSettings,
} from '../lib/publicStorefrontSettings';

export function usePublicStorefrontSettings() {
    const [settings, setSettings] = useState<PublicStorefrontSettings>(DEFAULT_PUBLIC_STOREFRONT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const fetchSettings = async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('storefront_home_settings')
                .select(`
                    store_name,
                    hero_badge_text,
                    hero_heading,
                    hero_subheading,
                    hero_body,
                    hero_search_placeholder,
                    hero_primary_cta_label,
                    hero_primary_cta_href,
                    hero_background_image_url,
                    hero_feature_image_url,
                    hero_accent_image_url
                `)
                .eq('id', true)
                .maybeSingle();

            if (!isMounted) {
                return;
            }

            if (error) {
                console.error('Failed to load storefront home settings:', error);
                setSettings(DEFAULT_PUBLIC_STOREFRONT_SETTINGS);
            } else {
                setSettings(normalizePublicStorefrontSettings(data));
            }

            setIsLoading(false);
        };

        void fetchSettings();

        return () => {
            isMounted = false;
        };
    }, []);

    return { settings, isLoading };
}
