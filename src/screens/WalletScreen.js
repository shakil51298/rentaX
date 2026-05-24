import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
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
import { useAppSettings } from '../lib/appSettings'
import {
  WALLET_CURRENCY,
  WALLET_MAX_REQUEST_AMOUNT,
  fetchWalletBalance,
  fetchWalletEntries,
  fetchWalletTopupRequests,
  formatWalletAmount,
  getWalletEntryTitle,
  getWalletRequestStatusMeta,
  parseWalletAmount,
  requestWalletTopup,
} from '../lib/wallet'

function formatShortDate(date) {
  if (!date) return ''

  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function StatusPill({ status, theme }) {
  const meta = getWalletRequestStatusMeta(status)

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        backgroundColor: meta.bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        gap: 4,
      }}
    >
      <Ionicons name={meta.icon} size={12} color={meta.color} />
      <Text style={{ color: meta.color, fontSize: 10, fontWeight: '900' }}>
        {meta.label}
      </Text>
    </View>
  )
}

export default function WalletScreen() {
  const { theme } = useAppSettings()
  const [user, setUser] = useState(null)
  const [entries, setEntries] = useState([])
  const [requests, setRequests] = useState([])
  const [walletBalance, setWalletBalance] = useState(0)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const pendingTotal = useMemo(
    () =>
      requests
        .filter((request) => request.status === 'pending')
        .reduce((total, request) => total + Number(request.amount || 0), 0),
    [requests]
  )

  const loadWallet = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

      setUser(currentUser || null)

    if (!currentUser?.id) {
      setEntries([])
      setRequests([])
      setWalletBalance(0)
      setLoading(false)
      return
    }

    try {
      const [nextEntries, nextRequests, nextBalance] = await Promise.all([
        fetchWalletEntries(currentUser.id),
        fetchWalletTopupRequests(currentUser.id),
        fetchWalletBalance(currentUser.id),
      ])

      setEntries(nextEntries)
      setRequests(nextRequests)
      setWalletBalance(nextBalance)
    } catch (error) {
      Alert.alert(
        'Wallet setup needed',
        error?.message || 'Run supabase-red-packet-features.sql to enable wallet requests.'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadWallet()
    }, [loadWallet])
  )

  async function refreshWallet() {
    setRefreshing(true)
    await loadWallet(false)
  }

  async function submitRequest() {
    if (!user?.id || submitting) return

    const cleanAmount = parseWalletAmount(amount)

    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      Alert.alert('Amount needed', 'Enter the e-money amount you want admin to add.')
      return
    }

    if (cleanAmount > WALLET_MAX_REQUEST_AMOUNT) {
      Alert.alert('Amount too high', 'You can request up to 500,000 BDT.')
      return
    }

    try {
      setSubmitting(true)
      await requestWalletTopup({
        user,
        amount: cleanAmount,
        note,
        currency: WALLET_CURRENCY,
      })
      setAmount('')
      setNote('')
      await loadWallet(false)
      Alert.alert('Request sent', 'Admin will review your e-money request.')
    } catch (error) {
      Alert.alert('Request failed', error?.message || 'Could not send this wallet request.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshWallet} tintColor={theme.accent} />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}
      >
        <View
          style={{
            borderRadius: 22,
            backgroundColor: theme.accent,
            padding: 18,
            overflow: 'hidden',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '900' }}>
                Wallet balance
              </Text>
              <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 5 }}>
                {formatWalletAmount(walletBalance)}
              </Text>
            </View>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: 'rgba(255,255,255,0.18)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="wallet" size={24} color="#fff" />
            </View>
          </View>

          <View
            style={{
              marginTop: 14,
              borderRadius: 14,
              backgroundColor: 'rgba(255,255,255,0.14)',
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '800' }}>
              Pending admin review
            </Text>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>
              {formatWalletAmount(pendingTotal)}
            </Text>
          </View>
        </View>

        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            padding: 14,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="add-circle-outline" size={20} color={theme.accent} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
              Request e-money
            </Text>
          </View>

          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surfaceMuted,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '900' }}>
              Amount
            </Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.mutedText}
              style={{ color: theme.text, fontSize: 20, fontWeight: '900', paddingVertical: 4 }}
            />
          </View>

          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surfaceMuted,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '900' }}>
              Note for admin
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Example: add money for red packet gifts"
              placeholderTextColor={theme.mutedText}
              multiline
              maxLength={160}
              style={{ color: theme.text, fontSize: 13, minHeight: 42, textAlignVertical: 'top' }}
            />
          </View>

          <TouchableOpacity
            onPress={submitRequest}
            disabled={submitting}
            activeOpacity={0.86}
            style={{
              minHeight: 46,
              borderRadius: 14,
              backgroundColor: submitting ? theme.accentSoft : theme.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>
                Send request
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
            Requests
          </Text>
          {requests.length ? (
            requests.slice(0, 8).map((request) => (
              <View
                key={request.id}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900' }}>
                      {formatWalletAmount(request.amount, request.currency)}
                    </Text>
                    <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 3 }}>
                      {formatShortDate(request.created_at)}
                    </Text>
                  </View>
                  <StatusPill status={request.status} theme={theme} />
                </View>
                {request.note ? (
                  <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
                    {request.note}
                  </Text>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={{ color: theme.mutedText, textAlign: 'center', paddingVertical: 14 }}>
              No e-money requests yet.
            </Text>
          )}
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
            Transactions
          </Text>
          {entries.length ? (
            entries.map((entry) => {
              const isPositive = Number(entry.amount || 0) > 0

              return (
                <View
                  key={entry.id}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: isPositive ? '#dcfce7' : '#fee2e2',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name={isPositive ? 'arrow-down-circle' : 'arrow-up-circle'}
                      size={19}
                      color={isPositive ? '#16a34a' : '#dc2626'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                      {getWalletEntryTitle(entry)}
                    </Text>
                    <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 3 }}>
                      {formatShortDate(entry.created_at)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: isPositive ? '#16a34a' : '#dc2626',
                      fontSize: 13,
                      fontWeight: '900',
                    }}
                  >
                    {isPositive ? '+' : ''}
                    {formatWalletAmount(entry.amount, entry.currency)}
                  </Text>
                </View>
              )
            })
          ) : (
            <Text style={{ color: theme.mutedText, textAlign: 'center', paddingVertical: 14 }}>
              No wallet transactions yet.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
