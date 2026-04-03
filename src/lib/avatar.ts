const avatarUrlCache = new Map<string, string>();

interface AvatarOptions {
    size?: number;
    quality?: number;
}

function buildSupabaseRenderUrl(rawUrl: string, size: number, quality: number): string {
    try {
        const url = new URL(rawUrl);
        const objectPublicMarker = '/storage/v1/object/public/';
        const renderPublicMarker = '/storage/v1/render/image/public/';

        if (url.pathname.includes(objectPublicMarker)) {
            url.pathname = url.pathname.replace(objectPublicMarker, renderPublicMarker);
        } else if (!url.pathname.includes(renderPublicMarker)) {
            return rawUrl;
        }

        // Keep avatar payloads small and consistent for browser/CDN caching.
        url.searchParams.set('width', String(size));
        url.searchParams.set('height', String(size));
        url.searchParams.set('quality', String(quality));
        return url.toString();
    } catch {
        return rawUrl;
    }
}

export function getCachedAvatarUrl(rawUrl: string | null | undefined, options: AvatarOptions = {}): string | null {
    if (!rawUrl) return null;

    const size = options.size ?? 64;
    const quality = options.quality ?? 70;
    const cacheKey = `${rawUrl}|${size}|${quality}`;
    const cached = avatarUrlCache.get(cacheKey);
    if (cached) return cached;

    const optimized = buildSupabaseRenderUrl(rawUrl, size, quality);
    avatarUrlCache.set(cacheKey, optimized);
    return optimized;
}
