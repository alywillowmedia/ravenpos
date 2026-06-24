import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const payoutSurfaceFiles = [
    'src/hooks/usePayouts.ts',
    'src/pages/Payouts.tsx',
    'src/pages/vendor/VendorPayouts.tsx',
    'src/pages/vendor/VendorSales.tsx',
    'src/lib/completedPayoutReport.ts',
    'src/components/payouts/CompletedPayoutDetails.tsx',
];

describe('vendor-specific store credit isolation', () => {
    it('does not feed customer vendor credit balances into vendor payout surfaces', () => {
        const forbiddenReferences = [
            'customer_vendor_store_credits',
            'adjust_customer_vendor_store_credit',
            'vendor_store_credits',
        ];

        for (const relativePath of payoutSurfaceFiles) {
            const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

            for (const forbiddenReference of forbiddenReferences) {
                expect(source, `${relativePath} should not reference ${forbiddenReference}`).not.toContain(forbiddenReference);
            }
        }
    });
});
