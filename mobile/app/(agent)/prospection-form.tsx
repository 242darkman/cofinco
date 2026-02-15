import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useCreateProspection, useVilles, useArrondissements, useMarches } from '@/hooks/use-agent';
import { useAgentStore } from '@/stores/agent-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ─── Schema ─────────────────────────────────────────────────────────────────

const prospectionSchema = z.object({
  // Step 1 - Identite
  nom: z.string().min(1, 'Le nom est requis'),
  prenom: z.string().min(1, 'Le prenom est requis'),
  telephone: z
    .string()
    .min(1, 'Le telephone est requis')
    .regex(
      /^(\+?242|0)?[0-9]{9}$/,
      'Format telephone Congo invalide (ex: 06XXXXXXX)'
    ),
  sexe: z.enum(['M', 'F']).default('M'),
  adresse: z.string().optional(),
  ville_id: z.string().optional(),
  arrondissement_id: z.string().optional(),
  marche_id: z.string().optional(),

  // Step 2 - Activite
  type_activite: z.string().optional(),
  activite_principale: z.string().optional(),
  anciennete_activite: z.string().optional(),
  description_activite: z.string().optional(),

  // Step 3 - Finance & Notes
  type_revenu: z.enum(['Mensuel', 'Journalier']).default('Mensuel'),
  revenu_estime: z.string().optional(),
  revenu_journalier: z.string().optional(),
  chiffre_affaires_mensuel: z.string().optional(),
  commentaires_agent: z.string().optional(),
  observations: z.string().optional(),
});

type ProspectionForm = z.infer<typeof prospectionSchema>;

// ─── Constants ──────────────────────────────────────────────────────────────

const ACTIVITE_TYPES = [
  'Commerce',
  'Artisanat',
  'Services',
  'Agriculture',
  'Elevage',
  'Peche',
  'Transport',
  'Autre',
];

const STEPS = [
  { label: 'Identite', icon: 'person-outline' as const },
  { label: 'Activite', icon: 'briefcase-outline' as const },
  { label: 'Finance', icon: 'cash-outline' as const },
];

// ─── Picker component ───────────────────────────────────────────────────────

