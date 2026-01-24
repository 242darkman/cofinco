import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Landmark } from 'lucide-react';
import { toast } from 'sonner';

import { Modal, Button, FormField, TextareaField } from '../../ui';
import { coffreApi } from '../../../lib/api-client';

// Schema validation
const formSchema = z.object({
  montant: z.coerce.number().min(1, "Le montant doit être supérieur à 0"),
  motif: z.string().min(3, "Le motif doit contenir au moins 3 caractères"),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ProvisionCoffreModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agenceId: string;
}

export function ProvisionCoffreModal({
  open,
  onOpenChange,
  agenceId,
}: ProvisionCoffreModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"form" | "confirm">("form");

  const {
    register,
    handleSubmit,
    watch,
    getValues, // Added getValues
    reset,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      montant: undefined,
      motif: "",
      description: "",
    },
  });

  const montant = watch("montant");

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      coffreApi.provision({
        ...values,
        agenceId,
      }),
    onSuccess: () => {
      toast.success("Approvisionnement réussi", {
        description: "Les fonds ont été ajoutés au coffre."
      });
      queryClient.invalidateQueries({ queryKey: ["coffre-stats"] });
      queryClient.invalidateQueries({ queryKey: ["transferts-coffre"] }); // Although strictly not a transfer, history might be relevant

      // Rafraîchir le dashboard en temps réel
      window.dispatchEvent(new CustomEvent('refresh-dashboard'));

      onOpenChange(false);
      reset();
      setStep("form");
    },
    onError: (error: any) => {
      toast.error("Erreur", {
        description: error.message || "Une erreur est survenue."
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
      title="Approvisionnement Coffre"
      size="md"
    >
      <div className="space-y-6">
        {step === "form" ? (
          <form id="provision-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-3 text-blue-400">
                <Landmark size={20} />
                <div className="text-sm">
                    Cette opération injecte des fonds externes (Banque, Capital...) directement dans le coffre.
                </div>
            </div>

            <FormField
              label="Montant (FCFA)"
              type="number"
              placeholder="0"
              required
              {...register('montant')}
              error={errors.montant?.message}
            />

            <FormField
              label="Motif / Source"
              placeholder="Ex: Retrait Banque, Apport Capital..."
              required
              {...register('motif')}
              error={errors.motif?.message}
            />

            <TextareaField
              label="Description (Optionnel)"
              placeholder="Détails supplémentaires..."
              {...register('description')}
            />
          </form>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-4 space-y-3">
              <h4 className="font-medium text-slate-200 border-b border-slate-700 pb-2">Récapitulatif</h4>
              
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Type</span>
                <span className="text-emerald-400 font-medium">Approvisionnement Externe</span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Montant</span>
                <span className="text-white text-lg font-bold">{Number(montant).toLocaleString()} FCFA</span>
              </div>

              <div className="space-y-1 pt-1">
                <span className="text-slate-400 text-xs uppercase block">Motif</span>
                <span className="text-white">{getValues("motif")}</span>
              </div>
            </div>
            
            <p className="text-sm text-slate-400 text-center italic">
              Cette action augmentera immédiatement le solde du coffre.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
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
                Confirmer l'approvisionnement
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
