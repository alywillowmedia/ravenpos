import { Link } from 'react-router-dom';

interface CategoryCardProps {
    category: {
        name: string;
        itemCount: number;
    };
}

// Gradient combinations for categories
const gradients = [
    'from-blue-500 to-cyan-400',
    'from-purple-500 to-pink-400',
    'from-emerald-500 to-teal-400',
    'from-orange-500 to-amber-400',
    'from-rose-500 to-red-400',
    'from-indigo-500 to-violet-400',
    'from-lime-500 to-green-400',
    'from-fuchsia-500 to-purple-400',
];

// Simple hash function to get consistent gradient for each category
function getGradientIndex(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % gradients.length;
}

export function CategoryCard({ category }: CategoryCardProps) {
    const gradient = gradients[getGradientIndex(category.name)];

    return (
        <Link
            to={`/category/${encodeURIComponent(category.name)}`}
            className="group flex-shrink-0 w-44 overflow-hidden rounded-2xl border border-[var(--color-border)] hover:shadow-lg hover:border-[var(--color-primary)]/30 transition-all duration-300"
        >
            {/* Gradient Header */}
            <div className={`h-20 bg-gradient-to-br ${gradient} relative overflow-hidden`}>
                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                {/* Decorative circles */}
                <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full bg-white/10" />
                <div className="absolute -left-2 -bottom-2 w-10 h-10 rounded-full bg-white/10" />
            </div>

            {/* Content */}
            <div className="p-3 bg-white">
                <h3 className="text-sm font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-1">
                    {category.name}
                </h3>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                    {category.itemCount} {category.itemCount === 1 ? 'item' : 'items'}
                </p>
            </div>
        </Link>
    );
}
