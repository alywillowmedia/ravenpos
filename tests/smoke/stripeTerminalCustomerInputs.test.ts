import { describe, expect, it } from 'vitest';
import { parseReaderCustomerInput, type CollectInputsResult } from '../../src/hooks/useStripeTerminal';

describe('Stripe Terminal customer input parsing', () => {
    it('reads nested values returned by collected reader inputs', () => {
        const result: CollectInputsResult = {
            collectInputs: {
                inputs: [
                    {
                        type: 'text',
                        text: { value: 'Jane Raven' },
                        required: true,
                    },
                    {
                        type: 'phone',
                        phone: { value: '+1 (555) 123-4567' },
                    },
                    {
                        type: 'email',
                        email: { value: 'JANE@EXAMPLE.COM' },
                        toggles: [{ value: 'enabled' }],
                    },
                ],
            },
        };

        expect(parseReaderCustomerInput(result)).toEqual({
            name: 'Jane Raven',
            phone: '+1 (555) 123-4567',
            email: 'JANE@EXAMPLE.COM',
            acceptsMarketing: true,
        });
    });

    it('continues to support flat simulator-style input values', () => {
        const result: CollectInputsResult = {
            inputs: [
                { id: 'customer_name', value: 'Sim Customer' },
                { id: 'customer_phone', phone: '5551234567' },
                { id: 'customer_email', email: 'sim@example.com', toggleResults: [{ enabled: true }] },
            ],
        };

        expect(parseReaderCustomerInput(result)).toEqual({
            name: 'Sim Customer',
            phone: '5551234567',
            email: 'sim@example.com',
            acceptsMarketing: true,
        });
    });

    it('treats skipped optional contact fields as empty', () => {
        const result: CollectInputsResult = {
            collect_inputs: {
                inputs: [
                    { type: 'text', text: { value: 'Name Only' } },
                    { type: 'phone', skipped: true, phone: { value: null } },
                    { type: 'email', skipped: true, email: { value: null }, toggles: [{ value: 'skipped', skipped: true }] },
                ],
            },
        };

        expect(parseReaderCustomerInput(result)).toEqual({
            name: 'Name Only',
            phone: null,
            email: null,
            acceptsMarketing: false,
        });
    });
});
