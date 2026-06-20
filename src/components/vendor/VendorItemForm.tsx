import { useState, FormEvent } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { ImageUpload } from '../ui/ImageUpload';
import { useCategories } from '../../hooks/useCategories';
import type { Item } from '../../types';
import { PRODUCT_TITLE_MAX_LENGTH, limitProductTitle } from '../../lib/inventoryLimits';

interface VendorItemFormProps {
    item?: Item;
    consignorId: string;
    onSubmit: (data: Partial<Item>) => Promise<{ error: string | null }>;
    onCancel: () => void;
}

interface VendorItemFormData {
    sku: string;
    name: string;
    variant_summary: string;
    other_details_1: string;
    other_details_2: string;
    category: string;
    quantity: number | '';
    price: number | '';
    compare_at_price: number | '';
    image_url: string | null;
}

export function VendorItemForm({ item, consignorId, onSubmit, onCancel }: VendorItemFormProps) {
    const { categories } = useCategories();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState<VendorItemFormData>({
        sku: item?.sku || '',
        name: item?.name || '',
        variant_summary: item?.variant_summary || '',
        other_details_1: item?.other_details_1 || '',
        other_details_2: item?.other_details_2 || '',
        category: item?.category || 'Other',
        quantity: item?.quantity ?? 1,
        price: item?.price ?? 0,
        compare_at_price: item?.compare_at_price ?? '',
        image_url: item?.image_url || null,
    });

    const parseIntegerInput = (value: string) => {
        if (value === '') return '';
        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? '' : parsed;
    };

    const parseDecimalInput = (value: string) => {
        if (value === '') return '';
        const parsed = parseFloat(value);
        return Number.isNaN(parsed) ? '' : parsed;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        const normalizedQuantity = formData.quantity === '' ? 1 : formData.quantity;
        const normalizedPrice = formData.price === '' ? 0 : formData.price;
        const normalizedCompareAtPrice = formData.compare_at_price === '' ? null : formData.compare_at_price;

        if (!formData.name.trim()) {
            setError('Name is required');
            return;
        }

        if (normalizedPrice <= 0) {
            setError('Price must be greater than 0');
            return;
        }
        if (normalizedCompareAtPrice !== null && normalizedCompareAtPrice <= normalizedPrice) {
            setError('Compare-at price must be higher than the actual price');
            return;
        }

        setIsSubmitting(true);
        const result = await onSubmit({
            ...formData,
            quantity: normalizedQuantity,
            price: normalizedPrice,
            compare_at_price: normalizedCompareAtPrice,
        });
        setIsSubmitting(false);

        if (result.error) {
            setError(result.error);
        }
    };

    const updateField = <K extends keyof VendorItemFormData>(field: K, value: VendorItemFormData[K]) => {
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
                        onChange={(e) => updateField('name', limitProductTitle(e.target.value))}
                        placeholder="Vintage Denim Jacket"
                        maxLength={PRODUCT_TITLE_MAX_LENGTH}
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
                        label="Variant/Summary (optional)"
                        value={formData.variant_summary}
                        onChange={(e) => updateField('variant_summary', e.target.value.slice(0, 25))}
                        placeholder="Size M, Blue"
                        maxLength={25}
                        hint="Size, color, or other distinguishing info"
                    />

                    <Input
                        label="Other Details 1 (optional)"
                        value={formData.other_details_1}
                        onChange={(e) => updateField('other_details_1', e.target.value.slice(0, 60))}
                        placeholder="Additional info"
                        maxLength={60}
                    />

                    <Input
                        label="Other Details 2 (optional)"
                        value={formData.other_details_2}
                        onChange={(e) => updateField('other_details_2', e.target.value.slice(0, 50))}
                        placeholder="More details"
                        maxLength={50}
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Quantity"
                            type="number"
                            min="1"
                            value={formData.quantity}
                            onChange={(e) => updateField('quantity', parseIntegerInput(e.target.value))}
                            onBlur={() => {
                                if (formData.quantity === '') {
                                    updateField('quantity', 1);
                                }
                            }}
                        />
                        <Input
                            label="Price"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={formData.price}
                            onChange={(e) => updateField('price', parseDecimalInput(e.target.value))}
                            onBlur={() => {
                                if (formData.price === '') {
                                    updateField('price', 0);
                                }
                            }}
                        />
                    </div>
                    <Input
                        label="Compare-at Price (optional)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.compare_at_price}
                        onChange={(e) => updateField('compare_at_price', parseDecimalInput(e.target.value))}
                        onBlur={() => {
                            if (formData.compare_at_price === 0) {
                                updateField('compare_at_price', '');
                            }
                        }}
                        hint="Shows as a slashed value on labels when higher than price."
                    />
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
