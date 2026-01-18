import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Drawer } from 'vaul';
import { 
    X, 
    Printer, 
    Copy, 
    CheckCircle, 
    FileText, 
    CreditCard, 
    ArrowUpRight, 
    ArrowDownLeft, 
    User, 
    Calendar,
    Share2,
    Banknote,
    Download
} from 'lucide-react';
import { toast } from '../../../lib/toast';
import { formatMoney, formatDate } from '../../../lib/format';
import { Button } from '../../ui';
import { useReactToPrint } from 'react-to-print';
import { useReceiptPDF } from '../../../hooks/finance/useReceiptPDF';
import { ReceiptTemplate, ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { InvoiceTemplate } from '../../ui/printable/InvoiceTemplate';

// --- Types ---

export interface TransactionDetails {
    id: string;
    reference: string;
    amount: number;
    type: 'Dépôt' | 'Retrait' | 'Virement' | 'Paiement' | 'Remboursement' | string;
    status: 'Succès' | 'Échec' | 'En attente' | 'Annulé';
    date: string | Date;
    client?: {
        name: string;
        phone?: string;
        accountNumber?: string;
    };
    description?: string;
    metadata?: Record<string, any>;
    agent?: string;
}

interface TransactionDetailsSheetProps {
    transaction: TransactionDetails | null;
    isOpen: boolean;
    onClose: () => void;
    onPrint?: (transaction: TransactionDetails) => void;
}

// --- Helper Hook for Responsive Design ---

function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }

        const listener = () => setMatches(media.matches);
        media.addEventListener('change', listener);
        
        return () => media.removeEventListener('change', listener);
    }, [matches, query]);

    return matches;
}

// --- Component ---

