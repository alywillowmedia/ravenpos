import { useRef, useState } from 'react';
import { Button } from './Button';
import { useImageUpload } from '../../hooks/useImageUpload';

interface ProfilePhotoUploadProps {
    value: string | null;
    onChange: (url: string | null) => Promise<void>;
    uploadKey: string;
    disabled?: boolean;
}

export function ProfilePhotoUpload({
    value,
    onChange,
    uploadKey,
    disabled = false,
}: ProfilePhotoUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const { uploadImage, deleteImage, isUploading } = useImageUpload();
    const [error, setError] = useState<string | null>(null);

    const triggerUpload = () => {
        if (!disabled && !isUploading) {
            inputRef.current?.click();
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setError(null);
        const result = await uploadImage(file, `profile_${uploadKey}`, 'avatar');
        if (result.error || !result.url) {
            setError(result.error || 'Failed to upload profile photo');
            return;
        }

        try {
            await onChange(result.url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save profile photo');
        }
    };

    const handleRemove = async () => {
        if (!value) return;

        setError(null);
        const removeResult = await deleteImage(value);
        if (removeResult.error) {
            setError(removeResult.error);
            return;
        }

        try {
            await onChange(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove profile photo');
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex items-center justify-center">
                    {value ? (
                        <img src={value} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                        <span className="text-xs text-[var(--color-muted)]">No photo</span>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={triggerUpload}
                        isLoading={isUploading}
                        disabled={disabled}
                    >
                        {value ? 'Replace Photo' : 'Upload Photo'}
                    </Button>
                    {value && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleRemove}
                            disabled={disabled || isUploading}
                            className="text-[var(--color-danger)]"
                        >
                            Remove
                        </Button>
                    )}
                </div>
            </div>

            {error && (
                <p className="text-sm text-[var(--color-danger)]">{error}</p>
            )}

            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
                disabled={disabled || isUploading}
            />
        </div>
    );
}
