import { useState, useCallback, useEffect, useRef } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Helper to extract error message from Supabase function errors
async function extractFunctionError(error: unknown): Promise<string> {
    if (error instanceof FunctionsHttpError) {
        try {
            const errData = await error.context.json();
            return errData?.error?.message || errData?.error || error.message;
        } catch {
            return error.message;
        }
    }
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : 'Unknown error';
}

// Stripe Terminal types (from global StripeTerminal SDK)
declare global {
    interface Window {
        StripeTerminal: {
            create: (config: {
                onFetchConnectionToken: () => Promise<string>;
                onUnexpectedReaderDisconnect: () => void;
            }) => Terminal;
        };
    }
}

interface Terminal {
    discoverReaders: (config: {
        simulated: boolean;
        location?: string;
        discoveryMethod?: 'internet';
    }) => Promise<DiscoverResult>;
    connectReader: (reader: Reader) => Promise<ConnectResult>;
    disconnectReader: () => Promise<void>;
    setSimulatorConfiguration: (config: { testCardNumber: string }) => void;
    collectPaymentMethod: (clientSecret: string) => Promise<CollectResult>;
    processPayment: (paymentIntent: PaymentIntent) => Promise<ProcessResult>;
    setReaderDisplay: (displayInfo: ReaderDisplayInfo) => Promise<ReaderDisplayResult>;
    clearReaderDisplay: () => Promise<void>;
    getConnectionStatus: () => string;
}

export interface ReaderCartDisplayItem {
    description: string;
    amount: number;
    quantity: number;
}

export interface ReaderCartDisplay {
    lineItems: ReaderCartDisplayItem[];
    tax: number;
    total: number;
    currency?: string;
}

interface ReaderDisplayInfo {
    type: 'cart';
    cart: {
        line_items: ReaderCartDisplayItem[];
        tax: number;
        total: number;
        currency: string;
    };
}

interface Reader {
    id: string;
    label: string;
    device_type: string;
    status: string;
}

interface DiscoverResult {
    error?: { message: string };
    discoveredReaders?: Reader[];
}

interface ConnectResult {
    error?: { message: string };
    reader?: Reader;
}

interface PaymentIntent {
    id: string;
    status: string;
    amount: number;
}

interface CollectResult {
    error?: { message: string };
    paymentIntent?: PaymentIntent;
}

interface ProcessResult {
    error?: { message: string };
    paymentIntent?: PaymentIntent;
}

interface ReaderDisplayResult {
    error?: { message: string };
}

export type TerminalStatus = 'not_initialized' | 'initialized' | 'discovering' | 'connecting' | 'connected' | 'collecting' | 'processing' | 'error';
export interface ReaderDiscoveryConfig {
    simulated?: boolean;
    locationId?: string;
}

export interface ReaderReconnectConfig {
    simulated?: boolean;
    locationId?: string;
    readerId: string;
}

export interface ReaderRegistrationConfig {
    registrationCode: string;
    locationId: string;
    label?: string;
}

