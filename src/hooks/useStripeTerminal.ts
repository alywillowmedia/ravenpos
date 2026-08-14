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
    setSimulatorConfiguration: (config: { testCardNumber?: string; collectInputsResult?: { resultType: string; skipBehavior?: string } }) => void;
    collectPaymentMethod: (clientSecret: string) => Promise<CollectResult>;
    processPayment: (paymentIntent: PaymentIntent) => Promise<ProcessResult>;
    collectInputs: (parameters: CollectInputsParameters) => Promise<CollectInputsResult>;
    cancelCollectInputs: () => Promise<ReaderDisplayResult>;
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

type CollectInputFormType = 'text' | 'phone' | 'email' | 'selection' | 'signature' | 'numeric';

interface CollectInputToggle {
    title: string;
    description?: string;
    defaultValue?: 'enabled' | 'disabled';
}

interface CollectInputRequest {
    id: 'customer_first_name' | 'customer_last_name' | 'customer_phone' | 'customer_email';
    formType: CollectInputFormType;
    title: string;
    description?: string;
    required?: boolean;
    skipButtonText?: string;
    submitButtonText?: string;
    toggles?: CollectInputToggle[];
}

interface CollectInputsParameters {
    inputs: CollectInputRequest[];
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

interface CollectInputResponse {
    [key: string]: unknown;
    id?: string;
    type?: CollectInputFormType;
    formType?: CollectInputFormType;
    form_type?: CollectInputFormType;
    inputType?: CollectInputFormType;
    input_type?: CollectInputFormType;
    value?: unknown;
    text?: unknown;
    email?: unknown;
    phone?: unknown;
    numeric?: unknown;
    selection?: unknown;
    signature?: unknown;
    required?: boolean | null;
    skipped?: boolean;
    toggles?: Array<{ value?: string; enabled?: boolean; skipped?: boolean }>;
    toggleResults?: Array<{ value?: string; enabled?: boolean; skipped?: boolean }>;
    toggle_results?: Array<{ value?: string; enabled?: boolean; skipped?: boolean }>;
}

export interface CollectInputsResult {
    error?: { message: string };
    inputs?: CollectInputResponse[];
    collectedInputs?: CollectInputResponse[];
    collected_inputs?: CollectInputResponse[];
    inputResults?: CollectInputResponse[];
    input_results?: CollectInputResponse[];
    collectInputs?: {
        inputs?: CollectInputResponse[];
    };
    collect_inputs?: {
        inputs?: CollectInputResponse[];
    };
    collectInputsResult?: {
        inputs?: CollectInputResponse[];
    };
    collect_inputs_result?: {
        inputs?: CollectInputResponse[];
    };
}

export interface ReaderCustomerInput {
    name: string;
    email: string | null;
    phone: string | null;
    acceptsMarketing: boolean;
}

export type TerminalStatus = 'not_initialized' | 'initialized' | 'discovering' | 'connecting' | 'connected' | 'collecting' | 'collecting_customer' | 'processing' | 'error';
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asCollectedInputs(value: unknown): CollectInputResponse[] | null {
    if (!Array.isArray(value) || !value.every(isRecord)) return null;
    const inputs = value as CollectInputResponse[];
    if (!inputs.some((input) => getInputKind(input) || 'value' in input || 'skipped' in input || 'toggles' in input)) {
        return null;
    }
    return inputs;
}

function valueAtPath(value: unknown, path: string[]): unknown {
    return path.reduce<unknown>((current, key) => {
        if (!isRecord(current)) return undefined;
        return current[key];
    }, value);
}

function findCollectedInputsDeep(value: unknown, depth = 0, seen = new Set<unknown>()): CollectInputResponse[] | null {
    if (depth > 5 || !value || seen.has(value)) return null;
    seen.add(value);

    const inputArray = asCollectedInputs(value);
    if (inputArray) return inputArray;

    if (!isRecord(value)) return null;

    for (const child of Object.values(value)) {
        const nested = findCollectedInputsDeep(child, depth + 1, seen);
        if (nested) return nested;
    }

    return null;
}

function getCollectedInputs(result: CollectInputsResult): CollectInputResponse[] {
    const paths = [
        ['inputs'],
        ['collectedInputs'],
        ['collected_inputs'],
        ['inputResults'],
        ['input_results'],
        ['collectInputs', 'inputs'],
        ['collect_inputs', 'inputs'],
        ['collectInputsResult', 'inputs'],
        ['collect_inputs_result', 'inputs'],
        ['reader', 'action', 'collectInputs', 'inputs'],
        ['reader', 'action', 'collect_inputs', 'inputs'],
        ['action', 'collectInputs', 'inputs'],
        ['action', 'collect_inputs', 'inputs'],
    ];

    for (const path of paths) {
        const inputs = asCollectedInputs(valueAtPath(result, path));
        if (inputs) return inputs;
    }

    return findCollectedInputsDeep(result) || [];
}

function getInputKind(input: CollectInputResponse | undefined): string | null {
    if (!input) return null;
    const explicitKind = input.type || input.formType || input.form_type || input.inputType || input.input_type;
    if (typeof explicitKind === 'string') return explicitKind;
    if (input.email !== undefined) return 'email';
    if (input.phone !== undefined) return 'phone';
    if (input.text !== undefined) return 'text';
    if (input.numeric !== undefined) return 'numeric';
    if (input.selection !== undefined) return 'selection';
    if (input.signature !== undefined) return 'signature';
    return null;
}

function getCollectedInput(result: CollectInputsResult, index: number, id: string, kind: CollectInputFormType): CollectInputResponse | undefined {
    const inputs = getCollectedInputs(result);
    return inputs.find((input) => input.id === id)
        || (getInputKind(inputs[index]) === kind ? inputs[index] : undefined)
        || inputs.find((input) => getInputKind(input) === kind)
        || inputs[index];
}

function getToggleEnabled(input: CollectInputResponse | undefined): boolean {
    const toggle = input?.toggles?.[0] || input?.toggleResults?.[0] || input?.toggle_results?.[0];
    if (!toggle || toggle.skipped) return false;
    if (typeof toggle.enabled === 'boolean') return toggle.enabled;
    return getPayloadValue(toggle) === 'enabled';
}

function getPayloadValue(payload: unknown, depth = 0): string {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (typeof payload === 'number') return String(payload);
    if (!isRecord(payload) || depth > 6) return '';

    const preferredKeys = [
        'value',
        'collectedValue',
        'collected_value',
        'answer',
        'response',
        'result',
        'data',
        'input',
        'stringValue',
        'string_value',
        'text',
        'email',
        'phone',
        'id',
    ];

    for (const key of preferredKeys) {
        const value = getPayloadValue(payload[key], depth + 1);
        if (value) return value;
    }

    const allowedEntries = Object.entries(payload).filter(([key]) => ![
        'title',
        'description',
        'custom_text',
        'customText',
        'skipButtonText',
        'submitButtonText',
        'skip_button',
        'submit_button',
        'toggles',
        'toggleResults',
        'toggle_results',
    ].includes(key));

    if (allowedEntries.length === 1) {
        return getPayloadValue(allowedEntries[0][1], depth + 1);
    }

    return '';
}

function getInputValue(input: CollectInputResponse | undefined): string {
    if (!input) return '';
    const kind = getInputKind(input);
    const kindPayload = kind && kind in input ? getPayloadValue(input[kind]) : '';
    if (kindPayload) return kindPayload;

    const values = [
        getPayloadValue(input.value),
        getPayloadValue(input.text),
        getPayloadValue(input.email),
        getPayloadValue(input.phone),
        getPayloadValue(input.numeric),
        getPayloadValue(input.selection),
        getPayloadValue(input.signature),
        getPayloadValue(input.result),
        getPayloadValue(input.data),
        getPayloadValue(input.answer),
        getPayloadValue(input.response),
        getPayloadValue(input.collectedValue),
        getPayloadValue(input.collected_value),
    ];
    return values.find((value) => value !== undefined && value !== null && value !== '') || '';
}

export function parseReaderCustomerInput(result: CollectInputsResult): ReaderCustomerInput | null {
    const inputs = getCollectedInputs(result);
    const usesSplitNameInputs = inputs.some((input) => (
        input.id === 'customer_first_name' || input.id === 'customer_last_name'
    )) || inputs.filter((input) => getInputKind(input) === 'text').length >= 2;

    const firstNameInput = getCollectedInput(result, 0, 'customer_first_name', 'text');
    const lastNameInput = usesSplitNameInputs
        ? getCollectedInput(result, 1, 'customer_last_name', 'text')
        : undefined;
    const phoneInput = getCollectedInput(result, usesSplitNameInputs ? 2 : 1, 'customer_phone', 'phone');
    const emailInput = getCollectedInput(result, usesSplitNameInputs ? 3 : 2, 'customer_email', 'email');
    const firstName = getInputValue(firstNameInput).trim();
    const lastName = getInputValue(lastNameInput).trim();
    const name = usesSplitNameInputs ? `${firstName} ${lastName}`.trim() : firstName;

    if (!firstName || (usesSplitNameInputs && !lastName)) {
        return null;
    }

    return {
        name,
        phone: phoneInput?.skipped ? null : getInputValue(phoneInput).trim() || null,
        email: emailInput?.skipped ? null : getInputValue(emailInput).trim() || null,
        acceptsMarketing: getToggleEnabled(emailInput),
    };
}

export function describeCollectInputsShape(result: CollectInputsResult): string {
    const topLevelKeys = isRecord(result) ? Object.keys(result).slice(0, 8).join(',') : typeof result;
    const inputs = getCollectedInputs(result);
    if (inputs.length === 0) return `top-level keys: ${topLevelKeys || 'none'}; no input array found`;

    const inputSummary = inputs.slice(0, 5).map((input, index) => {
        const keys = Object.keys(input).slice(0, 8).join(',');
        return `input${index}[type=${getInputKind(input) || 'unknown'} keys=${keys || 'none'}]`;
    }).join(' ');

    return `top-level keys: ${topLevelKeys || 'none'}; ${inputSummary}`;
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

    const collectCustomerInputs = useCallback(async (): Promise<{ data: ReaderCustomerInput | null; error: string | null }> => {
        if (!terminalRef.current || !connectedReader) {
            return { data: null, error: 'No reader connected' };
        }

        setStatus('collecting_customer');
        setError(null);
        readerDisplaySignatureRef.current = null;

        try {
            if (isSimulated) {
                terminalRef.current.setSimulatorConfiguration({
                    testCardNumber: '4242424242424242',
                    collectInputsResult: { resultType: 'succeeded', skipBehavior: 'none' },
                });
            }

            const result = await terminalRef.current.collectInputs({
                inputs: [
                    {
                        id: 'customer_first_name',
                        formType: 'text',
                        title: 'First Name',
                        description: 'Enter your first name to start your customer profile.',
                        required: true,
                        submitButtonText: 'Continue',
                    },
                    {
                        id: 'customer_last_name',
                        formType: 'text',
                        title: 'Last Name',
                        description: 'Enter your last name to complete your customer profile.',
                        required: true,
                        submitButtonText: 'Continue',
                    },
                    {
                        id: 'customer_phone',
                        formType: 'phone',
                        title: 'Phone Number',
                        description: 'Optional. Use this to find your profile next time.',
                        required: false,
                        skipButtonText: 'Skip',
                        submitButtonText: 'Continue',
                    },
                    {
                        id: 'customer_email',
                        formType: 'email',
                        title: 'Email',
                        description: 'Optional. Add email and choose whether to join the email list.',
                        required: false,
                        skipButtonText: 'Skip',
                        submitButtonText: 'Save',
                        toggles: [
                            {
                                title: 'Join email list',
                                description: 'Get updates and offers',
                                defaultValue: 'disabled',
                            },
                        ],
                    },
                ],
            });

            if (result.error) {
                setError(result.error.message);
                setStatus('connected');
                return { data: null, error: result.error.message };
            }

            const customerInput = parseReaderCustomerInput(result);

            if (!customerInput) {
                const shape = describeCollectInputsShape(result);
                console.warn('Unable to parse Stripe Terminal customer input result', shape);
                const message = `Customer name was not entered. Reader result: ${shape}`;
                setError(message);
                setStatus('connected');
                return { data: null, error: message };
            }

            setStatus('connected');
            return {
                data: customerInput,
                error: null,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Customer entry failed';
            setError(message);
            setStatus('connected');
            return { data: null, error: message };
        }
    }, [connectedReader, isSimulated]);

    const cancelCustomerInputs = useCallback(async (): Promise<void> => {
        if (!terminalRef.current) return;

        try {
            await terminalRef.current.cancelCollectInputs();
        } catch {
            // Ignore cancel errors; the reader may have already finished or canceled the flow.
        } finally {
            setStatus(connectedReader ? 'connected' : 'initialized');
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
        collectCustomerInputs,
        cancelCustomerInputs,
        collectCardPayment,
        cancelPayment,
    };
}
