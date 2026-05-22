import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import {
  COMPARE_LIMIT,
  loadComparedProperties,
  removeComparedProperty,
} from '../lib/propertyBrowse'
import { useAppSettings } from '../lib/appSettings'

const DETAIL_ROWS = [
  { label: 'Rent', key: 'price', formatter: (item) => (item?.price ? `৳ ${item.price}` : '—') },
  { label: 'Area', key: 'location', formatter: (item) => item?.location || '—' },
  { label: 'Availability', key: 'status', formatter: (item) => item?.status === 'rented' ? 'Rented out' : 'Open for rent' },
  { label: 'Bedrooms', key: 'beds', formatter: (item) => item?.beds ? String(item.beds) : '—' },
  { label: 'Bathrooms', key: 'baths', formatter: (item) => item?.baths ? String(item.baths) : '—' },
  { label: 'Size', key: 'size_sqft', formatter: (item) => item?.size_sqft ? `${item.size_sqft} sq ft` : '—' },
  { label: 'Furnishing', key: 'furnishing_status', formatter: (item) => item?.furnishing_status === 'furnished' ? 'Furnished' : item?.furnishing_status === 'unfurnished' ? 'Unfurnished' : '—' },
  { label: 'Tenant', key: 'tenant_type', formatter: (item) => item?.tenant_type === 'family' ? 'Family' : item?.tenant_type === 'bachelor' ? 'Bachelor' : item?.tenant_type === 'any' ? 'Family / Bachelor' : '—' },
  { label: 'Parking', key: 'parking', formatter: (item) => item?.parking ? 'Yes' : 'No' },
  { label: 'Lift', key: 'lift_available', formatter: (item) => item?.lift_available ? 'Yes' : 'No' },
  { label: 'Generator', key: 'generator_backup', formatter: (item) => item?.generator_backup ? 'Yes' : 'No' },
  { label: 'Gas', key: 'gas_available', formatter: (item) => item?.gas_available ? 'Yes' : 'No' },
  { label: 'Pet friendly', key: 'pet_friendly', formatter: (item) => item?.pet_friendly ? 'Yes' : 'No' },
  { label: 'Available from', key: 'available_from', formatter: (item) => item?.available_from || '—' },
  { label: 'Floor', key: 'floor_no', formatter: (item) => item?.floor_no ? String(item.floor_no) : '—' },
  { label: 'Facing', key: 'facing_direction', formatter: (item) => item?.facing_direction || '—' },
  { label: 'Balcony', key: 'has_balcony', formatter: (item) => item?.has_balcony ? 'Yes' : 'No' },
  { label: 'Service charge', key: 'service_charge_included', formatter: (item) => item?.service_charge_included ? 'Included' : 'Separate' },
]

function getCoverImage(item) {
  return item?.image_url || item?.media?.[0]?.uri || null
}

function getComparableValue(item, key) {
  return item?.[key]
}

