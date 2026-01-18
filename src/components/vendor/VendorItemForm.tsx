import { useState, FormEvent } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { ImageUpload } from '../ui/ImageUpload';
import { useCategories } from '../../hooks/useCategories';
import type { Item } from '../../types';

interface VendorItemFormProps {
    item?: Item;
    consignorId: string;
    onSubmit: (data: Partial<Item>) => Promise<{ error: string | null }>;
    onCancel: () => void;
}

export function VendorItemForm({ item, consignorId, onSubmit, onCancel }: VendorItemFormProps) {
    const { categories } = useCategories();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
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

    const categoryOptions = categories.map((c) => ({
        value: c.name,
        label: c.name,
    }));

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {error}
                </div>
            )}

            <Input
                label="SKU (optional)"
                value={formData.sku}
                onChange={(e) => updateField('sku', e.target.value)}
                placeholder="Auto-generated if empty"
                hint="Leave blank to auto-generate"
                className="font-mono"
            />

            <Input
                label="Item Name"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Vintage Denim Jacket"
                required
            />

            <Input
                label="Variant (optional)"
                value={formData.variant}
                onChange={(e) => updateField('variant', e.target.value)}
                placeholder="Size M, Blue"
                hint="Size, color, or other distinguishing info"
            />

            <Select
                label="Category"
                value={formData.category}
                onChange={(e) => updateField('category', e.target.value)}
                options={categoryOptions}
            />

            <div className="grid grid-cols-2 gap-4">
                <Input
                    label="Quantity"
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => updateField('quantity', parseInt(e.target.value) || 1)}
                />
                <Input
                    label="Price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => updateField('price', parseFloat(e.target.value) || 0)}
                />
            </div>

            {/* Image Upload */}
            <ImageUpload
                value={formData.image_url}
                onChange={(url) => updateField('image_url', url)}
                consignorId={consignorId}
                itemId={item?.id}
            />

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

