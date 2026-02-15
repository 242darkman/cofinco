import { useState } from 'react';
import { View, Text, ScrollView, Share } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import QRCode from 'react-native-qrcode-svg';

import { useAuthStore } from '@/stores/auth-store';
import { useAccounts } from '@/hooks/use-accounts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@shared/types/mobile';

const qrSchema = z.object({
  amount: z.string().optional(),
  description: z.string().optional(),
});

type QRForm = z.infer<typeof qrSchema>;

export default function QRGenerateScreen() {
  const user = useAuthStore((s) => s.user);
  const { data: accounts } = useAccounts();
  const [qrData, setQrData] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<QRForm>({
    resolver: zodResolver(qrSchema),
    defaultValues: { amount: '', description: '' },
  });

  const mainAccount = accounts?.data?.[0];

  const generateQR = (data: QRForm) => {
    const payload = {
      type: 'cofinco_payment',
      account: mainAccount?.numeroCompte,
      name: `${user?.nom} ${user?.prenom ?? ''}`.trim(),
      amount: data.amount ? parseFloat(data.amount) : undefined,
      description: data.description || undefined,
      timestamp: Date.now(),
    };
    setQrData(JSON.stringify(payload));
  };

  const shareQR = async () => {
    if (!qrData) return;
    const parsed = JSON.parse(qrData);
    await Share.share({
      message: `Paiement ${parsed.name}${parsed.amount ? ` - ${formatMoney(parsed.amount)}` : ''}`,
    });
  };

  return (
    <ScrollView
      className="flex-1 bg-bg-base"
      contentContainerClassName="px-5 py-6"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-text-primary text-xl font-bold mb-1">
        Recevoir un paiement
      </Text>
      <Text className="text-text-muted text-sm mb-6">
        Generez un code QR pour recevoir de l'argent
      </Text>

      {!qrData ? (
        <Card variant="elevated">
          <Controller
            control={control}
            name="amount"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Montant (optionnel)"
                placeholder="0"
                keyboardType="numeric"
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Description (optionnel)"
                placeholder="Ex: Loyer janvier"
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          <Button title="Generer le QR code" onPress={handleSubmit(generateQR)} size="lg" />
        </Card>
      ) : (
        <View className="items-center">
          <Card variant="elevated" className="items-center py-8 px-8 mb-4">
            <QRCode value={qrData} size={240} backgroundColor="transparent" />
            <Text className="text-text-primary text-lg font-bold mt-4">
              {user?.nom} {user?.prenom ?? ''}
            </Text>
            {mainAccount && (
              <Text className="text-text-muted text-xs mt-1">
                {mainAccount.numeroCompte}
              </Text>
            )}
            {JSON.parse(qrData).amount && (
              <Text className="text-accent text-xl font-bold mt-2">
                {formatMoney(JSON.parse(qrData).amount)}
              </Text>
            )}
          </Card>

          <View className="flex-row gap-3 w-full">
            <View className="flex-1">
              <Button
                title="Partager"
                variant="outline"
                onPress={shareQR}
              />
            </View>
            <View className="flex-1">
              <Button
                title="Nouveau QR"
                variant="secondary"
                onPress={() => setQrData(null)}
              />
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
