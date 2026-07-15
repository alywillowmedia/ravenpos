// Authorize Device Modal - Admin interface for authorizing devices for employee access

import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { CheckCircle2, LockOpen } from 'lucide-react';
import {
    authorizeDevice,
    getActiveAuthorizations,
    revokeAuthorization,
    DURATION_PRESETS,
    type DeviceAuthorization,
} from '../../lib/deviceAuth';

interface AuthorizeDeviceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AuthorizeDeviceModal({ isOpen, onClose }: AuthorizeDeviceModalProps) {
    const [selectedDuration, setSelectedDuration] = useState<number | null>(null); // Default to permanent
    const [deviceName, setDeviceName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeAuthorizations, setActiveAuthorizations] = useState<DeviceAuthorization[]>([]);
    const [isLoadingAuthorizations, setIsLoadingAuthorizations] = useState(true);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    // Load active authorizations when modal opens
    useEffect(() => {
        if (isOpen) {
            loadAuthorizations();
            setError(null);
            setSuccess(null);
            setDeviceName('');
        }
    }, [isOpen]);

    const loadAuthorizations = async () => {
        setIsLoadingAuthorizations(true);
        const auths = await getActiveAuthorizations();
        setActiveAuthorizations(auths);
        setIsLoadingAuthorizations(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setIsSubmitting(true);

        const result = await authorizeDevice(selectedDuration, deviceName.trim() || undefined);

        setIsSubmitting(false);

        if (result.error) {
            setError(result.error);
        } else {
            if (result.expiresAt) {
                const expiresAt = new Date(result.expiresAt);
                setSuccess(`Device authorized until ${expiresAt.toLocaleString()}`);
            } else {
                setSuccess('Device authorized permanently');
            }
            setDeviceName('');
            loadAuthorizations();
        }
    };

    const handleRevoke = async (id: string) => {
        setRevokingId(id);
        const result = await revokeAuthorization(id);
        setRevokingId(null);

        if (result.error) {
            setError(result.error);
        } else {
            loadAuthorizations();
        }
    };

    const formatTimeRemaining = (expiresAt: string | null): string => {
        if (!expiresAt) return 'No expiration';

        const now = new Date();
        const expires = new Date(expiresAt);
        const diffMs = expires.getTime() - now.getTime();

        if (diffMs <= 0) return 'Expired';

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours >= 24) {
            const days = Math.floor(hours / 24);
            return `${days}d ${hours % 24}h remaining`;
        }
        return `${hours}h ${minutes}m remaining`;
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Device Authorization"
            size="md"
        >
            <div className="space-y-6">
                {/* Authorize This Device Section */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <p className="text-sm text-[var(--color-muted)] mb-3">
                            Authorize this device to allow employees to log in with their PIN.
                            This is required before the employee login page will be accessible.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Authorization Duration
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {DURATION_PRESETS.map((preset) => (
                                <button
                                    key={`${preset.label}-${preset.hours ?? 'permanent'}`}
                                    type="button"
                                    onClick={() => setSelectedDuration(preset.hours)}
                                    className={`
                                        px-3 py-2 rounded-lg text-sm font-medium transition-all
                                        ${selectedDuration === preset.hours
                                            ? 'bg-[var(--color-primary)] text-white'
                                            : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground)]'
                                        }
                                    `}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <Input
                        label="Device Name (optional)"
                        value={deviceName}
                        onChange={(e) => setDeviceName(e.target.value)}
                        placeholder="e.g., Front Counter iPad"
                    />

                    {error && (
                        <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm" role="alert">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="p-3 rounded-lg border border-[var(--color-success)]/20 bg-[var(--color-success-bg)] text-[var(--color-success)] text-sm" role="status">
                            <span className="inline-flex items-center gap-2">
                                <CheckCircle2 size={16} />
                                {success}
                            </span>
                        </div>
                    )}

                    <Button type="submit" className="w-full" isLoading={isSubmitting}>
                        <LockOpen size={16} />
                        Authorize This Device
                    </Button>
                </form>

                {/* Active Authorizations Section */}
                <div className="border-t border-[var(--color-border)] pt-4">
                    <h3 className="text-sm font-medium mb-3">Active Device Authorizations</h3>

                    {isLoadingAuthorizations ? (
                        <div className="flex justify-center py-4">
                            <LoadingSpinner size={20} />
                        </div>
                    ) : activeAuthorizations.length === 0 ? (
                        <p className="text-sm text-[var(--color-muted)] text-center py-4">
                            No active device authorizations
                        </p>
                    ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {activeAuthorizations.map((auth) => (
                                <div
                                    key={auth.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface)]"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {auth.device_name || 'Unnamed Device'}
                                        </p>
                                        <p className="text-xs text-[var(--color-muted)]">
                                            {formatTimeRemaining(auth.expires_at)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="success">Active</Badge>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRevoke(auth.id)}
                                            isLoading={revokingId === auth.id}
                                        >
                                            Revoke
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-2">
                    <Button variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
