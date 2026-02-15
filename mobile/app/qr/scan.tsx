import { useState, useEffect } from 'react';
import { View, Text, Alert, Vibration } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@shared/types/mobile';

interface QRPayload {
  type: string;
  account?: string;
  name?: string;
  amount?: number;
  description?: string;
}

export default function QRScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [paymentData, setPaymentData] = useState<QRPayload | null>(null);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    Vibration.vibrate(50);

    try {
      const parsed: QRPayload = JSON.parse(data);
      if (parsed.type !== 'cofinco_payment') {
        Alert.alert('QR invalide', 'Ce code QR n\'est pas un paiement COFINCO.');
        setScanned(false);
        return;
      }
      setPaymentData(parsed);
    } catch {
      Alert.alert('Erreur', 'Code QR non reconnu.');
      setScanned(false);
    }
  };

  const confirmPayment = () => {
    Alert.alert(
      'Paiement confirme',
      `Paiement vers ${paymentData?.name ?? 'inconnu'}${paymentData?.amount ? ` de ${formatMoney(paymentData.amount)}` : ''} initie.`,
      [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]
    );
  };

  if (!permission) {
    return <View className="flex-1 bg-bg-base" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-bg-base items-center justify-center px-8">
        <Ionicons name="camera-outline" size={64} color="#94a3b8" />
        <Text className="text-text-primary text-lg font-bold mt-4 text-center">
          Acces camera requis
        </Text>
        <Text className="text-text-muted text-sm text-center mt-2 mb-6">
          L'acces a la camera est necessaire pour scanner les codes QR de paiement.
        </Text>
        <Button title="Autoriser la camera" onPress={requestPermission} />
      </View>
    );
  }

  if (paymentData) {
    return (
      <View className="flex-1 bg-bg-base items-center justify-center px-5">
        <Card variant="elevated" className="w-full items-center py-8">
          <View className="w-16 h-16 rounded-full bg-success-bg items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={40} color="#047857" />
          </View>
          <Text className="text-text-primary text-lg font-bold mb-1">
            Paiement detecte
          </Text>
          <Text className="text-text-muted text-sm mb-4 text-center">
            Destinataire: {paymentData.name ?? 'Inconnu'}
          </Text>
          {paymentData.account && (
            <Text className="text-text-muted text-xs mb-2">
              Compte: {paymentData.account}
            </Text>
          )}
          {paymentData.amount && (
            <Text className="text-accent text-2xl font-bold mb-1">
              {formatMoney(paymentData.amount)}
            </Text>
          )}
          {paymentData.description && (
            <Text className="text-text-muted text-sm mb-4">
              {paymentData.description}
            </Text>
          )}

          <View className="flex-row gap-3 mt-4 w-full px-4">
            <View className="flex-1">
              <Button
                title="Annuler"
                variant="outline"
                onPress={() => {
                  setPaymentData(null);
                  setScanned(false);
                }}
              />
            </View>
            <View className="flex-1">
              <Button title="Confirmer" onPress={confirmPayment} />
            </View>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarCodeScanned}
      >
        {/* Overlay */}
        <View className="flex-1 items-center justify-center">
          {/* Scan frame */}
          <View className="w-64 h-64 border-2 border-white rounded-3xl" />
          <Text className="text-white text-sm mt-6 text-center px-8">
            Placez le code QR dans le cadre pour scanner
          </Text>
        </View>
      </CameraView>
    </View>
  );
}
