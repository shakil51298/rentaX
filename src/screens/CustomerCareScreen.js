import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import {
  fetchCustomerCareHistory,
  fetchPropertyCaseForUser,
  formatReportReason,
  getCaseStatusMeta,
  submitPropertyAppeal,
} from '../lib/reporting'

function formatDateTime(value) {
  if (!value) return 'Not available'

  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function DetailRow({ icon, label, value }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingVertical: 9,
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

function HistoryCard({ icon, title, subtitle, meta, tint = '#2563eb', background = '#eff6ff' }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 14,
        marginTop: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: background,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Ionicons name={icon} size={16} color={tint} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '900' }}>{title}</Text>
          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 3, lineHeight: 18 }}>
            {subtitle}
          </Text>
        </View>
      </View>

      <Text style={{ color: '#94a3b8', fontSize: 11.5, fontWeight: '700', marginTop: 9 }}>
        {meta}
      </Text>
    </View>
  )
}

export default function CustomerCareScreen({ route }) {
  const initialProperty = route?.params?.property || null
  const notification = route?.params?.notification || null
  const propertyId = initialProperty?.id || notification?.property_id || null
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)
  const [property, setProperty] = useState(initialProperty)
  const [currentCase, setCurrentCase] = useState(null)
  const [history, setHistory] = useState({
    propertyCases: [],
    submittedPropertyReports: [],
    submittedUserReports: [],
  })
  const [appealMessage, setAppealMessage] = useState('')
  const [submittingAppeal, setSubmittingAppeal] = useState(false)

  const loadCaseData = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user || null)

    if (!user?.id) {
      setLoading(false)
      return
    }

    let nextProperty = initialProperty || null

    if (!nextProperty && propertyId) {
      const { data } = await supabase
        .from('properties')
        .select('*')
        .eq('id', String(propertyId))
        .maybeSingle()

      nextProperty = data || null
    }

    try {
      const [nextCase, nextHistory] = await Promise.all([
        propertyId
          ? fetchPropertyCaseForUser({ userId: user.id, propertyId })
          : Promise.resolve(null),
        fetchCustomerCareHistory(user.id),
      ])

      setProperty(nextProperty)
      setCurrentCase(nextCase)
      setHistory(nextHistory)
      setAppealMessage(nextCase?.appeal_message || '')
    } catch (error) {
      Alert.alert('Customer care unavailable', error.message)
    } finally {
      setLoading(false)
    }
  }, [initialProperty, propertyId])

  useFocusEffect(
    useCallback(() => {
      loadCaseData()
    }, [loadCaseData])
  )

  async function handleSubmitAppeal() {
    if (!currentUser?.id || !currentCase?.id) return

    setSubmittingAppeal(true)

    try {
      const updatedCase = await submitPropertyAppeal({
        reportId: currentCase.id,
        userId: currentUser.id,
        message: appealMessage,
      })

      setCurrentCase(updatedCase)
      Alert.alert('Appeal submitted', 'Your message was sent to admin review.')
      loadCaseData()
    } catch (error) {
      Alert.alert('Appeal failed', error.message)
    } finally {
      setSubmittingAppeal(false)
    }
  }

  const priceLabel = useMemo(() => {
    const rawPrice = property?.price
    if (rawPrice === null || rawPrice === undefined || rawPrice === '') {
      return 'Not available'
    }

    return `৳ ${rawPrice}`
  }, [property?.price])

  const caseMeta = getCaseStatusMeta(currentCase?.case_status)

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
              backgroundColor: caseMeta.background,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={caseMeta.icon} size={24} color={caseMeta.tint} />
          </View>

          <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '900', marginTop: 16 }}>
            Customer Care
          </Text>
          <Text style={{ color: '#64748b', lineHeight: 21, marginTop: 8 }}>
            Track your moderation case, review the admin reply, and send an appeal if something still needs attention.
          </Text>

          <View
            style={{
              marginTop: 16,
              borderRadius: 16,
              backgroundColor: caseMeta.background,
              borderWidth: 1,
              borderColor: caseMeta.border,
              padding: 14,
            }}
          >
            <Text style={{ color: caseMeta.tint, fontSize: 12, fontWeight: '900' }}>Case status</Text>
            <Text style={{ color: caseMeta.tint, fontSize: 16, fontWeight: '900', marginTop: 4 }}>
              {caseMeta.label}
            </Text>
            <Text style={{ color: '#475569', lineHeight: 19, marginTop: 7 }}>
              {currentCase?.admin_reply || property?.admin_ban_reason || notification?.body || 'We are reviewing this issue with your listing.'}
            </Text>
          </View>

          <View style={{ marginTop: 12 }}>
            <DetailRow icon="home-outline" label="Ad title" value={property?.title || notification?.title} />
            <DetailRow icon="location-outline" label="Location" value={property?.location} />
            <DetailRow icon="cash-outline" label="Rent amount" value={priceLabel} />
            <DetailRow icon="flag-outline" label="Case reason" value={currentCase ? formatReportReason(currentCase.reason) : 'Moderation review'} />
            <DetailRow icon="time-outline" label="Case opened" value={formatDateTime(currentCase?.created_at || property?.admin_banned_at)} />
            <DetailRow icon="mail-open-outline" label="Last admin reply" value={formatDateTime(currentCase?.admin_replied_at)} />
          </View>
        </View>

        {currentCase && currentCase.case_status !== 'resolved' ? (
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
            <Text style={{ color: '#0f172a', fontSize: 17, fontWeight: '900' }}>Submit an appeal</Text>
            <Text style={{ color: '#64748b', lineHeight: 20, marginTop: 8 }}>
              Tell admin why you believe the case should be reviewed again or what has been fixed already.
            </Text>

            <TextInput
              value={appealMessage}
              onChangeText={setAppealMessage}
              multiline
              textAlignVertical="top"
              placeholder="Explain what you changed or why you want another review."
              style={{
                marginTop: 12,
                minHeight: 120,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#dbe4ee',
                backgroundColor: '#f8fafc',
                paddingHorizontal: 13,
                paddingVertical: 12,
                color: '#0f172a',
                fontSize: 14,
              }}
            />

            <TouchableOpacity
              activeOpacity={0.86}
              disabled={submittingAppeal}
              onPress={handleSubmitAppeal}
              style={{
                marginTop: 14,
                height: 48,
                borderRadius: 15,
                backgroundColor: '#7c3aed',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                opacity: submittingAppeal ? 0.6 : 1,
              }}
            >
              <Ionicons name="send-outline" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900', marginLeft: 8 }}>
                {currentCase.appeal_submitted_at ? 'Update appeal' : 'Submit appeal'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

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
          <Text style={{ color: '#0f172a', fontSize: 17, fontWeight: '900' }}>Case history</Text>
          <Text style={{ color: '#64748b', lineHeight: 20, marginTop: 8 }}>
            A small history of your moderated listings and reports you submitted.
          </Text>

          {history.propertyCases.map((item) => {
            const meta = getCaseStatusMeta(item.case_status)
            return (
              <HistoryCard
                key={`case-${item.id}`}
                icon={meta.icon}
                tint={meta.tint}
                background={meta.background}
                title={item.property?.title || 'Moderated property case'}
                subtitle={`${meta.label} · ${formatReportReason(item.reason)}${item.admin_reply ? ` · ${item.admin_reply}` : ''}`}
                meta={formatDateTime(item.updated_at || item.created_at)}
              />
            )
          })}

          {history.submittedPropertyReports.map((item) => (
            <HistoryCard
              key={`submitted-property-${item.id}`}
              icon="flag-outline"
              title={item.property?.title || 'Property report'}
              subtitle={`You reported this post for ${formatReportReason(item.reason).toLowerCase()}.`}
              meta={formatDateTime(item.created_at)}
            />
          ))}

          {history.submittedUserReports.map((item) => (
            <HistoryCard
              key={`submitted-user-${item.id}`}
              icon="person-outline"
              title={item.target_profile?.display_name || item.target_profile?.email || 'User report'}
              subtitle={`You reported this account for ${formatReportReason(item.reason).toLowerCase()}.`}
              meta={formatDateTime(item.created_at)}
            />
          ))}

          {!history.propertyCases.length && !history.submittedPropertyReports.length && !history.submittedUserReports.length ? (
            <Text style={{ color: '#64748b', marginTop: 12 }}>
              No case history yet.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
