import type { EmployeeInput } from '../types/employee';

export function toEmployeeUpdate(input: EmployeeInput) {
    return {
        name: input.name,
        hourly_rate: input.hourly_rate,
        is_active: input.is_active,
        employer: input.employer,
        employment_type: input.employment_type,
        address_line_1: input.address_line_1,
        address_line_2: input.address_line_2,
        city: input.city,
        state: input.state,
        postal_code: input.postal_code,
        country: input.country,
    };
}
