import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { encode } from 'qss';
import React from 'react';
import {
    AnimatePresence,
    motion,
    useMotionValue,
    useSpring,
} from 'motion/react';
import { cn } from '../../lib/utils';

type LinkPreviewProps = {
    children: React.ReactNode;
    url: string;
    className?: string;
    width?: number;
    height?: number;
    quality?: number;
    layout?: string;
} & (
        | { isStatic: true; imageSrc: string }
        | { isStatic?: false; imageSrc?: never }
    );

export const LinkPreview = ({
    children,
    url,
    className,
    width = 200,
    height = 125,
    quality = 50,
    layout = 'fixed',
    isStatic = false,
    imageSrc = '',
}: LinkPreviewProps) => {
    let src: string;
    if (!isStatic) {
        const params = encode({
            url: url.startsWith('http://') || url.startsWith('https://')
                ? url
                : `${window.location.origin}${url}`,
            screenshot: true,
            meta: false,
            embed: 'screenshot.url',
            colorScheme: 'dark',
            'viewport.isMobile': true,
            'viewport.deviceScaleFactor': 1,
            'viewport.width': width * 3,
            'viewport.height': height * 3,
            quality,
            layout,
        });
        src = `https://api.microlink.io/?${params}`;
    } else {
        src = imageSrc;
    }

    const [isOpen, setOpen] = React.useState(false);
    const [isMounted, setIsMounted] = React.useState(false);

    React.useEffect(() => {
        setIsMounted(true);
    }, []);

    const springConfig = { stiffness: 100, damping: 15 };
    const x = useMotionValue(0);
    const translateX = useSpring(x, springConfig);

    const handleMouseMove = (event: React.MouseEvent<HTMLAnchorElement>) => {
        const targetRect = event.currentTarget.getBoundingClientRect();
        const eventOffsetX = event.clientX - targetRect.left;
        const offsetFromCenter = (eventOffsetX - targetRect.width / 2) / 2;
        x.set(offsetFromCenter);
    };

    return (
        <>
            {isMounted ? (
                <div className="hidden">
                    <img
                        src={src}
                        width={width}
                        height={height}
                        alt="hidden preview preload"
                    />
                </div>
            ) : null}

            <HoverCardPrimitive.Root
                openDelay={50}
                closeDelay={100}
                onOpenChange={(open) => {
                    setOpen(open);
                }}
            >
                <HoverCardPrimitive.Trigger asChild>
                    <a
                        onMouseMove={handleMouseMove}
                        className={cn('text-black dark:text-white', className)}
                        href={url}
                    >
                        {children}
                    </a>
                </HoverCardPrimitive.Trigger>

                <HoverCardPrimitive.Content
                    className="[transform-origin:var(--radix-hover-card-content-transform-origin)] z-50"
                    side="top"
                    align="center"
                    sideOffset={10}
                >
                    <AnimatePresence>
                        {isOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 20, scale: 0.6 }}
                                animate={{
                                    opacity: 1,
                                    y: 0,
                                    scale: 1,
                                    transition: {
                                        type: 'spring',
                                        stiffness: 260,
                                        damping: 20,
                                    },
                                }}
                                exit={{ opacity: 0, y: 20, scale: 0.6 }}
                                className="shadow-xl rounded-xl"
                                style={{
                                    x: translateX,
                                }}
                            >
                                <a
                                    href={url}
                                    className="block p-1 bg-white border-2 border-transparent shadow rounded-xl hover:border-neutral-200"
                                    style={{ fontSize: 0 }}
                                >
                                    <img
                                        src={isStatic ? imageSrc : src}
                                        width={width}
                                        height={height}
                                        className="rounded-lg"
                                        alt="preview image"
                                    />
                                </a>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </HoverCardPrimitive.Content>
            </HoverCardPrimitive.Root>
        </>
    );
};