export default function TransactionDetailsSheet({ 
    transaction, 
    isOpen, 
    onClose,
    onPrint 
}: TransactionDetailsSheetProps) {
    const isDesktop = useMediaQuery('(min-width: 768px)');
    
    // Refs for printing/PDF
    const ticketRef = useRef<HTMLDivElement>(null);
    const invoiceRef = useRef<HTMLDivElement>(null);

    // Prepare Receipt Data
    const receiptData: ReceiptData | null = useMemo(() => {
        if (!transaction) return null;

        // Parse Agent Name (Simple Heuristic)
        const agentNameParts = (transaction.agent || 'Agent Caisse').split(' ');
        const agentNom = agentNameParts[0];
        const agentPrenom = agentNameParts.slice(1).join(' ');

        // Parse Client Name
        const clientNameParts = (transaction.client?.name || 'Client Inconnu').split(' ');
        const clientNom = clientNameParts[0];
        const clientPrenom = clientNameParts.slice(1).join(' ');

        return {
            title: `Reçu - ${transaction.type}`,
            reference: transaction.reference,
            date: transaction.date,
            type: transaction.type,
            client: {
                nom: clientNom,
                prenom: clientPrenom,
                telephone: transaction.client?.phone,
                numeroCompte: transaction.client?.accountNumber,
            },
            agent: {
                nom: agentNom,
                prenom: agentPrenom,
            },
            items: [
                {
                    description: transaction.type,
                    details: transaction.description,
                    quantite: 1,
                    montant: transaction.amount,
                }
            ],
            total: transaction.amount,
            devise: 'FCFA',
            modePaiement: 'Espèces', // Defaulting to Espèces per visual cues, could be dynamic
        };
    }, [transaction]);

    // Hooks
    const { downloadPDF } = useReceiptPDF({
        filename: `Recu-${transaction?.reference || 'Transaction'}`,
        format: 'ticket' // Default to ticket for PDF button? Or maybe ask user? Let's default to Ticket for now as it's a mobile view mostly.
    });
    
    // Print Handlers
    const handlePrintTicket = useReactToPrint({
        contentRef: ticketRef,
        documentTitle: `Ticket-${transaction?.reference || ''}`,
    });

    const handlePrintInvoice = useReactToPrint({
        contentRef: invoiceRef,
        documentTitle: `Facture-${transaction?.reference || ''}`,
    });

    // Custom Print wrapper
    const handlePrint = () => {
        if (onPrint && transaction) {
            onPrint(transaction);
        } else {
            // Default: Print Ticket
            handlePrintTicket();
        }
    };

    // Prevent rendering if closed and animation finished (handled by Dialog/Drawer roots usually)
    // But for null safety:
    if (!transaction && !isOpen) return null;

    const isCredit = ['Dépôt', 'Remboursement', 'Virement Entrant'].includes(transaction?.type || '');
    const isDebit = ['Retrait', 'Paiement', 'Virement Sortant'].includes(transaction?.type || '');
    
    // Determine colors based on type
    const themeColor = isCredit ? 'emerald' : (isDebit ? 'red' : 'blue');
    
    // Copy ID to Clipboard
    const handleCopyId = () => {
        if (!transaction?.reference) return;
        navigator.clipboard.writeText(transaction.reference);
        toast.success("Référence copiée !", { duration: 2000 });
    };

    // --- Content Renderer (Shared between Drawer & Slideover) ---
    const Content = () => {
        if (!transaction) return null;

        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-t-[10px] md:rounded-l-[16px] md:rounded-tr-none overflow-hidden relative">
                 {/* Hidden Print Templates */}
                 {receiptData && (
                    <div
                        aria-hidden="true"
                        style={{
                            position: 'fixed',
                            left: '-10000px',
                            top: '0',
                            width: '210mm',
                            background: 'white',
                            zIndex: -1,
                        }}
                    >
                        <ReceiptTemplate ref={ticketRef} data={receiptData} />
                        <InvoiceTemplate ref={invoiceRef} data={receiptData} />
                    </div>
                 )}

                {/* Header Section */}
                <div className={`
                    relative p-6 pt-10 text-center
                    ${isCredit 
                        ? 'bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900' 
                        : isDebit 
                            ? 'bg-gradient-to-b from-red-50 to-white dark:from-red-950/30 dark:to-slate-900'
                            : 'bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/30 dark:to-slate-900'
                    }
                `}>
                    {/* Close Button (Mobile Only visible via overlay usually, but good to have explicit) */}
                    {isDesktop && (
                         <button 
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                         >
                            <X size={20} className="text-slate-500" />
                         </button>
                    )}

                    {/* Status Badge */}
                    <div className="flex justify-center mb-4">
                        <span className={`
                            inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border
                            ${transaction.status === 'Succès' 
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' 
                                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}
                        `}>
                            {transaction.status === 'Succès' && <CheckCircle size={12} strokeWidth={3} />}
                            {transaction.status}
                        </span>
                    </div>

                    {/* Amount & Type */}
                    <h2 className={`text-4xl font-bold mb-1 ${
                        isCredit ? 'text-emerald-700 dark:text-emerald-400' : 
                        isDebit ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-white'
                    }`}>
                        {isCredit ? '+' : isDebit ? '-' : ''} {formatMoney(transaction.amount, { showCurrency: false })} 
                        <span className="text-lg text-slate-400 font-medium ml-1">FCFA</span>
                    </h2>
                    <p className="text-lg font-medium text-slate-500 flex items-center justify-center gap-2">
                        {isCredit ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                        {transaction.type}
                    </p>

                    {/* Reference (Copy-able) */}
                    <button 
                        onClick={handleCopyId}
                        className="mt-6 mx-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors group"
                    >
                        <span className="text-sm font-mono text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200">
                            Ref: {transaction.reference}
                        </span>
                        <Copy size={14} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                    </button>
                </div>

                {/* Body Details */}
                <div className="flex-1 overflow-y-auto px-6 py-2">
                    <div className="space-y-6">
                        
                        {/* Client Info */}
                        {transaction.client && (
                            <section>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <User size={14} /> Client
                                </h3>
                                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                                    <DetailRow label="Nom" value={transaction.client.name} />
                                    <DetailRow label="Téléphone" value={transaction.client.phone} />
                                    <DetailRow label="Compte" value={transaction.client.accountNumber || 'Espèces'} />
                                </div>
                            </section>
                        )}

                        {/* Transaction Meta */}
                        <section>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <FileText size={14} /> Détails
                            </h3>
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                                <DetailRow label="Date" value={formatDate(transaction.date, { format: 'datetime' })} />
                                <DetailRow label="Agent" value={transaction.agent || 'Système'} />
                                {transaction.description && (
                                    <DetailRow label="Note" value={transaction.description} className="italic" />
                                )}
                            </div>
                        </section>

                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 safe-area-bottom">
                    <div className="flex gap-3">
                         {/* PDF Download Button */}
                        <Button 
                            variant="outline" 
                            className="flex-1 h-12 rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                            onClick={() => downloadPDF(ticketRef)}
                        >
                            <Download size={18} className="mr-2" /> PDF
                        </Button>
                        
                        {/* Print Button */}
                        <Button 
                            variant="primary" 
                            className={`flex-1 h-12 rounded-xl text-white shadow-lg shadow-${themeColor}-500/20
                                ${isCredit 
                                    ? 'bg-emerald-600 hover:bg-emerald-500' 
                                    : isDebit 
                                        ? 'bg-red-600 hover:bg-red-500'
                                        : 'bg-blue-600 hover:bg-blue-500'
                                }
                            `}
                            onClick={handlePrint}
                        >
                            <Printer size={18} className="mr-2" /> Réimprimer
                        </Button>
                    </div>
                </div>
            </div>
        );
    };

    // --- Render Logic ---

    // Desktop: Slideover / Side Modal
    if (isDesktop) {
        if (!isOpen) return null;
        
        return (
             <div className="fixed inset-0 z-50 flex justify-end">
                {/* Backdrop */}
                <div 
                    className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={onClose}
                />
                
                {/* Slideover Content */}
                <div className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col border-l border-slate-200 dark:border-slate-800">
                    <Content />
                </div>
             </div>
        );
    }

    // Mobile: Vaul Drawer
    return (
        <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
                <Drawer.Content className="bg-white dark:bg-slate-900 flex flex-col rounded-t-[20px] h-[85vh] fixed bottom-0 left-0 right-0 z-50 outline-none">
                    {/* Handle Bar */}
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-t-[20px] flex justify-center shrink-0">
                         <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
                    </div>
                    
                    <div className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-slate-900">
                        <Content />
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}

// --- Subcomponent: Detail Row ---
function DetailRow({ label, value, className = '' }: { label: string, value?: string | React.ReactNode, className?: string }) {
    if (!value) return null;
    return (
        <div className="flex items-start justify-between py-1 border-b border-dashed border-slate-100 dark:border-slate-700/50 last:border-0">
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className={`text-sm font-bold text-slate-900 dark:text-slate-200 text-right max-w-[60%] ${className}`}>
                {value}
            </dd>
        </div>
    );
}
