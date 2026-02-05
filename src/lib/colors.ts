export const TAILWIND_COLORS: Record<string, string> = {
    'bg-blue-500': '#3b82f6',
    'bg-yellow-500': '#eab308',
    'bg-purple-500': '#a855f7',
    'bg-green-500': '#22c55e',
    'bg-red-400': '#f87171',
    'bg-orange-400': '#fb923c',
    'bg-indigo-500': '#6366f1',
    'bg-teal-500': '#14b8a6',
    'bg-green-600': '#16a34a',
    'bg-amber-500': '#f59e0b',
    'bg-pink-500': '#ec4899',
    'bg-emerald-500': '#10b981',
    'bg-green-700': '#15803d',
    'bg-slate-500': '#64748b',
    'bg-yellow-600': '#ca8a04',
    'bg-amber-400': '#fbbf24',
    'bg-gray-500': '#6b7280',
    'bg-gray-700': '#374151',
    'default': '#8884d8'
};

export const getStageColor = (bgClass: string) => {
    return TAILWIND_COLORS[bgClass] || TAILWIND_COLORS['default'];
};
