import { View, Text, ScrollView, Alert, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useProspection, useUpdateProspection } from '@/hooks/use-agent';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';
import { formatRelativeDate } from '@/lib/format';

// ─── Status config ──────────────────────────────────────────────────────────

type ProspectionStatus =
  | 'REGISTERED'
  | 'INTERESTED'
  | 'REFUSED'
  | 'TO_FOLLOW_UP'
  | 'CONVERTED_TO_CLIENT';

const STATUS_VARIANT: Record<ProspectionStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  REGISTERED: 'info',
  INTERESTED: 'success',
  REFUSED: 'danger',
  TO_FOLLOW_UP: 'warning',
  CONVERTED_TO_CLIENT: 'info',
};

const STATUS_LABEL: Record<ProspectionStatus, string> = {
  REGISTERED: 'Enregistre',
  INTERESTED: 'Interesse',
  REFUSED: 'Refuse',
  TO_FOLLOW_UP: 'A suivre',
  CONVERTED_TO_CLIENT: 'Converti en client',
};

// Allowed status transitions per current status
const STATUS_TRANSITIONS: Partial<
  Record<ProspectionStatus, { label: string; target: ProspectionStatus; variant: 'primary' | 'secondary' | 'danger' | 'outline'; icon: string }[]>
> = {
  REGISTERED: [
    { label: 'Interesse', target: 'INTERESTED', variant: 'primary', icon: 'thumbs-up-outline' },
    { label: 'A suivre', target: 'TO_FOLLOW_UP', variant: 'outline', icon: 'time-outline' },
    { label: 'Refuse', target: 'REFUSED', variant: 'danger', icon: 'close-circle-outline' },
  ],
  INTERESTED: [
    { label: 'A suivre', target: 'TO_FOLLOW_UP', variant: 'outline', icon: 'time-outline' },
    { label: 'Refuse', target: 'REFUSED', variant: 'danger', icon: 'close-circle-outline' },
  ],
  TO_FOLLOW_UP: [
    { label: 'Interesse', target: 'INTERESTED', variant: 'primary', icon: 'thumbs-up-outline' },
    { label: 'Refuse', target: 'REFUSED', variant: 'danger', icon: 'close-circle-outline' },
  ],
};

// ─── Detail row component ───────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row items-start py-2">
      <Text className="text-text-muted text-sm w-1/3">{label}</Text>
      <Text className="text-text-primary text-sm font-medium flex-1">{value}</Text>
    </View>
  );
}

