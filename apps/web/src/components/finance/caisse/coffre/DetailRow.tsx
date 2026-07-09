/**
 * Ligne libellé/valeur des panneaux de détail du coffre.
 */


export function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between items-start gap-2 sm:gap-4 py-1.5 sm:py-2 border-b border-edge last:border-0">
            <span className="text-[10px] sm:text-xs text-content-muted shrink-0">{label}</span>
            <span className={`text-xs sm:text-sm text-content-primary text-right break-words min-w-0 ${mono ? 'font-mono text-[10px] sm:text-xs' : ''}`}>
                {value}
            </span>
        </div>
    );
}