interface PickerFieldProps {
  label: string;
  options: { label: string; value: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}

function PickerField({ label, options, value, onChange, placeholder }: PickerFieldProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const [expanded, setExpanded] = useState(false);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <View className="mb-4">
      <Text className="text-text-secondary text-sm font-medium mb-1.5">{label}</Text>
      <Pressable
        className="bg-input-bg border border-input-border rounded-xl px-4 py-3 flex-row items-center justify-between"
        onPress={() => setExpanded(!expanded)}
      >
        <Text className={selectedLabel ? 'text-input-text text-base' : 'text-text-muted text-base'}>
          {selectedLabel ?? placeholder ?? 'Selectionner...'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>
      {expanded && (
        <View className="bg-card-bg border border-card-border rounded-xl mt-1 max-h-48 overflow-hidden">
          <ScrollView nestedScrollEnabled>
            {options.map((opt) => (
              <Pressable
                key={opt.value}
                className={`px-4 py-3 active:bg-bg-muted ${
                  opt.value === value ? 'bg-accent/10' : ''
                }`}
                onPress={() => {
                  onChange(opt.value);
                  setExpanded(false);
                }}
              >
                <Text
                  className={`text-base ${
                    opt.value === value ? 'text-accent font-medium' : 'text-text-primary'
                  }`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─── Toggle component ───────────────────────────────────────────────────────

interface ToggleGroupProps {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}

function ToggleGroup({ label, options, value, onChange }: ToggleGroupProps) {
  return (
    <View className="mb-4">
      <Text className="text-text-secondary text-sm font-medium mb-1.5">{label}</Text>
      <View className="flex-row rounded-xl overflow-hidden border border-input-border">
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            className={`flex-1 py-3 items-center ${
              value === opt.value ? 'bg-accent' : 'bg-input-bg'
            }`}
            onPress={() => onChange(opt.value)}
          >
            <Text
              className={`font-medium text-base ${
                value === opt.value ? 'text-white' : 'text-text-primary'
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Step indicator ─────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  return (
    <View className="flex-row items-center justify-center py-4 gap-2">
      {STEPS.map((step, i) => (
        <View key={i} className="flex-row items-center">
          <View
            className={`w-8 h-8 rounded-full items-center justify-center ${
              i < current
                ? 'bg-success/20'
                : i === current
                  ? 'bg-accent'
                  : 'bg-bg-muted'
            }`}
          >
            {i < current ? (
              <Ionicons name="checkmark" size={16} color={colors.success} />
            ) : (
              <Text
                className={`text-sm font-bold ${
                  i === current ? 'text-white' : 'text-text-muted'
                }`}
              >
                {i + 1}
              </Text>
            )}
          </View>
          <Text
            className={`text-xs ml-1 ${
              i === current ? 'text-accent font-semibold' : 'text-text-muted'
            }`}
          >
            {step.label}
          </Text>
          {i < total - 1 && <View className="w-6 h-px bg-border-subtle mx-1" />}
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function ProspectionFormScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const employeId = useAgentStore((s) => s.employeId);

  const [step, setStep] = useState(0);
  const createProspection = useCreateProspection();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<ProspectionForm>({
    resolver: zodResolver(prospectionSchema),
    defaultValues: {
      sexe: 'M',
      type_revenu: 'Mensuel',
    },
  });

  const villeId = watch('ville_id');
  const arrondissementId = watch('arrondissement_id');
  const typeRevenu = watch('type_revenu');

  // Reference data
  const { data: villes } = useVilles();
  const { data: arrondissements } = useArrondissements(villeId);
  const { data: marches } = useMarches(arrondissementId);

  const villeOptions = (villes ?? []).map((v: any) => ({
    label: v.nom || v.name,
    value: String(v.id),
  }));

  const arrondissementOptions = (arrondissements ?? []).map((a: any) => ({
    label: a.nom || a.name,
    value: String(a.id),
  }));

  const marcheOptions = (marches ?? []).map((m: any) => ({
    label: m.nom || m.name,
    value: String(m.id),
  }));

  const activiteOptions = ACTIVITE_TYPES.map((t) => ({ label: t, value: t }));

  // Step validation
  const stepFields: (keyof ProspectionForm)[][] = [
    ['nom', 'prenom', 'telephone'],
    [],
    [],
  ];

  const handleNext = async () => {
    const fieldsToValidate = stepFields[step];
    if (fieldsToValidate.length > 0) {
      const isValid = await trigger(fieldsToValidate);
      if (!isValid) return;
    }
    setStep((s) => Math.min(s + 1, 2));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const onSubmit = async (data: ProspectionForm) => {
    if (!employeId) {
      Alert.alert('Erreur', 'Agent ID introuvable. Veuillez vous reconnecter.');
      return;
    }

    try {
      await createProspection.mutateAsync({
        agent_id: employeId,
        nom: data.nom,
        prenom: data.prenom,
        telephone: data.telephone,
        sexe: data.sexe,
        adresse: data.adresse,
        ville_id: data.ville_id ? Number(data.ville_id) : undefined,
        arrondissement_id: data.arrondissement_id ? Number(data.arrondissement_id) : undefined,
        marche_id: data.marche_id ? Number(data.marche_id) : undefined,
        type_activite: data.type_activite,
        activite_principale: data.activite_principale,
        anciennete_activite: data.anciennete_activite,
        description_activite: data.description_activite,
        type_revenu: data.type_revenu,
        revenu_estime: data.revenu_estime ? Number(data.revenu_estime) : undefined,
        revenu_journalier: data.revenu_journalier ? Number(data.revenu_journalier) : undefined,
        chiffre_affaires_mensuel: data.chiffre_affaires_mensuel
          ? Number(data.chiffre_affaires_mensuel)
          : undefined,
        commentaires_agent: data.commentaires_agent,
        observations: data.observations,
        statut: 'REGISTERED',
      });

      Alert.alert('Succes', 'Le prospect a ete enregistre avec succes.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || "Impossible d'enregistrer le prospect.");
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg-base"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Step indicator */}
      <StepIndicator current={step} total={3} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Step 1: Identite ──────────────────────────────────────── */}
        {step === 0 && (
          <Card className="mb-4">
            <Text className="text-text-primary text-lg font-bold mb-4">
              <Ionicons name="person-outline" size={18} color={colors.accent} /> Identite
            </Text>

            <Controller
              control={control}
              name="nom"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Nom *"
                  placeholder="Nom de famille"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.nom}
                  autoCapitalize="words"
                />
              )}
            />

            <Controller
              control={control}
              name="prenom"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Prenom *"
                  placeholder="Prenom"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.prenom}
                  autoCapitalize="words"
                />
              )}
            />

            <Controller
              control={control}
              name="telephone"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Telephone *"
                  placeholder="06XXXXXXXXX"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.telephone}
                  keyboardType="phone-pad"
                />
              )}
            />

            <Controller
              control={control}
              name="sexe"
              render={({ field: { onChange, value } }) => (
                <ToggleGroup
                  label="Sexe"
                  options={[
                    { label: 'Masculin', value: 'M' },
                    { label: 'Feminin', value: 'F' },
                  ]}
                  value={value}
                  onChange={onChange}
                />
              )}
            />

            <Controller
              control={control}
              name="adresse"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Adresse"
                  placeholder="Adresse du prospect"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />

            <Controller
              control={control}
              name="ville_id"
              render={({ field: { onChange, value } }) => (
                <PickerField
                  label="Ville"
                  options={villeOptions}
                  value={value}
                  onChange={(v) => {
                    onChange(v);
                    setValue('arrondissement_id', undefined);
                    setValue('marche_id', undefined);
                  }}
                  placeholder="Selectionner une ville"
                />
              )}
            />

            <Controller
              control={control}
              name="arrondissement_id"
              render={({ field: { onChange, value } }) => (
                <PickerField
                  label="Arrondissement"
                  options={arrondissementOptions}
                  value={value}
                  onChange={(v) => {
                    onChange(v);
                    setValue('marche_id', undefined);
                  }}
                  placeholder="Selectionner un arrondissement"
                />
              )}
            />

            <Controller
              control={control}
              name="marche_id"
              render={({ field: { onChange, value } }) => (
                <PickerField
                  label="Marche"
                  options={marcheOptions}
                  value={value}
                  onChange={onChange}
                  placeholder="Selectionner un marche"
                />
              )}
            />
          </Card>
        )}

        {/* ─── Step 2: Activite ──────────────────────────────────────── */}
        {step === 1 && (
          <Card className="mb-4">
            <Text className="text-text-primary text-lg font-bold mb-4">
              <Ionicons name="briefcase-outline" size={18} color={colors.accent} /> Activite
            </Text>

            <Controller
              control={control}
              name="type_activite"
              render={({ field: { onChange, value } }) => (
                <PickerField
                  label="Type d'activite"
                  options={activiteOptions}
                  value={value}
                  onChange={onChange}
                  placeholder="Selectionner le type"
                />
              )}
            />

            <Controller
              control={control}
              name="activite_principale"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Activite principale"
                  placeholder="Ex: Vente de vetements"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />

            <Controller
              control={control}
              name="anciennete_activite"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Anciennete dans l'activite"
                  placeholder="Ex: 5 ans"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />

            <Controller
              control={control}
              name="description_activite"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Description de l'activite"
                  placeholder="Decrivez l'activite du prospect..."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  multiline
                  numberOfLines={4}
                />
              )}
            />
          </Card>
        )}

        {/* ─── Step 3: Finance & Notes ───────────────────────────────── */}
        {step === 2 && (
          <Card className="mb-4">
            <Text className="text-text-primary text-lg font-bold mb-4">
              <Ionicons name="cash-outline" size={18} color={colors.accent} /> Finance & Notes
            </Text>

            <Controller
              control={control}
              name="type_revenu"
              render={({ field: { onChange, value } }) => (
                <ToggleGroup
                  label="Type de revenu"
                  options={[
                    { label: 'Mensuel', value: 'Mensuel' },
                    { label: 'Journalier', value: 'Journalier' },
                  ]}
                  value={value}
                  onChange={onChange}
                />
              )}
            />

            <Controller
              control={control}
              name="revenu_estime"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Revenu estime (FCFA)"
                  placeholder="0"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="numeric"
                />
              )}
            />

            {typeRevenu === 'Journalier' && (
              <Controller
                control={control}
                name="revenu_journalier"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Revenu journalier (FCFA)"
                    placeholder="0"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="numeric"
                  />
                )}
              />
            )}

            <Controller
              control={control}
              name="chiffre_affaires_mensuel"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Chiffre d'affaires mensuel (FCFA)"
                  placeholder="0"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="numeric"
                />
              )}
            />

            <Controller
              control={control}
              name="commentaires_agent"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Commentaires de l'agent"
                  placeholder="Vos observations sur le prospect..."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  multiline
                  numberOfLines={3}
                />
              )}
            />

            <Controller
              control={control}
              name="observations"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Observations"
                  placeholder="Informations supplementaires..."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  multiline
                  numberOfLines={3}
                />
              )}
            />
          </Card>
        )}
      </ScrollView>

      {/* Bottom navigation buttons */}
      <View className="px-5 pb-6 pt-3 bg-bg-base border-t border-border-subtle">
        <View className="flex-row gap-3">
          {step > 0 && (
            <Button
              title="Retour"
              variant="outline"
              onPress={handleBack}
              icon={<Ionicons name="arrow-back" size={18} color={colors.textPrimary} />}
              className="flex-1"
            />
          )}
          {step < 2 ? (
            <Button
              title="Suivant"
              onPress={handleNext}
              icon={<Ionicons name="arrow-forward" size={18} color="#ffffff" />}
              className="flex-1"
            />
          ) : (
            <Button
              title="Soumettre"
              onPress={handleSubmit(onSubmit)}
              loading={createProspection.isPending}
              icon={
                !createProspection.isPending ? (
                  <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                ) : undefined
              }
              className="flex-1"
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
