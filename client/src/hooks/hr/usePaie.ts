import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface BulletinPaie {
  id: number;
  employeId: string;
  employeNom: string;
  mois: string;
  salaireBase: string;
  primeTransport: string; // From schema
  primeRendement: string; // From schema
  salaireBrut: string;
  cnssEmploye: string;
  ipr: string;
  totalRetenues: string;
  salaireNet: string;
  statut: string;
  datePaiement: string | null;
  createdAt: string;
  pdfUrl?: string; // If used
}

export function usePaie() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  // Fetch My Bulletins
  const fetchMyBulletins = async () => {
    const res = await fetch('/api/hr/paie/my');
    if (!res.ok) throw new Error('Failed to fetch bulletins');
    return res.json();
  };

  const { data: myBulletins = [], isLoading: loadingMyBulletins } = useQuery({
    queryKey: ['my-bulletins'],
    queryFn: fetchMyBulletins
  });

  // Fetch All Bulletins (RH/Admin)
  const fetchAllBulletins = async () => {
    const res = await fetch('/api/hr/bulletins');
    if (!res.ok) throw new Error('Failed to fetch all bulletins');
    return res.json();
  };
  
  const { data: allBulletins = [], isLoading: loadingAllBulletins } = useQuery({
    queryKey: ['all-bulletins'],
    queryFn: fetchAllBulletins,
    enabled: true // Could verify role here but backend handles auth
  });
  
  // Generate Paie
  const generatePaieMutation = useMutation({
    mutationFn: async (mois: string) => {
        const res = await fetch('/api/hr/paie/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mois })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Erreur lors de la génération');
        }
        return res.json();
    },
    onSuccess: (data) => {
        // toast({
        //     title: "Génération réussie",
        //     description: data.message,
        //     variant: "default" 
        // });
        alert(data.message);
        queryClient.invalidateQueries({ queryKey: ['all-bulletins'] });
    },
    onError: (error: Error) => {
        // toast({
        //     title: "Erreur",
        //     description: error.message,
        //     variant: "destructive"
        // });
        alert(error.message);
    }
  });

  return {
    myBulletins,
    loadingMyBulletins,
    allBulletins,
    loadingAllBulletins,
    generatePaie: generatePaieMutation.mutateAsync,
    isGenerating: generatePaieMutation.isPending
  };
}
