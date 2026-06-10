import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ImageUpload } from '../../components/ui/ImageUpload';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { slugifyStorefrontName } from '../../lib/storefront';

interface StorefrontItem {
    id: string;
    sku: string;
    name: string;
    price: number;
    quantity: number;
    image_url: string | null;
    is_listed: boolean;
    show_in_public_browse: boolean;
    storefront_featured: boolean;
}

interface StorefrontSettings {
    storefront_display_name: string;
    storefront_slug: string;
    storefront_description: string;
    storefront_logo_url: string | null;
    storefront_header_image_url: string | null;
    storefront_show_items: boolean;
    storefront_images_only: boolean;
}

const DEFAULT_SETTINGS: StorefrontSettings = {
    storefront_display_name: '',
    storefront_slug: '',
    storefront_description: '',
    storefront_logo_url: null,
    storefront_header_image_url: null,
    storefront_show_items: true,
    storefront_images_only: false,
};

const STOREFRONT_ITEMS_FETCH_BATCH_SIZE = 1000;

export function VendorStorefront() {
    const { userRecord } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [items, setItems] = useState<StorefrontItem[]>([]);
    const [settings, setSettings] = useState<StorefrontSettings>(DEFAULT_SETTINGS);
    const [search, setSearch] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!userRecord?.consignor_id) return;

            setIsLoading(true);
            setMessage(null);

            const [{ data: consignorData, error: consignorError }] = await Promise.all([
                supabase
                    .from('consignors')
                    .select(`
                        storefront_display_name,
                        storefront_slug,
                        storefront_description,
                        storefront_logo_url,
                        storefront_header_image_url,
                        storefront_show_items,
                        storefront_images_only,
                        is_active
                    `)
                    .eq('id', userRecord.consignor_id)
                    .single(),
            ]);

            if (consignorError) {
                setMessage({ type: 'error', text: consignorError.message });
            } else if (consignorData) {
                setSettings({
                    storefront_display_name: consignorData.storefront_display_name || '',
                    storefront_slug: consignorData.storefront_slug || '',
                    storefront_description: consignorData.storefront_description || '',
                    storefront_logo_url: consignorData.storefront_logo_url || null,
                    storefront_header_image_url: consignorData.storefront_header_image_url || null,
                    storefront_show_items: consignorData.storefront_show_items ?? true,
                    storefront_images_only: consignorData.storefront_images_only ?? false,
                });
            }

	            if (consignorData?.is_active === false) {
	                setItems([]);
	                setIsLoading(false);
	                return;
	            }

	            try {
                const allItems: StorefrontItem[] = [];
                let offset = 0;
                let hasMore = true;

                while (hasMore) {
                    const { data: itemBatch, error: itemError } = await supabase
                        .from('items')
                        .select('id, sku, name, price, quantity, image_url, is_listed, show_in_public_browse, storefront_featured')
                        .eq('consignor_id', userRecord.consignor_id)
                        .order('updated_at', { ascending: false })
                        .order('id', { ascending: false })
                        .range(offset, offset + STOREFRONT_ITEMS_FETCH_BATCH_SIZE - 1);

                    if (itemError) throw itemError;

                    const batch = (itemBatch || []) as StorefrontItem[];
                    allItems.push(...batch);

                    if (batch.length < STOREFRONT_ITEMS_FETCH_BATCH_SIZE) {
                        hasMore = false;
                    } else {
                        offset += STOREFRONT_ITEMS_FETCH_BATCH_SIZE;
                    }
                }

                setItems(allItems);
            } catch (itemError) {
                const messageText = itemError instanceof Error ? itemError.message : 'Failed to load storefront items';
                setMessage({ type: 'error', text: messageText });
            }

            setIsLoading(false);
        };

        fetchData();
    }, [userRecord?.consignor_id]);

    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return items;
        return items.filter((item) =>
            item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term)
        );
    }, [items, search]);

    const handleSaveSettings = async (e: FormEvent) => {
        e.preventDefault();
        if (!userRecord?.consignor_id) return;

        setIsSavingSettings(true);
        setMessage(null);

        const { error } = await supabase
            .from('consignors')
            .update({
                storefront_display_name: settings.storefront_display_name.trim() || null,
                storefront_slug: slugifyStorefrontName(settings.storefront_slug) || null,
                storefront_description: settings.storefront_description.trim() || null,
                storefront_logo_url: settings.storefront_logo_url,
                storefront_header_image_url: settings.storefront_header_image_url,
                storefront_show_items: settings.storefront_show_items,
                storefront_images_only: settings.storefront_images_only,
            })
            .eq('id', userRecord.consignor_id);

        setIsSavingSettings(false);

        if (error) {
            setMessage({ type: 'error', text: error.message });
            return;
        }

        setMessage({ type: 'success', text: 'Storefront settings saved.' });
    };

    const updateItemField = async (itemId: string, field: keyof Pick<StorefrontItem, 'is_listed' | 'show_in_public_browse' | 'storefront_featured'>, value: boolean) => {
        setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));

        const { error } = await supabase
            .from('items')
            .update({ [field]: value })
            .eq('id', itemId);

        if (error) {
            setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, [field]: !value } : item)));
            setMessage({ type: 'error', text: `Failed updating item visibility: ${error.message}` });
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    return (
        <div className="animate-fadeIn space-y-6">
            <Header title="Storefront" description="Control your public vendor page and item visibility." />

            {message && (
                <div
                    className={`p-3 rounded-lg text-sm ${message.type === 'success'
                        ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                        : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                        }`}
                >
                    {message.text}
                </div>
            )}

            <Card variant="outlined">
                <CardHeader>
                    <CardTitle className="text-sm">Storefront Profile</CardTitle>
                    <CardDescription>Set your storefront name, branding, and visibility behavior.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveSettings} className="space-y-4">
                        <Input
                            label="Storefront Name"
                            value={settings.storefront_display_name}
                            onChange={(e) => {
                                const nextName = e.target.value.slice(0, 80);
                                setSettings((prev) => ({
                                    ...prev,
                                    storefront_display_name: nextName,
                                    storefront_slug: prev.storefront_slug || slugifyStorefrontName(nextName),
                                }));
                            }}
                            placeholder="Your shop name"
                            maxLength={80}
                        />
                        <Input
                            label="Storefront URL Slug"
                            value={settings.storefront_slug}
                            onChange={(e) => setSettings((prev) => ({ ...prev, storefront_slug: slugifyStorefrontName(e.target.value).slice(0, 80) }))}
                            placeholder="raven-vintage"
                            maxLength={80}
                            hint={`Public URL: /vendor/${slugifyStorefrontName(settings.storefront_slug || settings.storefront_display_name || 'your-shop')}`}
                        />
                        <Textarea
                            label="Description"
                            value={settings.storefront_description}
                            onChange={(e) => setSettings((prev) => ({ ...prev, storefront_description: e.target.value.slice(0, 5000) }))}
                            placeholder="Tell shoppers what makes your booth unique."
                            maxLength={5000}
                            rows={4}
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                                <p className="text-sm font-medium text-[var(--color-foreground)] mb-2">Logo / Profile Image</p>
                                <ImageUpload
                                    value={settings.storefront_logo_url}
                                    onChange={(url) => setSettings((prev) => ({ ...prev, storefront_logo_url: url }))}
                                    consignorId={userRecord?.consignor_id || ''}
                                    itemId="storefront-logo"
                                />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-[var(--color-foreground)] mb-2">Header Image</p>
                                <ImageUpload
                                    value={settings.storefront_header_image_url}
                                    onChange={(url) => setSettings((prev) => ({ ...prev, storefront_header_image_url: url }))}
                                    consignorId={userRecord?.consignor_id || ''}
                                    itemId="storefront-header"
                                />
                            </div>
                        </div>

                        <div className="space-y-3 pt-2">
                            <label className="flex items-start gap-3 text-sm text-[var(--color-foreground)]">
                                <input
                                    type="checkbox"
                                    checked={settings.storefront_show_items}
                                    onChange={(e) => setSettings((prev) => ({ ...prev, storefront_show_items: e.target.checked }))}
                                    className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)]"
                                />
                                <span>Show my items on my public storefront page.</span>
                            </label>
                            <label className="flex items-start gap-3 text-sm text-[var(--color-foreground)]">
                                <input
                                    type="checkbox"
                                    checked={settings.storefront_images_only}
                                    onChange={(e) => setSettings((prev) => ({ ...prev, storefront_images_only: e.target.checked }))}
                                    className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)]"
                                />
                                <span>Only show items with images on my storefront page.</span>
                            </label>
                        </div>

                        <div className="pt-2">
                            <Button type="submit" isLoading={isSavingSettings}>
                                Save Storefront Settings
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardHeader>
                    <CardTitle className="text-sm">Item Visibility Controls</CardTitle>
                    <CardDescription>
                        Choose which items are shown, highlighted, or included in the main browse catalog.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by item name or SKU"
                        />
                    </div>

                    <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-[var(--color-surface)]">
                                <tr className="text-left">
                                    <th className="px-3 py-2 font-medium">Item</th>
                                    <th className="px-3 py-2 font-medium">Price</th>
                                    <th className="px-3 py-2 font-medium">Qty</th>
                                    <th className="px-3 py-2 font-medium">Show</th>
                                    <th className="px-3 py-2 font-medium">Main Browse</th>
                                    <th className="px-3 py-2 font-medium">Featured</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map((item) => (
                                    <tr key={item.id} className="border-t border-[var(--color-border)]">
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-md border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)] flex items-center justify-center">
                                                    {item.image_url ? (
                                                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-xs text-[var(--color-muted)]">No img</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-[var(--color-foreground)]">{item.name}</p>
                                                    <p className="text-xs text-[var(--color-muted)] font-mono">{item.sku}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">${Number(item.price).toFixed(2)}</td>
                                        <td className="px-3 py-2">{item.quantity}</td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={item.is_listed}
                                                onChange={(e) => updateItemField(item.id, 'is_listed', e.target.checked)}
                                                className="h-4 w-4 rounded border-[var(--color-border)]"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={item.show_in_public_browse}
                                                onChange={(e) => updateItemField(item.id, 'show_in_public_browse', e.target.checked)}
                                                disabled={!item.is_listed}
                                                className="h-4 w-4 rounded border-[var(--color-border)] disabled:opacity-50"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={item.storefront_featured}
                                                onChange={(e) => updateItemField(item.id, 'storefront_featured', e.target.checked)}
                                                disabled={!item.is_listed}
                                                className="h-4 w-4 rounded border-[var(--color-border)] disabled:opacity-50"
                                            />
                                        </td>
                                    </tr>
                                ))}
                                {filteredItems.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">
                                            No items found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
