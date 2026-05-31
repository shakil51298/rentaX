import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import { useAppSettings } from '../lib/appSettings'

function normalizeRentalXId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
}

function extractRentalXId(rawValue) {
  const rawText = String(rawValue || '').trim()

  if (!rawText) return ''

  try {
    const parsed = JSON.parse(rawText)
    const jsonValue =
      parsed?.rentalx_id ||
      parsed?.rentalXId ||
      parsed?.rental_x_id ||
      parsed?.id

    if (jsonValue) return normalizeRentalXId(jsonValue)
  } catch {
    // The QR can be plain text or a URL, so JSON parsing is optional.
  }

  const queryMatch = rawText.match(/[?&](?:rentalx_id|rentalXId|id)=([^&#]+)/)

  if (queryMatch?.[1]) {
    try {
      return normalizeRentalXId(decodeURIComponent(queryMatch[1]))
    } catch {
      return normalizeRentalXId(queryMatch[1])
    }
  }

  if (/^https?:\/\//i.test(rawText) || /^rentalx:\/\//i.test(rawText)) {
    const cleanPath = rawText.split(/[?#]/)[0]
    const pathParts = cleanPath.split('/').filter(Boolean)
    const lastPart = pathParts[pathParts.length - 1]

    if (lastPart) return normalizeRentalXId(lastPart)
  }

  return normalizeRentalXId(rawText.replace(/^@/, '').replace(/^rentalx:/i, ''))
}

export default function ChatQrScannerScreen({ route, navigation }) {
  const { theme } = useAppSettings()
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const purpose = route?.params?.purpose || 'add-contact'

  function handleBarcodeScanned(event) {
    if (scanned) return

    const rentalXId = extractRentalXId(event?.data)

    if (!rentalXId) {
      setScanned(true)
      Alert.alert('Invalid code', 'This QR code does not include a Rental X ID.', [
        { text: 'Scan again', onPress: () => setScanned(false) },
      ])
      return
    }

    setScanned(true)
    navigation.navigate('MainTabs', {
      screen: 'Chat',
      params: {
        scannedRentalXId: rentalXId,
        scannedContactAction: purpose,
        scanNonce: `${Date.now()}-${rentalXId}`,
      },
    })
  }

  if (!permission) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.accent} />
      </SafeAreaView>
    )
  }

  if (!permission.granted) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          padding: 20,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 28,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Ionicons name="scan-outline" size={34} color={theme.accent} />
        </View>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>
          Camera permission needed
        </Text>
        <Text style={{ color: theme.mutedText, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Allow camera access to scan a Rental X ID QR code.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          activeOpacity={0.84}
          style={{
            minHeight: 46,
            borderRadius: 16,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 22,
            marginTop: 18,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '900' }}>Allow camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#020617' }}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(15, 23, 42, 0.72)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <Text style={{ flex: 1, color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'center' }}>
            Scan Rental X ID
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 }}>
          <View
            style={{
              width: '100%',
              aspectRatio: 1,
              borderRadius: 28,
              borderWidth: 3,
              borderColor: '#fff',
              backgroundColor: 'rgba(15, 23, 42, 0.08)',
            }}
          />
          <Text style={{ color: '#fff', fontWeight: '900', marginTop: 18, textAlign: 'center' }}>
            Place the Rental X QR inside the frame
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
            We will add the contact automatically after scanning.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  )
}
