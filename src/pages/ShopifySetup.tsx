import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { supabase } from '../lib/supabase';

interface ShopifyLocation {
    id: string;
    name: string;
    address: string;
}

interface ShopifyConfigData {
    id?: string;
    store_name: string;
    location_id: string;
    location_name: string;
    webhook_secret: string;
    consignor_name: string;
    is_active: boolean;
}

type WizardStep = 'store' | 'location' | 'webhook' | 'done';

export function ShopifySetup() {
    const navigate = useNavigate();

    // Current step
    const [step, setStep] = useState<WizardStep>('store');

    // Form data
    const [storeName, setStoreName] = useState('');
    const [locations, setLocations] = useState<ShopifyLocation[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<ShopifyLocation | null>(null);
    const [webhookSecret, setWebhookSecret] = useState('');
    const [consignorName, setConsignorName] = useState('Shopify Import');

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [existingConfig, setExistingConfig] = useState<ShopifyConfigData | null>(null);

    // Load existing config on mount
    useEffect(() => {
        async function loadConfig() {
            const { data } = await supabase
                .from('shopify_config')
                .select('*')
                .eq('is_active', true)
                .single();

            if (data) {
                setExistingConfig(data);
                setStoreName(data.store_name);
                setWebhookSecret(data.webhook_secret);
                setConsignorName(data.consignor_name || 'Shopify Import');
            }
        }
        loadConfig();
    }, []);

    // Step 1: Connect to store and fetch locations
    async function handleConnectStore() {
        if (!storeName.trim()) {
            setError('Please enter your store name');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const { data, error: invokeError } = await supabase.functions.invoke('get-shopify-locations', {
                body: { store_name: storeName.trim() }
            });

            if (invokeError) throw invokeError;
            if (!data.success) throw new Error(data.error || 'Failed to connect');

            setLocations(data.locations);

            // Auto-select if only one location
            if (data.locations.length === 1) {
                setSelectedLocation(data.locations[0]);
            }

            setStep('location');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect to store');
        } finally {
            setIsLoading(false);
        }
    }

    // Step 2: Select location and continue
    function handleSelectLocation() {
        if (!selectedLocation) {
            setError('Please select a location');
            return;
        }
        setError(null);
        setStep('webhook');
    }

    // Step 3: Save webhook secret and complete setup
    async function handleSaveConfig() {
        if (!webhookSecret.trim()) {
            setError('Please enter the webhook signing secret');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Deactivate any existing config
            await supabase
                .from('shopify_config')
                .update({ is_active: false })
                .eq('is_active', true);

            // Insert new config
            const { error: insertError } = await supabase
                .from('shopify_config')
                .insert({
                    store_name: storeName.trim(),
                    location_id: selectedLocation!.id,
                    location_name: selectedLocation!.name,
                    webhook_secret: webhookSecret.trim(),
                    consignor_name: consignorName.trim() || 'Shopify Import',
                    is_active: true
                });

            if (insertError) throw insertError;

            setStep('done');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save configuration');
        } finally {
            setIsLoading(false);
        }
    }

    const webhookUrl = `https://yspvjudgjicrdtmtddeg.supabase.co/functions/v1/shopify-webhook`;

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <Header
                title="Shopify Store Setup"
                description="Connect a Shopify store to sync inventory"
            />

            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-2 my-8">
                {(['store', 'location', 'webhook', 'done'] as WizardStep[]).map((s, i) => (
                    <div key={s} className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === s
                                ? 'bg-[var(--color-primary)] text-white'
                                : i < ['store', 'location', 'webhook', 'done'].indexOf(step)
                                    ? 'bg-[var(--color-success)] text-white'
                                    : 'bg-[var(--color-surface)] text-[var(--color-muted)]'
                            }`}>
                            {i < ['store', 'location', 'webhook', 'done'].indexOf(step) ? '✓' : i + 1}
                        </div>
                        {i < 3 && (
                            <div className={`w-12 h-0.5 ${i < ['store', 'location', 'webhook', 'done'].indexOf(step)
                                    ? 'bg-[var(--color-success)]'
                                    : 'bg-[var(--color-border)]'
                                }`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-6 p-4 bg-[var(--color-danger-bg)] border border-[var(--color-danger)] rounded-lg">
                    <p className="text-[var(--color-danger)]">{error}</p>
                </div>
            )}

            {/* Existing Config Notice */}
            {existingConfig && step === 'store' && (
                <div className="mb-6 p-4 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg">
                    <p className="font-medium text-[var(--color-foreground)]">Currently Connected</p>
                    <p className="text-sm text-[var(--color-muted)]">
                        {existingConfig.store_name}.myshopify.com • {existingConfig.location_name}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-muted)]">
                        Setting up a new connection will replace the current one.
                    </p>
                </div>
            )}

            {/* Step 1: Store Name */}
            {step === 'store' && (
                <Card>
                    <CardContent className="p-6">
                        <h2 className="text-lg font-semibold mb-2">Step 1: Enter Your Store</h2>
                        <p className="text-sm text-[var(--color-muted)] mb-4">
                            Enter your Shopify store name (the part before .myshopify.com)
                        </p>

                        <div className="flex gap-2 items-end">
                            <div className="flex-1">
                                <Input
                                    value={storeName}
                                    onChange={(e) => setStoreName(e.target.value)}
                                    placeholder="your-store-name"
                                    inputSize="lg"
                                />
                            </div>
                            <span className="text-[var(--color-muted)] pb-2">.myshopify.com</span>
                        </div>

                        <Button
                            onClick={handleConnectStore}
                            isLoading={isLoading}
                            className="mt-4 w-full"
                            size="lg"
                        >
                            Connect to Store
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Select Location */}
            {step === 'location' && (
                <Card>
                    <CardContent className="p-6">
                        <h2 className="text-lg font-semibold mb-2">Step 2: Select Location</h2>
                        <p className="text-sm text-[var(--color-muted)] mb-4">
                            Choose which inventory location to sync with RavenPOS
                        </p>

                        <div className="space-y-2">
                            {locations.map((loc) => (
                                <button
                                    key={loc.id}
                                    onClick={() => setSelectedLocation(loc)}
                                    className={`w-full p-4 rounded-lg border text-left transition-colors ${selectedLocation?.id === loc.id
                                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                            : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                                        }`}
                                >
                                    <p className="font-medium">{loc.name}</p>
                                    <p className="text-sm text-[var(--color-muted)]">{loc.address}</p>
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <Button variant="secondary" onClick={() => setStep('store')}>
                                Back
                            </Button>
                            <Button
                                onClick={handleSelectLocation}
                                className="flex-1"
                                disabled={!selectedLocation}
                            >
                                Continue
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Webhook Secret */}
            {step === 'webhook' && (
                <Card>
                    <CardContent className="p-6">
                        <h2 className="text-lg font-semibold mb-2">Step 3: Webhook Setup</h2>

                        <div className="bg-[var(--color-surface)] p-4 rounded-lg mb-4">
                            <p className="text-sm font-medium mb-2">In Shopify Admin:</p>
                            <ol className="text-sm text-[var(--color-muted)] space-y-1 list-decimal list-inside">
                                <li>Go to Settings → Notifications → Webhooks</li>
                                <li>Click "Create webhook"</li>
                                <li>Event: <strong>Inventory level update</strong></li>
                                <li>Format: <strong>JSON</strong></li>
                                <li>URL: Copy the URL below</li>
                            </ol>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Webhook URL</label>
                            <div className="flex gap-2">
                                <Input
                                    value={webhookUrl}
                                    readOnly
                                    className="font-mono text-xs"
                                />
                                <Button
                                    variant="secondary"
                                    onClick={() => navigator.clipboard.writeText(webhookUrl)}
                                >
                                    Copy
                                </Button>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Webhook Signing Secret</label>
                            <p className="text-xs text-[var(--color-muted)] mb-2">
                                Found at the bottom of the Webhooks page in Shopify
                            </p>
                            <Input
                                value={webhookSecret}
                                onChange={(e) => setWebhookSecret(e.target.value)}
                                placeholder="6a227acfb684..."
                                className="font-mono"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Consignor Name (for imported items)</label>
                            <Input
                                value={consignorName}
                                onChange={(e) => setConsignorName(e.target.value)}
                                placeholder="Shopify Import"
                            />
                        </div>

                        <div className="flex gap-3 mt-6">
                            <Button variant="secondary" onClick={() => setStep('location')}>
                                Back
                            </Button>
                            <Button
                                onClick={handleSaveConfig}
                                isLoading={isLoading}
                                className="flex-1"
                            >
                                Complete Setup
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 4: Done */}
            {step === 'done' && (
                <Card>
                    <CardContent className="p-6 text-center">
                        <div className="w-16 h-16 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center mx-auto mb-4">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </div>

                        <h2 className="text-xl font-semibold mb-2">Store Connected!</h2>
                        <p className="text-[var(--color-muted)] mb-6">
                            {storeName}.myshopify.com is now connected to RavenPOS
                        </p>

                        <div className="bg-[var(--color-surface)] p-4 rounded-lg text-left mb-6">
                            <p className="font-medium mb-2">What's next?</p>
                            <ul className="text-sm text-[var(--color-muted)] space-y-1">
                                <li>• Go to Integrations and click "Import Products"</li>
                                <li>• Your inventory will stay in sync automatically</li>
                            </ul>
                        </div>

                        <Button onClick={() => navigate('/admin/integrations')} size="lg">
                            Go to Integrations
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
