import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { ShopifySync } from '../components/integrations/ShopifySync';
import { supabase } from '../lib/supabase';

interface ShopifyConfigData {
    store_name: string;
    location_name: string;
}

export function Integrations() {
    const [config, setConfig] = useState<ShopifyConfigData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadConfig() {
            const { data } = await supabase
                .from('shopify_config')
                .select('store_name, location_name')
                .eq('is_active', true)
                .single();

            setConfig(data);
            setIsLoading(false);
        }
        loadConfig();
    }, []);

    return (
        <div className="p-6">
            <Header
                title="Integrations"
                description="Connect RavenPOS with external platforms"
            />

            <div className="mt-6 max-w-4xl">
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-[var(--color-foreground)] flex items-center gap-2">
                            <ShopifyBrandIcon />
                            Shopify
                        </h2>
                        <Link to="/admin/shopify-setup">
                            <Button variant="secondary" size="sm">
                                <SettingsIcon />
                                {config ? 'Change Store' : 'Connect Store'}
                            </Button>
                        </Link>
                    </div>

                    {/* Connection Status */}
                    {!isLoading && (
                        <div className={`mb-6 p-4 rounded-lg border ${config
                                ? 'bg-[var(--color-success-bg)] border-[var(--color-success)]/30'
                                : 'bg-[var(--color-surface)] border-[var(--color-border)]'
                            }`}>
                            {config ? (
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-[var(--color-success)]" />
                                    <div>
                                        <p className="font-medium text-[var(--color-foreground)]">
                                            Connected to {config.store_name}.myshopify.com
                                        </p>
                                        <p className="text-sm text-[var(--color-muted)]">
                                            Location: {config.location_name}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-[var(--color-muted)]" />
                                    <p className="text-[var(--color-muted)]">
                                        No store connected. <Link to="/admin/shopify-setup" className="text-[var(--color-primary)] hover:underline">Connect a store</Link> to get started.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <p className="text-[var(--color-muted)] mb-6">
                        Sync your inventory with Shopify. Import products and keep quantities in sync.
                    </p>
                    <ShopifySync />
                </section>
            </div>
        </div>
    );
}

function ShopifyBrandIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
                d="M15.5 3.5c-.1 0-.2 0-.3-.1-.1 0-.2-.1-.2-.2 0-.1-.1-.2-.1-.3 0-.2.1-.4.3-.5.1-.1.3-.2.5-.2l.5.1c.2 0 .4.2.4.4l.6 4.1c0 .2-.1.4-.3.5l-1 .3c-.2.1-.4 0-.5-.1-.2-.1-.2-.3-.2-.5l.3-3.5z"
                fill="#95BF47"
            />
            <path
                d="M21 6.2l-3.6-.6-.7 3.3c0 .2-.2.3-.4.4l-2.7.5c-.2 0-.4 0-.5-.2-.1-.1-.1-.3-.1-.5l1.2-3-2.3-.4c-.2 0-.3-.2-.4-.3l-.8-2.1c-.1-.2-.1-.4.1-.5.1-.2.3-.2.5-.2l8.1 1.2c.4.1.8.4.8.9v.9c-.1.3-.2.5-.4.6h.2zM14 10.6l.6 3.9c0 .2 0 .4-.2.5-.1.1-.3.1-.5.1l-2.5-1.1-3.8 3.1c-.1.1-.3.1-.5.1-.2-.1-.3-.2-.3-.4l-.6-5.2 5.6-1.1c.2 0 .4 0 .5.2.1.1.2.3.1.5l-.2.9 1.8.5zM4.6 10.7l-.5 4.3c0 .2 0 .4.2.5.1.1.3.1.5.1l2.2-.9 1.8 1.4c.1.1.3.1.5.1.2-.1.3-.2.3-.4l.5-4.3-5.5-.8z"
                fill="#5E8E3E"
            />
        </svg>
    );
}

function SettingsIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    );
}
