import { useState, useRef, useCallback } from 'react';
import { useImageUpload } from '../../hooks/useImageUpload';

interface ImageUploadProps {
    value: string | null;
    onChange: (url: string | null) => void;
    consignorId: string;
    itemId?: string;
    disabled?: boolean;
}

export function ImageUpload({
    value,
    onChange,
    consignorId,
    itemId,
    disabled = false,
}: ImageUploadProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { uploadImage, deleteImage, isUploading, progress } = useImageUpload();
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileSelect = useCallback(
        async (file: File) => {
            setError(null);

            const result = await uploadImage(file, consignorId, itemId);

            if (result.error) {
                setError(result.error);
            } else if (result.url) {
                onChange(result.url);
            }
        },
        [uploadImage, consignorId, itemId, onChange]
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled && !isUploading) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (disabled || isUploading) return;

        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            handleFileSelect(file);
        } else {
            setError('Please drop an image file (JPG, PNG, or WebP)');
        }
    };

    const handleRemove = async () => {
        if (value) {
            await deleteImage(value);
            onChange(null);
        }
    };

    const triggerFileInput = () => {
        if (!disabled && !isUploading) {
            fileInputRef.current?.click();
        }
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--color-foreground)]">
                Image
            </label>

            {value ? (
                // Image Preview
                <div className="relative group">
                    <div className="aspect-square w-full max-w-[200px] rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
                        <img
                            src={value}
                            alt="Item preview"
                            className="w-full h-full object-cover"
                        />
                    </div>
                    {!disabled && (
                        <div className="absolute inset-0 max-w-[200px] bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={triggerFileInput}
                                className="p-2 bg-white rounded-lg hover:bg-gray-100 transition-colors"
                                title="Replace image"
                            >
                                <svg
                                    className="w-5 h-5 text-gray-700"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={handleRemove}
                                className="p-2 bg-white rounded-lg hover:bg-gray-100 transition-colors"
                                title="Remove image"
                            >
                                <svg
                                    className="w-5 h-5 text-red-600"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                // Upload Zone
                <div
                    onClick={triggerFileInput}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                        aspect-square w-full max-w-[200px] rounded-xl border-2 border-dashed
                        flex flex-col items-center justify-center gap-2 cursor-pointer
                        transition-all
                        ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : ''}
                        ${isDragging
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                            : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface)]'
                        }
                    `}
                >
                    {isUploading ? (
                        <>
                            <div className="w-10 h-10 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
                            <span className="text-sm text-[var(--color-muted)]">
                                Uploading... {progress}%
                            </span>
                        </>
                    ) : (
                        <>
                            <svg
                                className="w-10 h-10 text-[var(--color-muted)]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                            </svg>
                            <span className="text-sm text-[var(--color-muted)] text-center px-4">
                                Click or drag to upload
                            </span>
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                                JPG, PNG, WebP (max 5MB)
                            </span>
                        </>
                    )}
                </div>
            )}

            {error && (
                <p className="text-sm text-[var(--color-danger)]">{error}</p>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleInputChange}
                className="hidden"
                disabled={disabled || isUploading}
            />
        </div>
    );
}

// Compact version for batch entry rows
interface ImageUploadCompactProps {
    value: string | null;
    onChange: (url: string | null) => void;
    consignorId: string;
    disabled?: boolean;
}

export function ImageUploadCompact({
    value,
    onChange,
    consignorId,
    disabled = false,
}: ImageUploadCompactProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { uploadImage, isUploading } = useImageUpload();

    const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const result = await uploadImage(file, consignorId);
            if (result.url) {
                onChange(result.url);
            }
        }
    };

    const triggerFileInput = () => {
        if (!disabled && !isUploading) {
            fileInputRef.current?.click();
        }
    };

    return (
        <div className="flex items-center gap-2">
            {value ? (
                <div className="relative group">
                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-[var(--color-border)]">
                        <img
                            src={value}
                            alt="Preview"
                            className="w-full h-full object-cover"
                        />
                    </div>
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => onChange(null)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove"
                        >
                            <svg
                                className="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    )}
                </div>
            ) : (
                <button
                    type="button"
                    onClick={triggerFileInput}
                    disabled={disabled || isUploading}
                    className={`
                        w-10 h-10 rounded-lg border-2 border-dashed border-[var(--color-border)]
                        flex items-center justify-center
                        hover:border-[var(--color-primary)] hover:bg-[var(--color-surface)]
                        transition-colors
                        ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    title="Add image"
                >
                    {isUploading ? (
                        <div className="w-4 h-4 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
                    ) : (
                        <svg
                            className="w-5 h-5 text-[var(--color-muted)]"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 4v16m8-8H4"
                            />
                        </svg>
                    )}
                </button>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleInputChange}
                className="hidden"
                disabled={disabled || isUploading}
            />
        </div>
    );
}
