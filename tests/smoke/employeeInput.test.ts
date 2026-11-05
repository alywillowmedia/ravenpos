import { describe, expect, it } from 'vitest';
import { toEmployeeUpdate } from '../../src/lib/employeeInput';

describe('toEmployeeUpdate', () => {
    const input = {
        name: 'June Alvarez',
        pin: '1234',
        hourly_rate: 16.5,
        is_active: true,
        employer: 'Ravenlia' as const,
        employment_type: 'w2',
        address_line_1: '12 Mill Rd',
        address_line_2: 'Apt 3',
        city: 'Staunton',
        state: 'VA',
        postal_code: '24401',
        country: 'US',
    };

    it('keeps the address when editing an employee', () => {
        expect(toEmployeeUpdate(input)).toMatchObject({
            address_line_1: '12 Mill Rd',
            address_line_2: 'Apt 3',
            city: 'Staunton',
            state: 'VA',
            postal_code: '24401',
            country: 'US',
        });
    });

    it('never sends the raw PIN as an employee field', () => {
        expect(toEmployeeUpdate(input)).not.toHaveProperty('pin');
    });
});