export default function ComparePropertiesScreen({ navigation }) {
  const { theme } = useAppSettings()
  const [items, setItems] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [storageUserId, setStorageUserId] = useState('guest')

  const loadItems = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const nextStorageUserId = user?.id || user?.email || 'guest'
    setStorageUserId(nextStorageUserId)
    setItems(await loadComparedProperties(nextStorageUserId))
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  async function handleRefresh() {
    setRefreshing(true)
    await loadItems()
    setRefreshing(false)
  }

  async function handleRemove(propertyId) {
    setItems(await removeComparedProperty(storageUserId, propertyId))
  }

  const differenceKeys = useMemo(() => {
    return new Set(
      DETAIL_ROWS.filter((row) => {
        const values = [...new Set(items.map((item) => String(getComparableValue(item, row.key) ?? '')))]
        return values.length > 1
      }).map((row) => row.key)
    )
  }, [items])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ padding: 14, paddingBottom: 26 }}
      >
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
            Compare properties
          </Text>
          <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
            Compare up to {COMPARE_LIMIT} rentals side by side and spot the important differences quickly.
          </Text>
        </View>

        {items.length === 0 ? (
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              paddingVertical: 34,
              paddingHorizontal: 20,
              alignItems: 'center',
            }}
          >
            <Ionicons name="git-compare-outline" size={34} color={theme.mutedText} />
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900', marginTop: 10 }}>
              No properties in compare yet
            </Text>
            <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 5, textAlign: 'center', lineHeight: 16 }}>
              Add properties from the feed or a property page, then compare them side by side here.
            </Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              overflow: 'hidden',
            }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row' }}>
                <View
                  style={{
                    width: 118,
                    backgroundColor: theme.surfaceMuted,
                    borderRightWidth: 1,
                    borderRightColor: theme.border,
                  }}
                >
                  <View style={{ height: 206, justifyContent: 'flex-end', padding: 12 }}>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                      Details
                    </Text>
                    <Text style={{ color: theme.mutedText, fontSize: 10, marginTop: 4, lineHeight: 14 }}>
                      Rows with different values are highlighted.
                    </Text>
                  </View>

                  {DETAIL_ROWS.map((row) => (
                    <View
                      key={row.key}
                      style={{
                        minHeight: 48,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        justifyContent: 'center',
                        borderTopWidth: 1,
                        borderTopColor: theme.border,
                      }}
                    >
                      <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800' }}>
                        {row.label}
                      </Text>
                    </View>
                  ))}
                </View>

                {items.map((item) => {
                  const imageUri = getCoverImage(item)

                  return (
                    <View
                      key={item.id}
                      style={{
                        width: 198,
                        borderRightWidth: 1,
                        borderRightColor: theme.border,
                      }}
                    >
                      <View style={{ padding: 12 }}>
                        <TouchableOpacity
                          onPress={() => navigation.navigate('Property', { property: item })}
                          activeOpacity={0.88}
                        >
                          {imageUri ? (
                            <Image
                              source={{ uri: imageUri }}
                              style={{ width: '100%', height: 108, borderRadius: 14, backgroundColor: theme.surfaceMuted }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View
                              style={{
                                width: '100%',
                                height: 108,
                                borderRadius: 14,
                                backgroundColor: theme.surfaceMuted,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Ionicons name="home-outline" size={28} color={theme.mutedText} />
                            </View>
                          )}
                        </TouchableOpacity>

                        <View style={{ marginTop: 10, minHeight: 74 }}>
                          <Text numberOfLines={2} style={{ color: theme.text, fontSize: 13, fontWeight: '900', lineHeight: 18 }}>
                            {item.title || 'Rental post'}
                          </Text>
                          <Text numberOfLines={2} style={{ color: theme.mutedText, fontSize: 10, marginTop: 5, lineHeight: 14 }}>
                            {item.location || 'Location not added'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                          <TouchableOpacity
                            onPress={() => navigation.navigate('Property', { property: item })}
                            style={{
                              flex: 1,
                              minHeight: 34,
                              borderRadius: 12,
                              backgroundColor: theme.accentSoft,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '900' }}>Open</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleRemove(item.id)}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 12,
                              backgroundColor: theme.surfaceMuted,
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Ionicons name="close" size={16} color={theme.mutedText} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {DETAIL_ROWS.map((row) => {
                        const isDifferent = differenceKeys.has(row.key)

                        return (
                          <View
                            key={`${item.id}-${row.key}`}
                            style={{
                              minHeight: 48,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              justifyContent: 'center',
                              borderTopWidth: 1,
                              borderTopColor: theme.border,
                              backgroundColor: isDifferent ? '#fff7ed' : theme.surface,
                            }}
                          >
                            <Text style={{ color: isDifferent ? '#9a3412' : theme.text, fontSize: 11, fontWeight: '800', lineHeight: 16 }}>
                              {row.formatter(item)}
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  )
                })}
              </View>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
