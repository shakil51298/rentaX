import { useMemo } from 'react'
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

function DetailRow({ icon, label, value }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eef2f7',
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: '#eff6ff',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        <Ionicons name={icon} size={14} color="#2563eb" />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '800' }}>{label}</Text>
        <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '700', marginTop: 4 }}>
          {value || 'Not available'}
        </Text>
      </View>
    </View>
  )
}

export default function CustomerCareScreen({ route }) {
  const property = route?.params?.property || null
  const notification = route?.params?.notification || null
  const banReason = property?.admin_ban_reason || notification?.body || 'Please review this listing with customer care.'

  const priceLabel = useMemo(() => {
    const rawPrice = property?.price
    if (rawPrice === null || rawPrice === undefined || rawPrice === '') {
      return 'Not available'
    }

    return `৳ ${rawPrice}`
  }, [property?.price])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 22,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 18,
          }}
        >
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: '#fef2f2',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="shield-outline" size={24} color="#dc2626" />
          </View>

          <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '900', marginTop: 16 }}>
            Customer Care Service
          </Text>
          <Text style={{ color: '#64748b', lineHeight: 21, marginTop: 8 }}>
            This ad has been hidden from public feeds by admin moderation. Please review the details below and contact support if you need clarification before reposting.
          </Text>

          <View
            style={{
              marginTop: 16,
              borderRadius: 16,
              backgroundColor: '#fff7ed',
              borderWidth: 1,
              borderColor: '#fdba74',
              padding: 14,
            }}
          >
            <Text style={{ color: '#9a3412', fontSize: 12, fontWeight: '900' }}>Moderation note</Text>
            <Text style={{ color: '#7c2d12', lineHeight: 20, marginTop: 6 }}>
              {banReason}
            </Text>
          </View>

          <View style={{ marginTop: 12 }}>
            <DetailRow icon="home-outline" label="Ad title" value={property?.title || notification?.title} />
            <DetailRow icon="location-outline" label="Location" value={property?.location} />
            <DetailRow icon="cash-outline" label="Rent amount" value={priceLabel} />
            <DetailRow icon="document-text-outline" label="Ad details" value={property?.description || 'No description added'} />
          </View>
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 22,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 18,
            marginTop: 14,
          }}
        >
          <Text style={{ color: '#0f172a', fontSize: 17, fontWeight: '900' }}>What to do next</Text>
          <Text style={{ color: '#64748b', lineHeight: 20, marginTop: 8 }}>
            1. Review the moderation note carefully.
          </Text>
          <Text style={{ color: '#64748b', lineHeight: 20, marginTop: 6 }}>
            2. Update anything misleading, incomplete, or policy-sensitive in the ad.
          </Text>
          <Text style={{ color: '#64748b', lineHeight: 20, marginTop: 6 }}>
            3. Contact customer care if you believe the action was a mistake.
          </Text>

          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => Linking.openURL('mailto:customercare@rentalx.app?subject=Rental%20X%20Ad%20Moderation%20Support')}
            style={{
              marginTop: 16,
              height: 48,
              borderRadius: 15,
              backgroundColor: '#1877F2',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <Ionicons name="mail-outline" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>Email customer care</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