function SectionSeparator() {
  return <View className="h-px bg-border-subtle my-1" />;
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function ProspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const { data: prospect, isLoading, refetch, isRefetching } = useProspection(id);
  const updateProspection = useUpdateProspection();

  const handleStatusChange = (target: ProspectionStatus, label: string) => {
    Alert.alert(
      'Confirmer le changement',
      `Voulez-vous marquer ce prospect comme "${label}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              await updateProspection.mutateAsync({ id, statut: target });
              Alert.alert('Succes', `Le prospect a ete marque comme "${label}".`);
              refetch();
            } catch (error: any) {
              Alert.alert('Erreur', error?.message || 'Impossible de mettre a jour le statut.');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return <Loading fullScreen message="Chargement du prospect..." />;
  }

  if (!prospect) {
    return (
      <View className="flex-1 bg-bg-base items-center justify-center px-8">
        <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
        <Text className="text-text-primary text-lg font-semibold text-center mt-4">
          Prospect introuvable
        </Text>
        <Text className="text-text-muted text-sm text-center mt-2">
          Ce prospect n'existe pas ou a ete supprime.
        </Text>
        <Button title="Retour" variant="outline" onPress={() => router.back()} className="mt-6" />
      </View>
    );
  }

  const currentStatus = prospect.statut as ProspectionStatus;
  const transitions = STATUS_TRANSITIONS[currentStatus] ?? [];

  return (
    <View className="flex-1 bg-bg-base">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-4 pb-32"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Header */}
        <View className="flex-row items-center mb-5">
          <View className="w-14 h-14 rounded-full bg-accent/10 items-center justify-center mr-4">
            <Ionicons name="person" size={28} color={colors.accent} />
          </View>
          <View className="flex-1">
            <Text className="text-text-primary text-xl font-bold">
              {prospect.prenom} {prospect.nom}
            </Text>
            {prospect.telephone && (
              <Text className="text-text-muted text-sm mt-0.5">{prospect.telephone}</Text>
            )}
          </View>
          <Badge
            label={STATUS_LABEL[currentStatus] ?? currentStatus}
            variant={STATUS_VARIANT[currentStatus] ?? 'neutral'}
            size="md"
          />
        </View>

        {/* Created date */}
        {prospect.created_at && (
          <Text className="text-text-muted text-xs mb-4">
            Enregistre {formatRelativeDate(prospect.created_at)}
          </Text>
        )}

        {/* Identite section */}
        <Card className="mb-3">
          <View className="flex-row items-center mb-2">
            <Ionicons name="person-outline" size={18} color={colors.accent} />
            <Text className="text-text-primary font-semibold text-base ml-2">Identite</Text>
          </View>
          <SectionSeparator />
          <DetailRow label="Nom" value={prospect.nom} />
          <DetailRow label="Prenom" value={prospect.prenom} />
          <DetailRow label="Telephone" value={prospect.telephone} />
          <DetailRow label="Sexe" value={prospect.sexe === 'M' ? 'Masculin' : prospect.sexe === 'F' ? 'Feminin' : prospect.sexe} />
          <DetailRow label="Adresse" value={prospect.adresse} />
        </Card>

        {/* Localisation section */}
        {(prospect.arrondissement_nom || prospect.marche_nom || prospect.ville_nom) && (
          <Card className="mb-3">
            <View className="flex-row items-center mb-2">
              <Ionicons name="location-outline" size={18} color={colors.accent} />
              <Text className="text-text-primary font-semibold text-base ml-2">Localisation</Text>
            </View>
            <SectionSeparator />
            <DetailRow label="Ville" value={prospect.ville_nom} />
            <DetailRow label="Arrondissement" value={prospect.arrondissement_nom} />
            <DetailRow label="Marche" value={prospect.marche_nom} />
          </Card>
        )}

        {/* Activite section */}
        {(prospect.type_activite || prospect.activite_principale || prospect.description_activite) && (
          <Card className="mb-3">
            <View className="flex-row items-center mb-2">
              <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
              <Text className="text-text-primary font-semibold text-base ml-2">Activite</Text>
            </View>
            <SectionSeparator />
            <DetailRow label="Type" value={prospect.type_activite} />
            <DetailRow label="Principale" value={prospect.activite_principale} />
            <DetailRow label="Anciennete" value={prospect.anciennete_activite} />
            <DetailRow label="Description" value={prospect.description_activite} />
          </Card>
        )}

        {/* Finance section */}
        {(prospect.revenu_estime || prospect.chiffre_affaires_mensuel || prospect.type_revenu) && (
          <Card className="mb-3">
            <View className="flex-row items-center mb-2">
              <Ionicons name="cash-outline" size={18} color={colors.accent} />
              <Text className="text-text-primary font-semibold text-base ml-2">Finance</Text>
            </View>
            <SectionSeparator />
            <DetailRow label="Type revenu" value={prospect.type_revenu} />
            <DetailRow
              label="Revenu estime"
              value={prospect.revenu_estime ? formatMoney(Number(prospect.revenu_estime)) : undefined}
            />
            {prospect.type_revenu === 'Journalier' && prospect.revenu_journalier && (
              <DetailRow
                label="Revenu journalier"
                value={formatMoney(Number(prospect.revenu_journalier))}
              />
            )}
            <DetailRow
              label="CA mensuel"
              value={
                prospect.chiffre_affaires_mensuel
                  ? formatMoney(Number(prospect.chiffre_affaires_mensuel))
                  : undefined
              }
            />
          </Card>
        )}

        {/* Notes section */}
        {(prospect.observations || prospect.commentaires_agent) && (
          <Card className="mb-3">
            <View className="flex-row items-center mb-2">
              <Ionicons name="document-text-outline" size={18} color={colors.accent} />
              <Text className="text-text-primary font-semibold text-base ml-2">Notes</Text>
            </View>
            <SectionSeparator />
            {prospect.commentaires_agent && (
              <View className="py-2">
                <Text className="text-text-muted text-xs mb-1">Commentaires agent</Text>
                <Text className="text-text-primary text-sm">{prospect.commentaires_agent}</Text>
              </View>
            )}
            {prospect.observations && (
              <View className="py-2">
                <Text className="text-text-muted text-xs mb-1">Observations</Text>
                <Text className="text-text-primary text-sm">{prospect.observations}</Text>
              </View>
            )}
          </Card>
        )}
      </ScrollView>

      {/* Action buttons */}
      {transitions.length > 0 && (
        <View className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-3 bg-bg-base border-t border-border-subtle">
          <Text className="text-text-muted text-xs mb-2 text-center">Changer le statut</Text>
          <View className="flex-row gap-3">
            {transitions.map((action) => (
              <Button
                key={action.target}
                title={action.label}
                variant={action.variant}
                size="md"
                onPress={() => handleStatusChange(action.target, action.label)}
                loading={updateProspection.isPending}
                icon={
                  !updateProspection.isPending ? (
                    <Ionicons
                      name={action.icon as any}
                      size={16}
                      color={action.variant === 'primary' || action.variant === 'danger' ? '#ffffff' : colors.textPrimary}
                    />
                  ) : undefined
                }
                className="flex-1"
              />
            ))}
          </View>
        </View>
      )}

      {/* Converted status info */}
      {currentStatus === 'CONVERTED_TO_CLIENT' && (
        <View className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-3 bg-bg-base border-t border-border-subtle">
          <View className="bg-success/10 rounded-xl p-4 flex-row items-center">
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <View className="flex-1 ml-3">
              <Text className="text-success font-semibold">Converti en client</Text>
              <Text className="text-text-muted text-xs mt-0.5">
                Ce prospect a ete converti en client. Aucune action supplementaire n'est necessaire.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Refused status info */}
      {currentStatus === 'REFUSED' && transitions.length === 0 && (
        <View className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-3 bg-bg-base border-t border-border-subtle">
          <View className="bg-danger/10 rounded-xl p-4 flex-row items-center">
            <Ionicons name="close-circle" size={24} color={colors.danger} />
            <View className="flex-1 ml-3">
              <Text className="text-danger font-semibold">Prospect refuse</Text>
              <Text className="text-text-muted text-xs mt-0.5">
                Ce prospect a ete marque comme refuse.
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
