import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import Avatar from '../components/common/Avatar'
import { supabase } from '../lib/supabase'
import { normalizeMediaList, PROPERTY_MEDIA_BUCKET, uploadMediaAsset } from '../lib/media'
import { ensureUserProfileRecord } from '../lib/profileSync'
import { notifySavedSearchMatchesForProperty } from '../lib/savedSearches'
import { getUserAvatarUrl, getUserDisplayName } from '../lib/userDisplay'
import { isPrimaryAdmin } from '../lib/admin'
import { useAppSettings } from '../lib/appSettings'

function Field({ label, placeholder, multiline, keyboardType, value, onChangeText, theme }) {
  return (
    <View style={{ marginBottom: 11 }}>
      <Text
        style={{
          color: theme.mutedText,
          fontSize: 11,
          fontWeight: '800',
          marginBottom: 6,
        }}
      >
        {label}
      </Text>

      <TextInput
        placeholder={placeholder}
        placeholderTextColor={theme.mutedText}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        style={{
          backgroundColor: theme.surfaceMuted,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.border,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 11 : 10,
          minHeight: multiline ? 96 : 42,
          textAlignVertical: multiline ? 'top' : 'center',
          color: theme.text,
          fontSize: 13,
        }}
      />
    </View>
  )
}

function OptionField({ label, value, onChange, options, theme }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          color: theme.mutedText,
          fontSize: 11,
          fontWeight: '800',
          marginBottom: 6,
        }}
      >
        {label}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const selected = value === option.value

          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onChange(option.value)}
              activeOpacity={0.86}
              style={{
                minHeight: 38,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? theme.accent : theme.border,
                backgroundColor: selected ? theme.accentSoft : theme.surface,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 12,
                paddingVertical: 8,
                minWidth: 96,
              }}
            >
              <Text
                style={{
                  color: selected ? theme.accent : theme.text,
                  fontSize: 11,
                  fontWeight: '900',
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function BooleanField({
  label,
  value,
  onChange,
  trueLabel = 'Yes',
  falseLabel = 'No',
  theme,
}) {
  return (
    <OptionField
      label={label}
      value={value ? 'yes' : 'no'}
      onChange={(nextValue) => onChange(nextValue === 'yes')}
      theme={theme}
      options={[
        { value: 'no', label: falseLabel },
        { value: 'yes', label: trueLabel },
      ]}
    />
  )
}

const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CALENDAR_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function formatDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateValue(value) {
  if (!value) return null

  const parts = String(value).split('-').map((part) => Number(part))
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null

  const [year, month, day] = parts
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }

  return date
}

function buildCalendarDays(monthDate) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const firstWeekday = firstDay.getDay()
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const cells = []

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

function CalendarField({ label, value, helperText, onPress, theme }) {
  return (
    <View style={{ marginBottom: 11 }}>
      <Text
        style={{
          color: theme.mutedText,
          fontSize: 11,
          fontWeight: '800',
          marginBottom: 6,
        }}
      >
        {label}
      </Text>

      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.88}
        style={{
          backgroundColor: theme.surfaceMuted,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.border,
          paddingHorizontal: 12,
          minHeight: 42,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: value ? theme.text : theme.mutedText, fontSize: 13 }}>
          {value || helperText}
        </Text>
        <Ionicons name="calendar-outline" size={16} color={theme.accent} />
      </TouchableOpacity>
    </View>
  )
}

