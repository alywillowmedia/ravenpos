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
    discoverReaders: (config: { simulated: boolean }) => Promise<DiscoverResult>;
    connectReader: (reader: Reader) => Promise<ConnectResult>;
    disconnectReader: () => Promise<void>;
    setSimulatorConfiguration: (config: { testCardNumber: string }) => void;
    collectPaymentMethod: (clientSecret: string) => Promise<CollectResult>;
    processPayment: (paymentIntent: PaymentIntent) => Promise<ProcessResult>;
    clearReaderDisplay: () => Promise<void>;
    getConnectionStatus: () => string;
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

export type TerminalStatus = 'not_initialized' | 'initialized' | 'discovering' | 'connecting' | 'connected' | 'collecting' | 'processing' | 'error';

export function useStripeTerminal() {
    const terminalRef = useRef<Terminal | null>(null);
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
    const discoverReaders = useCallback(async (simulated: boolean = true) => {
        if (!terminalRef.current) {
            await initializeTerminal();
        }

        if (!terminalRef.current) return;

        setIsSimulated(simulated);
        setStatus('discovering');
        setError(null);

        try {
            const result = await terminalRef.current.discoverReaders({ simulated });

            if (result.error) {
                setError(result.error.message);
                setStatus('error');
                return;
            }

            setDiscoveredReaders(result.discoveredReaders || []);
            setStatus('initialized');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to discover readers');
            setStatus('error');
        }
    }, [initializeTerminal]);

    // Connect to a reader
    const connectReader = useCallback(async (reader: Reader) => {
        if (!terminalRef.current) return;

        setStatus('connecting');
        setError(null);

        try {
            const result = await terminalRef.current.connectReader(reader);

            if (result.error) {
                setError(result.error.message);
                setStatus('error');
                return;
            }

            setConnectedReader(result.reader || null);
            setStatus('connected');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect to reader');
            setStatus('error');
        }
    }, []);

    // Disconnect from reader
    const disconnectReader = useCallback(async () => {
        if (!terminalRef.current) return;

        try {
            await terminalRef.current.disconnectReader();
            setConnectedReader(null);
            setStatus('initialized');
        } catch (err) {
            // Ignore disconnect errors
        }
    }, []);

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
    const collectCardPayment = useCallback(async (amountInCents: number): Promise<{ paymentIntentId: string; error: string | null }> => {
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
            return { paymentIntentId: processResult.paymentIntent!.id, error: null };

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
        return () => clearTimeout(timer);
    }, [initializeTerminal]);

    return {
        status,
        error,
        discoveredReaders,
        connectedReader,
        isSimulated,
        initializeTerminal,
        discoverReaders,
        connectReader,
        disconnectReader,
        collectCardPayment,
        cancelPayment,
    };
}