export function useStripeTerminal() {
    const terminalRef = useRef<Terminal | null>(null);
    const readerDisplaySignatureRef = useRef<string | null>(null);
    const [status, setStatus] = useState<TerminalStatus>('not_initialized');
    const [error, setError] = useState<string | null>(null);
    const [discoveredReaders, setDiscoveredReaders] = useState<Reader[]>([]);
    const [connectedReader, setConnectedReader] = useState<Reader | null>(null);
    const [isSimulated, setIsSimulated] = useState(true);

    // Fetch connection token from our edge function
    const fetchConnectionToken = useCallback(async (): Promise<string> => {
        try {
            const { data, error } = await supabase.functions.invoke('stripe-terminal', {
                body: { action: 'connection_token' },
            });

            if (error) {
                const errorMessage = await extractFunctionError(error);
                throw new Error(errorMessage);
            }

            if (!data?.secret) {
                throw new Error('No connection token returned');
            }

            return data.secret;
        } catch (err) {
            const errorMessage = await extractFunctionError(err);
            console.error('fetchConnectionToken error:', errorMessage);
            throw new Error(errorMessage);
        }
    }, []);

    // Initialize the terminal SDK
    const initializeTerminal = useCallback(async () => {
        if (terminalRef.current) return;

        if (!window.StripeTerminal) {
            setError('Stripe Terminal SDK not loaded');
            setStatus('error');
            return;
        }

        try {
            terminalRef.current = window.StripeTerminal.create({
                onFetchConnectionToken: fetchConnectionToken,
                onUnexpectedReaderDisconnect: () => {
                    setConnectedReader(null);
                    setStatus('initialized');
                    setError('Reader disconnected unexpectedly');
                },
            });
            setStatus('initialized');
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to initialize terminal');
            setStatus('error');
        }
    }, [fetchConnectionToken]);

    // Discover available readers
    const discoverReaders = useCallback(async ({ simulated = true, locationId }: ReaderDiscoveryConfig = {}): Promise<Reader[]> => {
        if (!terminalRef.current) {
            await initializeTerminal();
        }

        if (!terminalRef.current) return [];

        const trimmedLocationId = locationId?.trim();
        setIsSimulated(simulated);
        setStatus('discovering');
        setError(null);

        try {
            const discoverConfig: {
                simulated: boolean;
                location?: string;
                discoveryMethod?: 'internet';
            } = { simulated };
            if (!simulated && trimmedLocationId) {
                discoverConfig.location = trimmedLocationId;
                discoverConfig.discoveryMethod = 'internet';
            }

            const result = await terminalRef.current.discoverReaders(discoverConfig);

            if (result.error) {
                setError(result.error.message);
                setStatus('error');
                return [];
            }

            const readers = result.discoveredReaders || [];
            setDiscoveredReaders(readers);
            setStatus('initialized');
            return readers;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to discover readers');
            setStatus('error');
            return [];
        }
    }, [initializeTerminal]);

    // Connect to a reader
    const connectReader = useCallback(async (reader: Reader): Promise<boolean> => {
        if (!terminalRef.current) return false;

        setStatus('connecting');
        setError(null);

        try {
            const result = await terminalRef.current.connectReader(reader);

            if (result.error) {
                setError(result.error.message);
                setStatus('error');
                return false;
            }

            readerDisplaySignatureRef.current = null;
            setConnectedReader(result.reader || null);
            setStatus('connected');
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect to reader');
            setStatus('error');
            return false;
        }
    }, []);

    // Reconnect to a specific reader by id
    const reconnectReaderById = useCallback(async ({
        simulated = true,
        locationId,
        readerId,
    }: ReaderReconnectConfig): Promise<boolean> => {
        if (!readerId.trim()) return false;

        const readers = await discoverReaders({ simulated, locationId });
        const preferredReader = readers.find((reader) => reader.id === readerId);
        if (!preferredReader) {
            return false;
        }

        return connectReader(preferredReader);
    }, [connectReader, discoverReaders]);

    const registerReaderByCode = useCallback(async ({
        registrationCode,
        locationId,
        label,
    }: ReaderRegistrationConfig): Promise<boolean> => {
        try {
            const { error } = await supabase.functions.invoke('stripe-terminal', {
                body: {
                    action: 'register_reader',
                    registrationCode,
                    locationId,
                    label,
                },
            });

            if (error) {
                const message = await extractFunctionError(error);
                setError(message);
                setStatus('error');
                return false;
            }

            setError(null);
            setStatus('initialized');
            return true;
        } catch (err) {
            const message = await extractFunctionError(err);
            setError(message);
            setStatus('error');
            return false;
        }
    }, []);

    // Disconnect from reader
    const disconnectReader = useCallback(async () => {
        if (!terminalRef.current) return;

        try {
            await terminalRef.current.clearReaderDisplay().catch(() => undefined);
            await terminalRef.current.disconnectReader();
            readerDisplaySignatureRef.current = null;
            setConnectedReader(null);
            setStatus('initialized');
        } catch {
            // Ignore disconnect errors
        }
    }, []);

    const setReaderCartDisplay = useCallback(async ({
        lineItems,
        tax,
        total,
        currency = 'usd',
    }: ReaderCartDisplay): Promise<boolean> => {
        if (!terminalRef.current || !connectedReader || lineItems.length === 0) {
            return false;
        }

        const displayInfo: ReaderDisplayInfo = {
            type: 'cart',
            cart: {
                line_items: lineItems,
                tax,
                total,
                currency,
            },
        };
        const signature = JSON.stringify(displayInfo);
        if (readerDisplaySignatureRef.current === signature) {
            return true;
        }

        try {
            const result = await terminalRef.current.setReaderDisplay(displayInfo);
            if (result.error) {
                setError(result.error.message);
                return false;
            }

            readerDisplaySignatureRef.current = signature;
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update reader display');
            return false;
        }
    }, [connectedReader]);

    const clearReaderCartDisplay = useCallback(async (): Promise<void> => {
        if (!terminalRef.current || !connectedReader || readerDisplaySignatureRef.current === null) {
            return;
        }

        try {
            await terminalRef.current.clearReaderDisplay();
        } catch {
            // Reader display cleanup should not block checkout or disconnect flows.
        } finally {
            readerDisplaySignatureRef.current = null;
        }
    }, [connectedReader]);

    // Create payment intent
    const createPaymentIntent = useCallback(async (amountInCents: number) => {
        try {
            const { data, error } = await supabase.functions.invoke('stripe-terminal', {
                body: { action: 'create_payment_intent', amount: amountInCents },
            });

            if (error) {
                const errorMessage = await extractFunctionError(error);
                throw new Error(errorMessage);
            }

            return data;
        } catch (err) {
            const errorMessage = await extractFunctionError(err);
            console.error('createPaymentIntent error:', errorMessage);
            throw new Error(errorMessage);
        }
    }, []);

    // Collect card payment
    const collectCardPayment = useCallback(async (amountInCents: number): Promise<{ paymentIntentId: string; cardLast4?: string; error: string | null }> => {
        if (!terminalRef.current || !connectedReader) {
            return { paymentIntentId: '', error: 'No reader connected' };
        }

        setStatus('collecting');
        setError(null);

        try {
            // Create payment intent on backend
            const paymentIntent = await createPaymentIntent(amountInCents);

            // Set simulator to use test card (for simulated reader)
            if (isSimulated) {
                terminalRef.current.setSimulatorConfiguration({ testCardNumber: '4242424242424242' });
            }

            // Collect payment method from the reader
            const collectResult = await terminalRef.current.collectPaymentMethod(paymentIntent.client_secret);

            if (collectResult.error) {
                setError(collectResult.error.message);
                setStatus('connected');
                return { paymentIntentId: '', error: collectResult.error.message };
            }

            // Process the payment
            setStatus('processing');
            const processResult = await terminalRef.current.processPayment(collectResult.paymentIntent!);

            if (processResult.error) {
                setError(processResult.error.message);
                setStatus('connected');
                return { paymentIntentId: '', error: processResult.error.message };
            }

            setStatus('connected');
            const paymentIntentId = processResult.paymentIntent!.id;
            let cardLast4: string | undefined;

            try {
                const { data, error: detailsError } = await supabase.functions.invoke('stripe-terminal', {
                    body: { action: 'get_payment_intent', paymentIntentId },
                });

                if (!detailsError && data?.card_last4) {
                    cardLast4 = String(data.card_last4);
                }
            } catch (detailsErr) {
                const detailsMessage = await extractFunctionError(detailsErr);
                console.warn('Unable to fetch card last4 for receipt:', detailsMessage);
            }

            return { paymentIntentId, cardLast4, error: null };

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Payment failed';
            setError(message);
            setStatus('connected');
            return { paymentIntentId: '', error: message };
        }
    }, [connectedReader, createPaymentIntent, isSimulated]);

    // Cancel current operation
    const cancelPayment = useCallback(async (paymentIntentId: string) => {
        try {
            const { error } = await supabase.functions.invoke('stripe-terminal', {
                body: { action: 'cancel_payment_intent', paymentIntentId },
            });
            if (error) {
                const errorMessage = await extractFunctionError(error);
                console.error('cancelPayment error:', errorMessage);
            }
        } catch (err) {
            // Log but don't throw - cancel errors are non-critical
            const errorMessage = await extractFunctionError(err);
            console.error('cancelPayment error:', errorMessage);
        }
        setStatus('connected');
    }, []);

    // Auto-initialize when SDK is available
    useEffect(() => {
        const checkAndInit = () => {
            if (window.StripeTerminal && !terminalRef.current) {
                initializeTerminal();
            }
        };

        // Check immediately
        checkAndInit();

        // Also check after a delay in case SDK loads late
        const timer = setTimeout(checkAndInit, 1000);

        // Cleanup on unmount - critical for HMR/hot reloads in development
        // This prevents stale connection tokens from being reused
        return () => {
            clearTimeout(timer);
            // Clear the terminal reference so a fresh instance is created on remount
            // This ensures a new connection token is fetched
            terminalRef.current = null;
        };
    }, [initializeTerminal]);

    return {
        status,
        error,
        discoveredReaders,
        connectedReader,
        isSimulated,
        initializeTerminal,
        discoverReaders,
        reconnectReaderById,
        registerReaderByCode,
        connectReader,
        disconnectReader,
        setReaderCartDisplay,
        clearReaderCartDisplay,
        collectCardPayment,
        cancelPayment,
    };
}