function CalendarModal({
  visible,
  value,
  onClose,
  onSelect,
  theme,
}) {
  const initialDate = parseDateValue(value) || new Date()
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  )

  useEffect(() => {
    if (visible) {
      const nextDate = parseDateValue(value) || new Date()
      setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1))
    }
  }, [value, visible])

  const selectedDate = parseDateValue(value)
  const calendarDays = buildCalendarDays(visibleMonth)

  function moveMonth(offset) {
    setVisibleMonth((currentMonth) => (
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1)
    ))
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.34)',
          justifyContent: 'center',
          paddingHorizontal: 20,
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: theme.surface,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity
              onPress={() => moveMonth(-1)}
              activeOpacity={0.86}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: theme.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="chevron-back" size={18} color={theme.accent} />
            </TouchableOpacity>

            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900' }}>
              {CALENDAR_MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
            </Text>

            <TouchableOpacity
              onPress={() => moveMonth(1)}
              activeOpacity={0.86}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: theme.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="chevron-forward" size={18} color={theme.accent} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            {CALENDAR_WEEKDAYS.map((day) => (
              <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: theme.mutedText, fontSize: 10, fontWeight: '800' }}>{day}</Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 10, gap: 8 }}>
            {Array.from({ length: calendarDays.length / 7 }).map((_, rowIndex) => (
              <View key={`row-${rowIndex}`} style={{ flexDirection: 'row' }}>
                {calendarDays.slice(rowIndex * 7, rowIndex * 7 + 7).map((date, columnIndex) => {
                  const dateKey = date ? formatDateValue(date) : `blank-${rowIndex}-${columnIndex}`
                  const isSelected = date && selectedDate && formatDateValue(date) === formatDateValue(selectedDate)
                  const isToday = date && formatDateValue(date) === formatDateValue(new Date())

                  return (
                    <View key={dateKey} style={{ flex: 1, alignItems: 'center' }}>
                      {date ? (
                        <TouchableOpacity
                          onPress={() => {
                            onSelect(formatDateValue(date))
                            onClose()
                          }}
                          activeOpacity={0.88}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isSelected ? theme.accent : isToday ? theme.accentSoft : 'transparent',
                            borderWidth: isToday && !isSelected ? 1 : 0,
                            borderColor: isToday ? theme.accent : 'transparent',
                          }}
                        >
                          <Text
                            style={{
                              color: isSelected ? '#fff' : theme.text,
                              fontSize: 12,
                              fontWeight: isSelected ? '900' : '700',
                            }}
                          >
                            {date.getDate()}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{ width: 34, height: 34 }} />
                      )}
                    </View>
                  )
                })}
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                onSelect(formatDateValue(new Date()))
                onClose()
              }}
              activeOpacity={0.86}
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 13,
                backgroundColor: theme.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '900' }}>Today</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.86}
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 13,
                backgroundColor: theme.surfaceMuted,
                borderWidth: 1,
                borderColor: theme.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.text, fontSize: 11, fontWeight: '900' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function MediaTile({ item, index, selected, onPress, onRemove, theme }) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={{
        marginRight: 12,
        position: 'relative',
      }}
    >
      {item.type === 'video' ? (
        <View
          style={{
            width: 78,
            height: 78,
            borderRadius: 14,
            overflow: 'hidden',
            backgroundColor: '#0f172a',
            borderWidth: selected ? 2 : 1,
            borderColor: selected ? theme.accent : theme.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="videocam" size={22} color="#fff" />
          <Text
            style={{
              color: theme.mutedText,
              fontSize: 10,
              fontWeight: '800',
              marginTop: 4,
            }}
          >
            Video
          </Text>
        </View>
      ) : (
        <Image
          source={{ uri: item.uri }}
          style={{
            width: 78,
            height: 78,
            borderRadius: 14,
            backgroundColor: theme.surfaceMuted,
            borderWidth: selected ? 2 : 1,
            borderColor: selected ? theme.accent : theme.border,
          }}
        />
      )}

      <TouchableOpacity
        onPress={() => onRemove(index)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: 'rgba(15, 23, 42, 0.78)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="close" size={14} color="#fff" />
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

function isRemoteUri(uri) {
  return /^https?:\/\//i.test(uri || '')
}

export default function CreatePostScreen({ navigation, route }) {
  const { theme } = useAppSettings()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [beds, setBeds] = useState('')
  const [baths, setBaths] = useState('')
  const [sizeSqft, setSizeSqft] = useState('')
  const [floorNo, setFloorNo] = useState('')
  const [furnishingStatus, setFurnishingStatus] = useState('unfurnished')
  const [tenantType, setTenantType] = useState('family')
  const [parking, setParking] = useState(false)
  const [liftAvailable, setLiftAvailable] = useState(false)
  const [generatorBackup, setGeneratorBackup] = useState(false)
  const [gasAvailable, setGasAvailable] = useState(false)
  const [petFriendly, setPetFriendly] = useState(false)
  const [availableFrom, setAvailableFrom] = useState('')
  const [facingDirection, setFacingDirection] = useState('')
  const [hasBalcony, setHasBalcony] = useState(false)
  const [serviceChargeIncluded, setServiceChargeIncluded] = useState(false)
  const [availableFromPickerVisible, setAvailableFromPickerVisible] = useState(false)
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const [media, setMedia] = useState([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [composerUser, setComposerUser] = useState(null)
  const [composerProfile, setComposerProfile] = useState(null)
  const [selectedLocationMeta, setSelectedLocationMeta] = useState(null)
  const editingPost = route?.params?.post || null
  const isEditing = Boolean(editingPost?.id)
  const adminEditMode = Boolean(route?.params?.adminEditMode)

  useEffect(() => {
    loadComposer()
  }, [])

  useEffect(() => {
    if (!editingPost) return

    setTitle(editingPost.title || '')
    setDescription(editingPost.description || '')
    setPrice(editingPost.price ? String(editingPost.price) : '')
    setBeds(editingPost.beds ? String(editingPost.beds) : '')
    setBaths(editingPost.baths ? String(editingPost.baths) : '')
    setSizeSqft(editingPost.size_sqft ? String(editingPost.size_sqft) : '')
    setFloorNo(editingPost.floor_no ? String(editingPost.floor_no) : '')
    setFurnishingStatus(editingPost.furnishing_status || 'unfurnished')
    setTenantType(editingPost.tenant_type || 'family')
    setParking(Boolean(editingPost.parking))
    setLiftAvailable(Boolean(editingPost.lift_available))
    setGeneratorBackup(Boolean(editingPost.generator_backup))
    setGasAvailable(Boolean(editingPost.gas_available))
    setPetFriendly(Boolean(editingPost.pet_friendly))
    setAvailableFrom(editingPost.available_from || '')
    setFacingDirection(editingPost.facing_direction || '')
    setHasBalcony(Boolean(editingPost.has_balcony))
    setServiceChargeIncluded(Boolean(editingPost.service_charge_included))
    setLocation(editingPost.location || '')
    setSelectedLocationMeta(
      editingPost.location
        ? {
            areaLabel: editingPost.location,
            fullLabel: editingPost.location,
          }
        : null
    )

    const existingMedia = normalizeMediaList(
      editingPost.media?.length ? editingPost.media : editingPost.image_url ? [editingPost.image_url] : []
    ).map((item) => ({
      ...item,
      existing: true,
    }))

    setMedia(existingMedia)
    setPreviewIndex(0)
  }, [editingPost])

  useEffect(() => {
    const selectedLocation = route?.params?.selectedLocation
    const requestId = route?.params?.selectedLocationRequestId

    if (!selectedLocation || !requestId) return

    setLocation(selectedLocation.areaLabel || selectedLocation.label || '')
    setSelectedLocationMeta(selectedLocation)
    navigation.setParams({
      selectedLocation: undefined,
      selectedLocationRequestId: undefined,
    })
  }, [navigation, route?.params?.selectedLocation, route?.params?.selectedLocationRequestId])

  async function loadComposer() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    setComposerUser(user || null)

    if (!user?.id) {
      setComposerProfile(null)
      return
    }

    try {
      const syncedProfile = await ensureUserProfileRecord(user)
      setComposerProfile(syncedProfile || null)
    } catch (_error) {
      const { data } = await supabase
        .from('user_profiles')
        .select('user_id, email, display_name, avatar_url, is_verified, user_type')
        .eq('user_id', user.id)
        .maybeSingle()

      setComposerProfile(data || null)
    }
  }

  async function pickMedia() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow gallery access')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.7,
    })

    if (!result.canceled) {
      const selected = result.assets.map((asset) => ({
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'image',
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      }))

      setMedia((currentMedia) => {
        const nextMedia = [...currentMedia, ...selected]
        if (!currentMedia.length && nextMedia.length) {
          setPreviewIndex(0)
        }
        return nextMedia
      })
    }
  }

  function removeMedia(index) {
    setMedia((currentMedia) => {
      const nextMedia = currentMedia.filter((_, currentIndex) => currentIndex !== index)

      setPreviewIndex((currentPreviewIndex) => {
        if (!nextMedia.length) return 0
        if (currentPreviewIndex > index) return currentPreviewIndex - 1
        if (currentPreviewIndex === index) {
          return Math.min(index, nextMedia.length - 1)
        }
        return currentPreviewIndex
      })

      return nextMedia
    })
  }

  async function savePost() {
    if (!title || !price || !beds || !baths || !sizeSqft || !availableFrom) {
      Alert.alert(
        'Required',
        'Please enter title, rent, bedrooms, bathrooms, size, and available from date.'
      )
      return
    }

    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      Alert.alert('Login required', 'Please log in again before posting.')
      return
    }

    try {
      await ensureUserProfileRecord(user)
    } catch (_error) {
      // Posting can still continue if profile sync is temporarily unavailable.
    }

    let uploadedMedia = []

    try {
      uploadedMedia = await Promise.all(
        media.map(async (item) => {
          if (isRemoteUri(item.uri)) {
            return {
              uri: item.uri,
              type: item.type,
              mimeType: item.mimeType || null,
            }
          }

          const uploadResult = await uploadMediaAsset({
            uri: item.uri,
            type: item.type,
            mimeType: item.mimeType,
            userId: user.id,
            bucket: PROPERTY_MEDIA_BUCKET,
          })

          return {
            uri: uploadResult.mediaUrl,
            type: item.type,
            mimeType: uploadResult.mediaMimeType,
          }
        })
      )
    } catch (error) {
      setLoading(false)
      const rawMessage = String(error?.message || '').trim()
      const detailMessage = rawMessage
        ? rawMessage
        : 'Please make sure the property-media bucket and storage policies are up to date.'
      Alert.alert(
        'Media upload failed',
        detailMessage
      )
      return
    }

    const ownerName =
      composerProfile?.display_name ||
      user.user_metadata?.name ||
      getUserDisplayName(user) ||
      user.email

    const ownerId = adminEditMode && editingPost?.owner_id ? editingPost.owner_id : user.id
    const ownerEmail = adminEditMode && editingPost?.owner_email ? editingPost.owner_email : user.email
    const ownerNameToSave = adminEditMode && editingPost?.owner_name ? editingPost.owner_name : ownerName

    const payload = {
      title,
      description,
      price,
      beds: beds ? Number(beds) : null,
      baths: baths ? Number(baths) : null,
      size_sqft: sizeSqft ? Number(sizeSqft) : null,
      floor_no: floorNo ? Number(floorNo) : null,
      furnishing_status: furnishingStatus || null,
      tenant_type: tenantType || null,
      parking,
      lift_available: liftAvailable,
      generator_backup: generatorBackup,
      gas_available: gasAvailable,
      pet_friendly: petFriendly,
      available_from: availableFrom || null,
      facing_direction: facingDirection.trim() || null,
      has_balcony: hasBalcony,
      service_charge_included: serviceChargeIncluded,
      location,
      owner_id: ownerId,
      owner_email: ownerEmail,
      owner_name: ownerNameToSave,
      image_url: uploadedMedia[0]?.uri || null,
      media: uploadedMedia,
    }

    const canAdminEdit = adminEditMode && isPrimaryAdmin(user)
    const query = isEditing
      ? canAdminEdit
        ? supabase.from('properties').update(payload).eq('id', editingPost.id)
        : supabase.from('properties').update(payload).eq('id', editingPost.id).eq('owner_id', user.id)
      : supabase.from('properties').insert(payload).select('*').single()

    const { data: savedPost, error } = await query

    setLoading(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    Alert.alert('Success', isEditing ? 'Property post updated' : 'Property post created')

    if (!isEditing && savedPost) {
      try {
        await notifySavedSearchMatchesForProperty({
          property: savedPost,
          ownerProfile: composerProfile || null,
        })
      } catch (_error) {
        // The post is already created. Saved-alert notification retries can stay soft.
      }
    }

    if (isEditing) {
      if (adminEditMode) {
        navigation.navigate('AdminUserPosts', {
          userId: editingPost?.owner_id,
          ownerName: editingPost?.owner_name || editingPost?.owner_email || 'User posts',
        })
        return
      }
      navigation.navigate('AdsManagement')
      return
    }

    navigation.navigate('MainTabs', {
      screen: 'Home',
      params: {
        refreshFeedAt: Date.now(),
      },
    })
  }

  const previewItem = media[previewIndex] || null
  const composerName = useMemo(
    () =>
      composerProfile?.display_name ||
      getUserDisplayName(composerUser) ||
      'Property owner',
    [composerProfile, composerUser]
  )
  const composerSubtitle = composerProfile?.user_type === 'property_owner'
    ? 'Posting as property owner'
    : 'Create a rental post'
  const locationHelperText =
    selectedLocationMeta?.fullLabel && selectedLocationMeta.fullLabel !== location
      ? selectedLocationMeta.fullLabel
      : 'Use area-based location so renters understand the property quickly.'

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 20,
            padding: 14,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <Avatar
              profile={composerProfile}
              name={composerName}
              uri={composerProfile?.avatar_url || getUserAvatarUrl(composerUser)}
              size={52}
            />

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900' }}>
                {composerName}
              </Text>
              <Text style={{ color: theme.mutedText, marginTop: 3, fontSize: 12 }}>
                {composerSubtitle}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: theme.accentSoft,
              }}
            >
              <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '800' }}>
                {isEditing ? 'Editing' : 'New post'}
              </Text>
            </View>
          </View>

          <Field
            theme={theme}
            label="Property title"
            placeholder="2 bedroom apartment near Bashundhara"
            value={title}
            onChangeText={setTitle}
          />

          <Field
            theme={theme}
            label="Description"
            placeholder="Tell renters about the rooms, washroom, security, nearby transport, and anything helpful."
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Field
            theme={theme}
            label="Monthly rent"
            placeholder="25000"
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                theme={theme}
                label="Bedrooms"
                placeholder="2"
                value={beds}
                onChangeText={setBeds}
                keyboardType="numeric"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Field
                theme={theme}
                label="Bathrooms"
                placeholder="1"
                value={baths}
                onChangeText={setBaths}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 0 }}>
            <View style={{ flex: 1 }}>
              <Field
                theme={theme}
                label="Size (sq ft)"
                placeholder="1200"
                value={sizeSqft}
                onChangeText={setSizeSqft}
                keyboardType="numeric"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Field
                theme={theme}
                label="Floor"
                placeholder="3"
                value={floorNo}
                onChangeText={setFloorNo}
                keyboardType="numeric"
              />
            </View>
          </View>

          <CalendarField
            theme={theme}
            label="Available from"
            value={availableFrom}
            helperText="Choose move-in date"
            onPress={() => setAvailableFromPickerVisible(true)}
          />

          <Field
            theme={theme}
            label="Facing direction"
            placeholder="South facing"
            value={facingDirection}
            onChangeText={setFacingDirection}
          />

          <OptionField
            theme={theme}
            label="Furnishing"
            value={furnishingStatus}
            onChange={setFurnishingStatus}
            options={[
              { value: 'unfurnished', label: 'Unfurnished' },
              { value: 'furnished', label: 'Furnished' },
            ]}
          />

          <OptionField
            theme={theme}
            label="Preferred tenant"
            value={tenantType}
            onChange={setTenantType}
            options={[
              { value: 'family', label: 'Family' },
              { value: 'bachelor', label: 'Bachelor' },
              { value: 'any', label: 'Both okay' },
            ]}
          />

          <BooleanField
            theme={theme}
            label="Parking"
            value={parking}
            onChange={setParking}
            trueLabel="Parking available"
            falseLabel="No parking"
          />

          <BooleanField
            theme={theme}
            label="Lift"
            value={liftAvailable}
            onChange={setLiftAvailable}
            trueLabel="Lift available"
            falseLabel="No lift"
          />

          <BooleanField
            theme={theme}
            label="Generator backup"
            value={generatorBackup}
            onChange={setGeneratorBackup}
            trueLabel="Generator available"
            falseLabel="No generator"
          />

          <BooleanField
            theme={theme}
            label="Gas"
            value={gasAvailable}
            onChange={setGasAvailable}
            trueLabel="Gas available"
            falseLabel="No gas"
          />

          <BooleanField
            theme={theme}
            label="Balcony"
            value={hasBalcony}
            onChange={setHasBalcony}
            trueLabel="Has balcony"
            falseLabel="No balcony"
          />

          <BooleanField
            theme={theme}
            label="Service charge"
            value={serviceChargeIncluded}
            onChange={setServiceChargeIncluded}
            trueLabel="Included"
            falseLabel="Separate"
          />

          <BooleanField
            theme={theme}
            label="Pets"
            value={petFriendly}
            onChange={setPetFriendly}
            trueLabel="Pet friendly"
            falseLabel="Not pet friendly"
          />

          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                color: theme.mutedText,
                fontSize: 11,
                fontWeight: '800',
                marginBottom: 6,
              }}
            >
              Location
            </Text>

            <View
              style={{
                backgroundColor: theme.surfaceMuted,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  placeholder="Dhaka, Bashundhara R/A"
                  placeholderTextColor={theme.mutedText}
                  value={location}
                  onChangeText={(value) => {
                    setLocation(value)
                    setSelectedLocationMeta((current) =>
                      current
                        ? {
                            ...current,
                            areaLabel: value,
                            label: value,
                          }
                        : null
                    )
                  }}
                  style={{
                    flex: 1,
                    color: theme.text,
                    fontSize: 13,
                    minHeight: 22,
                    paddingVertical: 4,
                  }}
                />

                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('Location', {
                      returnScreen: 'CreatePost',
                      returnKey: route?.key,
                      returnParams: isEditing && editingPost ? { post: editingPost } : {},
                      initialLabel: selectedLocationMeta?.fullLabel || location,
                      initialLocation: selectedLocationMeta || null,
                    })
                  }
                  activeOpacity={0.88}
                  style={{
                    marginLeft: 10,
                    height: 34,
                    paddingHorizontal: 10,
                    borderRadius: 12,
                    backgroundColor: theme.accentSoft,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="map-outline" size={14} color={theme.accent} />
                  <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '900', marginLeft: 5 }}>
                    Pick map
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={{ color: theme.mutedText, fontSize: 10, marginTop: 7, lineHeight: 14 }}>
                {locationHelperText}
              </Text>
            </View>
          </View>

          <View
            style={{
              backgroundColor: theme.surfaceMuted,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 12,
              marginBottom: 14,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: media.length ? 12 : 0,
              }}
            >
              <View>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                  Photos and videos
                </Text>
                <Text style={{ color: theme.mutedText, marginTop: 3, fontSize: 11, lineHeight: 16 }}>
                  Add clear media so renters can understand the property fast.
                </Text>
              </View>

              <TouchableOpacity
                onPress={pickMedia}
                activeOpacity={0.86}
                style={{
                  backgroundColor: '#1877F2',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="images-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', marginLeft: 5, fontSize: 11 }}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>

            {previewItem ? (
              <>
                <View
                  style={{
                    height: 176,
                    borderRadius: 16,
                    overflow: 'hidden',
                    backgroundColor: theme.accentSoft,
                    marginBottom: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {previewItem.type === 'video' ? (
                    <View
                      style={{
                        flex: 1,
                        width: '100%',
                        backgroundColor: '#0f172a',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="play-circle" size={44} color="#fff" />
                      <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12, marginTop: 8 }}>
                        Video ready to upload
                      </Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: previewItem.uri }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  )}

                  <View
                    style={{
                      position: 'absolute',
                      left: 10,
                      bottom: 10,
                      backgroundColor: 'rgba(15, 23, 42, 0.72)',
                      borderRadius: 999,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>
                      {media.length} {media.length === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {media.map((item, index) => (
                    <MediaTile
                      key={`${item.uri}-${index}`}
                      item={item}
                      index={index}
                      selected={previewIndex === index}
                      theme={theme}
                      onPress={() => setPreviewIndex(index)}
                      onRemove={removeMedia}
                    />
                  ))}
                </ScrollView>
              </>
            ) : (
              <TouchableOpacity
                onPress={pickMedia}
                activeOpacity={0.88}
                style={{
                  borderWidth: 1.5,
                  borderColor: theme.border,
                  borderStyle: 'dashed',
                  borderRadius: 16,
                  paddingVertical: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: theme.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Ionicons name="camera-outline" size={20} color={theme.accent} />
                </View>

                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                  Add property media
                </Text>
                <Text style={{ color: theme.mutedText, marginTop: 5, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
                  Photos, room videos, washroom, balcony, parking, or surroundings.
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={savePost}
            disabled={loading}
            activeOpacity={0.9}
            style={{
              backgroundColor: loading ? '#94a3b8' : '#1877F2',
              borderRadius: 14,
              paddingVertical: 13,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="send" size={16} color="#fff" />
            <Text
              style={{
                color: '#fff',
                fontWeight: '900',
                fontSize: 14,
                marginLeft: 7,
              }}
            >
              {loading
                ? isEditing
                  ? 'Updating property...'
                  : 'Posting property...'
                : isEditing
                  ? 'Update Property'
                  : 'Post Property'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CalendarModal
        theme={theme}
        visible={availableFromPickerVisible}
        value={availableFrom}
        onClose={() => setAvailableFromPickerVisible(false)}
        onSelect={setAvailableFrom}
      />
    </KeyboardAvoidingView>
  )
}
