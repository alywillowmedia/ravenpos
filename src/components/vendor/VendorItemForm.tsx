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
        <form onSubmit={handleSubmit}>
            {error && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Form Fields */}
                <div className="space-y-4">
                    <Input
                        label="Item Name"
                        value={formData.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        placeholder="Vintage Denim Jacket"
                        required
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="SKU (optional)"
                            value={formData.sku}
                            onChange={(e) => updateField('sku', e.target.value)}
                            placeholder="Auto"
                            className="font-mono"
                            hint="Leave blank for auto"
                        />
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-[var(--color-foreground)] mb-1">
                                Category
                            </label>
                            <Select
                                value={formData.category}
                                onChange={(e) => updateField('category', e.target.value)}
                                options={categoryOptions}
                            />
                        </div>
                    </div>

                    <Input
                        label="Variant (optional)"
                        value={formData.variant}
                        onChange={(e) => updateField('variant', e.target.value)}
                        placeholder="Size M, Blue"
                        hint="Size, color, or other distinguishing info"
                    />

                    <div className="grid grid-cols-2 gap-3">
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
                </div>

                {/* Right Column: Image Upload */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--color-foreground)]">
                        Item Photo
                    </label>
                    <div className="h-full">
                        <ImageUpload
                            value={formData.image_url}
                            onChange={(url) => updateField('image_url', url)}
                            consignorId={consignorId}
                            itemId={item?.id}
                        />
                        <p className="mt-2 text-xs text-[var(--color-muted)]">
                            Upload a clear photo of your item. Used in the online storefront.
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 mt-6 border-t border-[var(--color-border)]">
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

