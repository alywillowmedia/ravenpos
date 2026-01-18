import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface UploadResult {
    url: string | null;
    error: string | null;
}

interface UseImageUploadReturn {
    uploadImage: (file: File, consignorId: string, itemId?: string) => Promise<UploadResult>;
    deleteImage: (url: string) => Promise<{ error: string | null }>;
    isUploading: boolean;
    progress: number;
}

const BUCKET_NAME = 'item-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function useImageUpload(): UseImageUploadReturn {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const uploadImage = useCallback(
        async (file: File, consignorId: string, itemId?: string): Promise<UploadResult> => {
            // Validate file type
            if (!ALLOWED_TYPES.includes(file.type)) {
                return {
                    url: null,
                    error: 'Invalid file type. Please upload JPG, PNG, or WebP.',
                };
            }

            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                return {
                    url: null,
                    error: 'File too large. Maximum size is 5MB.',
                };
            }

            try {
                setIsUploading(true);
                setProgress(0);

                // Generate filename - flat path (no subfolders)
                const timestamp = Date.now();
                const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
                const filename = itemId
                    ? `${consignorId}_${itemId}_${timestamp}.${extension}`
                    : `${consignorId}_temp_${timestamp}.${extension}`;

                setProgress(25);

                // Upload to Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from(BUCKET_NAME)
                    .upload(filename, file, {
                        cacheControl: '3600',
                        upsert: true,
                    });

                if (uploadError) throw uploadError;

                setProgress(75);

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from(BUCKET_NAME)
                    .getPublicUrl(filename);

                setProgress(100);

                return {
                    url: urlData.publicUrl,
                    error: null,
                };
            } catch (err) {
                return {
                    url: null,
                    error: err instanceof Error ? err.message : 'Failed to upload image',
                };
            } finally {
                setIsUploading(false);
            }
        },
        []
    );

    const deleteImage = useCallback(async (url: string): Promise<{ error: string | null }> => {
        try {
            // Extract filename from URL
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            const filename = pathParts[pathParts.length - 1];

            if (!filename) {
                return { error: 'Invalid image URL' };
            }

            const filePath = decodeURIComponent(filename);

            const { error: deleteError } = await supabase.storage
                .from(BUCKET_NAME)
                .remove([filePath]);

            if (deleteError) throw deleteError;

            return { error: null };
        } catch (err) {
            return {
                error: err instanceof Error ? err.message : 'Failed to delete image',
            };
        }
    }, []);

    return {
        uploadImage,
        deleteImage,
        isUploading,
        progress,
    };
}
