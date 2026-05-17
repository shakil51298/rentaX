import { useMemo, useState } from 'react'
import {
  Alert,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { REPORT_REASONS, submitPropertyReport, submitUserReport } from '../lib/reporting'

function ReasonCard({ item, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={{
        borderWidth: 1,
        borderColor: selected ? '#93c5fd' : '#e2e8f0',
        backgroundColor: selected ? '#eff6ff' : '#fff',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 12,
      }}
    >
      <Text style={{ color: selected ? '#1d4ed8' : '#0f172a', fontWeight: '800', fontSize: 13 }}>
        {item.title}
      </Text>
    </TouchableOpacity>
  )
}

function MetaRow({ icon, text }) {
  if (!text) return null

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
      <Ionicons name={icon} size={15} color="#64748b" />
      <Text style={{ color: '#475569', marginLeft: 8, flex: 1, lineHeight: 18 }}>
        {text}
      </Text>
    </View>
  )
}

export default function ReportIssueScreen({ navigation, route }) {
  const kind = route.params?.kind === 'user' ? 'user' : 'property'
  const property = route.params?.property || null
  const owner = route.params?.owner || null
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0].id)
  const [details, setDetails] = useState('')
  const [blockToo, setBlockToo] = useState(kind === 'user')
  const [saving, setSaving] = useState(false)

  const ownerId = owner?.id || property?.owner_id || null
  const ownerName =
    owner?.name
    || property?.owner_profile?.display_name
    || property?.owner_name
    || property?.owner_email
    || 'Rental X member'

  const targetTitle = useMemo(() => {
    if (kind === 'user') {
      return ownerName
    }

    return property?.title || 'Property post'
  }, [kind, ownerName, property?.title])

  async function submitReport() {
    if (saving) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      Alert.alert('Login required', 'Please log in again before sending a report.')
      return
    }

    if (kind === 'user' && !ownerId) {
      Alert.alert('Missing user', 'We could not identify which user to report.')
      return
    }

    if (kind === 'property' && (!property?.id || !ownerId)) {
      Alert.alert('Missing post', 'We could not identify which post to report.')
      return
    }

    setSaving(true)

    try {
      if (kind === 'user') {
        await submitUserReport({
          reporterId: user.id,
          targetUserId: ownerId,
          reason: selectedReason,
          details,
          blockToo,
        })
      } else {
        await submitPropertyReport({
          reporterId: user.id,
          property,
          reason: selectedReason,
          details,
          blockOwnerToo: blockToo,
        })
      }

      Alert.alert(
        'Report sent',
        blockToo
          ? 'Thanks. We sent your report and hid this user’s posts from your feed.'
          : 'Thanks. Your report was sent to the admin review queue.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      )
    } catch (error) {
      Alert.alert('Report failed', error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: '#fef2f2',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="flag-outline" size={18} color="#dc2626" />
            </View>

            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: '#0f172a', fontSize: 17, fontWeight: '900' }}>
                {kind === 'user' ? 'Report user' : 'Report post'}
              </Text>
              <Text style={{ color: '#64748b', marginTop: 3, lineHeight: 18 }}>
                Tell us what went wrong and we’ll send it to the admin review queue.
              </Text>
            </View>
          </View>

          <View
            style={{
              marginTop: 14,
              backgroundColor: '#f8fafc',
              borderRadius: 14,
              padding: 12,
            }}
          >
            <Text style={{ color: '#111827', fontWeight: '900' }}>
              {targetTitle}
            </Text>
            <MetaRow icon="person-outline" text={kind === 'property' ? ownerName : null} />
            <MetaRow icon="location-outline" text={kind === 'property' ? property?.location : null} />
          </View>
        </View>

        <View style={{ marginTop: 14, gap: 10 }}>
          {REPORT_REASONS.map((reason) => (
            <ReasonCard
              key={reason.id}
              item={reason}
              selected={selectedReason === reason.id}
              onPress={() => setSelectedReason(reason.id)}
            />
          ))}
        </View>

        <View
          style={{
            marginTop: 14,
            backgroundColor: '#fff',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 16,
          }}
        >
          <Text style={{ color: '#475569', fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
            Extra details
          </Text>

          <TextInput
            value={details}
            onChangeText={setDetails}
            multiline
            textAlignVertical="top"
            placeholder="Add more details if you want to help us review it faster."
            style={{
              backgroundColor: '#f8fafc',
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 14,
              paddingHorizontal: 13,
              paddingVertical: 12,
              minHeight: 110,
              color: '#0f172a',
              fontSize: 14,
            }}
          />

          {ownerId ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 14,
              }}
            >
              <View style={{ flex: 1, paddingRight: 16 }}>
                <Text style={{ color: '#111827', fontWeight: '800', fontSize: 13 }}>
                  Also block this user
                </Text>
                <Text style={{ color: '#64748b', marginTop: 3, fontSize: 12, lineHeight: 17 }}>
                  Hide all of this user’s posts from your feed right away.
                </Text>
              </View>

              <Switch
                value={blockToo}
                onValueChange={setBlockToo}
                trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
                thumbColor={blockToo ? '#1877F2' : '#f8fafc'}
              />
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={submitReport}
          activeOpacity={0.86}
          disabled={saving}
          style={{
            marginTop: 18,
            backgroundColor: '#dc2626',
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: saving ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
            {saving ? 'Sending report...' : 'Send report'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
