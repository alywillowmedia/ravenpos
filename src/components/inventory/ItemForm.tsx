import { useState, FormEvent } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { ImageUpload } from '../ui/ImageUpload';
import type { Consignor, Item } from '../../types';

interface ItemFormProps {
    item?: Item;
    consignors: Consignor[];
    categories: string[];
    onSubmit: (data: Partial<Item>) => Promise<{ error: string | null }>;
    onCancel: () => void;
    hideConsignor?: boolean;
    defaultConsignorId?: string;
}

export function ItemForm({
    item,
    consignors,
    categories,
    onSubmit,
    onCancel,
    hideConsignor,
    defaultConsignorId,
}: ItemFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        consignor_id: item?.consignor_id || defaultConsignorId || '',
        sku: item?.sku || '',
        name: item?.name || '',
        variant: item?.variant || '',
        category: item?.category || 'Other',
        quantity: item?.quantity ?? 1,
        price: item?.price ?? 0,
        image_url: item?.image_url || null,
    });

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!formData.consignor_id) {
            setError('Please select a consignor');
            return;
        }
        if (!formData.name.trim()) {
            setError('Name is required');
            return;
        }
        if (formData.price <= 0) {
            setError('Price must be greater than 0');
            return;
        }

        setIsSubmitting(true);
        const result = await onSubmit(formData);
        setIsSubmitting(false);

        if (result.error) {
            setError(result.error);
        }
    };

    const updateField = (field: string, value: string | number | null) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const consignorOptions = consignors.map((c) => ({
        value: c.id,
        label: `${c.consignor_number} - ${c.name}`,
    }));

    const categoryOptions = categories.map((name) => ({
        value: name,
        label: name,
    }));

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {error}
                </div>
            )}

            {!hideConsignor && (
                <Select
                    label="Consignor"
                    options={consignorOptions}
                    value={formData.consignor_id}
                    onChange={(e) => updateField('consignor_id', e.target.value)}
                    placeholder="Select consignor..."
                    required
                />
            )}

            <Input
                label="SKU"
                value={formData.sku}
                onChange={(e) => updateField('sku', e.target.value)}
                placeholder="Leave blank to auto-generate"
                hint="Custom SKU or auto-generated if empty"
                className="font-mono"
            />

            <Input
                label="Item Name"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Vintage Leather Jacket"
                required
            />

            <Input
                label="Variant"
                value={formData.variant}
                onChange={(e) => updateField('variant', e.target.value)}
                placeholder="Size M, Blue"
                hint="Optional: size, color, or other details"
            />

            <div className="grid grid-cols-2 gap-4">
                <Select
                    label="Category"
                    options={categoryOptions}
                    value={formData.category}
                    onChange={(e) => updateField('category', e.target.value)}
                />
                <Input
                    label="Quantity"
                    type="number"
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => updateField('quantity', parseInt(e.target.value) || 0)}
                />
            </div>

            <Input
                label="Price"
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => updateField('price', parseFloat(e.target.value) || 0)}
                leftIcon={<span className="text-[var(--color-muted)]">$</span>}
                required
            />

            {/* Image Upload */}
            {formData.consignor_id && (
                <ImageUpload
                    value={formData.image_url}
                    onChange={(url) => updateField('image_url', url)}
                    consignorId={formData.consignor_id}
                    itemId={item?.id}
                />
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                    {item ? 'Save Changes' : 'Add Item'}
                </Button>
            </div>
        </form>
    );
}

