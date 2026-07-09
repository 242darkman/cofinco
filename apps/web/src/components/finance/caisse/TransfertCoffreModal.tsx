
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Modal, Button, FormField, TextareaField, SelectField } from '../../ui';
import { coffreApi } from '../../../lib/api-client';

// Schema validation
const formSchema = z.object({
  typeTransfert: z.enum(["COFFRE_VERS_CAISSE", "CAISSE_VERS_COFFRE"]),
  montant: z.coerce.number().min(1, "Le montant doit être supérieur à 0"),
  motif: z.string().min(5, "Le motif doit contenir au moins 5 caractères"),
  commentaire: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface TransfertCoffreModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caisseId: string;
  agenceId: string;
}

export function TransfertCoffreModal({
  open,
  onOpenChange,
  caisseId,
  agenceId,
}: TransfertCoffreModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"form" | "confirm">("form");

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    reset,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      typeTransfert: "COFFRE_VERS_CAISSE",
      montant: undefined,
      motif: "",
      commentaire: "",
    },
  });

  const type = watch("typeTransfert");
  const montant = watch("montant");

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      coffreApi.createTransfert({
        ...values,
        caisseId,
        agenceId,
      }),
    onSuccess: () => {
      toast.success("Demande créée", {
        description: "Votre demande de transfert a été envoyée pour validation."
      });
      queryClient.invalidateQueries({ queryKey: ["transferts-coffre"] });
      onOpenChange(false);
      reset();
      setStep("form");
    },
    onError: (error: unknown) => {
      toast.error("Erreur lors de la création", {
        description: (error instanceof Error ? error.message : "Une erreur est survenue.")
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    if (step === "form") {
      setStep("confirm");
      return;
    }
    createMutation.mutate(values);
  };

  const handleClose = () => {
    onOpenChange(false);
    reset();
    setStep("form");
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Transfert Coffre-Fort"
      size="md"
    >
      <div className="space-y-6">
        {step === "form" ? (
          <form id="transfert-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div 
                className={`
                  p-3 rounded-lg border cursor-pointer transition-all flex flex-col items-center gap-2 text-center
                  ${type === 'COFFRE_VERS_CAISSE' 
                    ? 'border-status-info bg-status-info-bg text-status-info' 
                    : 'border-edge bg-surface/50 text-content-muted hover:border-edge-strong'
                  }
                `}
                onClick={() => setValue('typeTransfert', 'COFFRE_VERS_CAISSE')}
              >
                <ArrowDownLeft size={24} />
                <span className="text-sm font-semibold">Approvisionnement</span>
                <span className="text-xs opacity-70">Coffre → Caisse</span>
              </div>

              <div 
                className={`
                  p-3 rounded-lg border cursor-pointer transition-all flex flex-col items-center gap-2 text-center
                  ${type === 'CAISSE_VERS_COFFRE' 
                    ? 'border-status-success bg-status-success-bg text-status-success' 
                    : 'border-edge bg-surface/50 text-content-muted hover:border-edge-strong'
                  }
                `}
                onClick={() => setValue('typeTransfert', 'CAISSE_VERS_COFFRE')}
              >
                <ArrowUpRight size={24} />
                <span className="text-sm font-semibold">Versement</span>
                <span className="text-xs opacity-70">Caisse → Coffre</span>
              </div>
            </div>

            <FormField
              label="Montant (FCFA)"
              type="text"
              inputMode="numeric"
              placeholder="0"
              required
              {...register('montant', {
                onChange: (e) => {
                  e.target.value = e.target.value.replace(/[^0-9]/g, '');
                },
              })}
              error={errors.montant?.message}
            />

            <FormField
              label="Motif"
              placeholder="Ex: Approvisionnement journée"
              required
              {...register('motif')}
              error={errors.motif?.message}
            />

            <TextareaField
              label="Commentaire (Optionnel)"
              placeholder="Détails supplémentaires..."
              {...register('commentaire')}
            />
          </form>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="rounded-lg bg-surface/50 border border-edge p-4 space-y-3">
              <h4 className="font-medium text-content-secondary border-b border-edge pb-2">Récapitulatif</h4>
              
              <div className="flex justify-between items-center py-1">
                <span className="text-content-muted">Type</span>
                <span className={type === "COFFRE_VERS_CAISSE" ? "text-status-info font-medium" : "text-status-success font-medium"}>
                  {type === "COFFRE_VERS_CAISSE" ? "Approvisionnement (Entrée)" : "Versement (Sortie)"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-content-muted">Montant</span>
                <span className="text-content-primary text-lg font-bold">{Number(montant).toLocaleString()} FCFA</span>
              </div>

              <div className="space-y-1 pt-1">
                <span className="text-content-muted text-xs uppercase block">Motif</span>
                <span className="text-content-primary">{getValues("motif")}</span>
              </div>
            </div>
            
            <p className="text-sm text-content-muted text-center italic">
              Une demande sera envoyée au gestionnaire de coffre pour validation.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-edge">
          {step === "form" ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Annuler
              </Button>
              <Button onClick={handleSubmit(onSubmit)}>
                Suivant
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("form")} disabled={createMutation.isPending}>
                Retour
              </Button>
              <Button 
                onClick={handleSubmit(onSubmit)}
                isLoading={createMutation.isPending}
                variant="primary"
              >
                Confirmer la demande
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
