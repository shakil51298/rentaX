import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { supabase } from '../lib/supabase'
import { getPrimaryAdminUserIds } from '../lib/admin'
import { createNotification } from '../lib/notifications'
import {
  createSignedMediaUrl,
  getPrivateMediaPath,
  uploadPrivateMediaAsset,
  VERIFICATION_MEDIA_BUCKET,
} from '../lib/media'
import { getPropertyVerificationStatus, getVerificationMeta } from '../lib/verification'

const ID_TYPES = [
  { id: 'national_id', label: 'National ID' },
  { id: 'passport', label: 'Passport' },
  { id: 'driving_license', label: 'Driving License' },
]

const SELFIE_STEPS = [
  {
    title: 'Center your face',
    subtitle: 'Keep your full face inside the frame.',
  },
  {
    title: 'Give a light smile',
    subtitle: 'A natural smile helps manual review.',
  },
  {
    title: 'Nod your head slowly',
    subtitle: 'Move a little so the guided selfie feels live.',
  },
]

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  maxLength,
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: '#334155', fontSize: 13, fontWeight: '800', marginBottom: 8 }}>
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        style={{
          backgroundColor: '#f8fafc',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#e2e8f0',
          paddingHorizontal: 14,
          paddingVertical: 14,
          minHeight: multiline ? 96 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          color: '#0f172a',
        }}
      />
    </View>
  )
}

function StatusChip({ meta }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: meta.backgroundColor,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: meta.borderColor,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Ionicons name={meta.icon} size={14} color={meta.textColor} />
      <Text style={{ color: meta.textColor, fontWeight: '800', fontSize: 12, marginLeft: 6 }}>
        {meta.label}
      </Text>
    </View>
  )
}

function RequirementRow({ icon, title, done, subtitle }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: done ? '#ecfdf5' : '#f8fafc',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Ionicons name={done ? 'checkmark' : icon} size={16} color={done ? '#059669' : '#64748b'} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 14 }}>{title}</Text>
        <Text style={{ color: '#64748b', marginTop: 3, lineHeight: 18 }}>{subtitle}</Text>
      </View>
    </View>
  )
}

function DocumentUploadCard({
  title,
  subtitle,
  asset,
  onChooseGallery,
  onTakePhoto,
  onRemove,
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#fff',
        padding: 14,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 15 }}>{title}</Text>
      <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 18 }}>{subtitle}</Text>

      <View
        style={{
          marginTop: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#dbe4ee',
          backgroundColor: '#f8fafc',
          overflow: 'hidden',
          minHeight: 160,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {asset?.uri ? (
          <Image
            source={{ uri: asset.uri }}
            style={{ width: '100%', height: 180, backgroundColor: '#e2e8f0' }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ alignItems: 'center', paddingHorizontal: 18, paddingVertical: 26 }}>
            <Ionicons name="image-outline" size={30} color="#94a3b8" />
            <Text style={{ color: '#64748b', marginTop: 8, textAlign: 'center' }}>
              Upload a clear photo. Keep all corners visible.
            </Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', marginTop: 12, gap: 10 }}>
        <TouchableOpacity
          onPress={onTakePhoto}
          style={{
            flex: 1,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#bfdbfe',
            backgroundColor: '#eff6ff',
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#2563eb', fontWeight: '900' }}>Take photo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onChooseGallery}
          style={{
            flex: 1,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            backgroundColor: '#fff',
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#334155', fontWeight: '900' }}>Upload photo</Text>
        </TouchableOpacity>
      </View>

      {asset?.uri ? (
        <TouchableOpacity
          onPress={onRemove}
          style={{
            marginTop: 10,
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="trash-outline" size={14} color="#dc2626" />
          <Text style={{ color: '#dc2626', fontWeight: '800', marginLeft: 6 }}>Remove</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function SelfieCard({ asset, onOpenCamera, onRemove }) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#fff',
        padding: 14,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 15 }}>
        Guided selfie capture
      </Text>
      <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 18 }}>
        Open the front camera, follow the scan guide, smile, then nod slightly before capture.
      </Text>

      <View
        style={{
          marginTop: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#dbe4ee',
          backgroundColor: '#0f172a',
          overflow: 'hidden',
          minHeight: 200,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {asset?.uri ? (
          <Image
            source={{ uri: asset.uri }}
            style={{ width: '100%', height: 220 }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ alignItems: 'center', paddingHorizontal: 18, paddingVertical: 26 }}>
            <Ionicons name="scan-outline" size={34} color="#cbd5e1" />
            <Text style={{ color: '#cbd5e1', marginTop: 10, textAlign: 'center' }}>
              No guided selfie captured yet.
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={onOpenCamera}
        style={{
          marginTop: 12,
          borderRadius: 12,
          backgroundColor: '#1877F2',
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '900' }}>
          {asset?.uri ? 'Retake guided selfie' : 'Start guided selfie'}
        </Text>
      </TouchableOpacity>

      {asset?.uri ? (
        <TouchableOpacity
          onPress={onRemove}
          style={{
            marginTop: 10,
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="trash-outline" size={14} color="#dc2626" />
          <Text style={{ color: '#dc2626', fontWeight: '800', marginLeft: 6 }}>Remove</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function ListingRow({ item, onRequest, busy }) {
  const verificationMeta = getVerificationMeta(getPropertyVerificationStatus(item), {
    verifiedLabel: 'Verified property',
    pendingLabel: 'Verification pending',
    rejectedLabel: 'Update and resend',
    defaultLabel: 'Not verified',
  })

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 14,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 15 }}>
            {item.title || 'Untitled property'}
          </Text>
          <Text style={{ color: '#64748b', marginTop: 4 }}>
            {item.location || 'Location not added'}
          </Text>
        </View>

        <Text style={{ color: '#ea580c', fontWeight: '900', fontSize: 14 }}>
          {item.price ? `৳ ${item.price}` : 'No rent'}
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <StatusChip meta={verificationMeta} />
      </View>

      <TouchableOpacity
        onPress={() => onRequest(item)}
        disabled={busy || getPropertyVerificationStatus(item) === 'verified'}
        style={{
          marginTop: 12,
          borderRadius: 14,
          paddingVertical: 12,
          alignItems: 'center',
          backgroundColor:
            getPropertyVerificationStatus(item) === 'verified'
              ? '#e2e8f0'
              : busy
                ? '#8bbcf7'
                : '#1877F2',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '900' }}>
          {getPropertyVerificationStatus(item) === 'verified'
            ? 'Verified already'
            : getPropertyVerificationStatus(item) === 'pending'
              ? 'Update verification request'
              : 'Request property verification'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

function MiniStepBadge({ item, width }) {
  return (
    <View
      style={{
        width,
        minHeight: 76,
        backgroundColor: '#fff',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: item.done ? '#bfdbfe' : '#e2e8f0',
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginRight: 10,
        justifyContent: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: item.done ? '#dbeafe' : '#f1f5f9',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
          }}
        >
          <Ionicons
            name={item.done ? 'checkmark' : item.icon}
            size={12}
            color={item.done ? '#2563eb' : '#64748b'}
          />
        </View>
        <Text
          numberOfLines={1}
          style={{ flex: 1, color: '#0f172a', fontSize: 12, fontWeight: '900' }}
        >
          {item.title}
        </Text>
      </View>

      <Text
        numberOfLines={2}
        style={{
          color: item.done ? '#2563eb' : '#64748b',
          fontSize: 11,
          fontWeight: '700',
          marginTop: 8,
          lineHeight: 15,
        }}
      >
        {item.caption}
      </Text>
    </View>
  )
}

function CollapsibleHeader({ title, subtitle, expanded, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900' }}>
          {title}
        </Text>
        <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 20 }}>
          {subtitle}
        </Text>
      </View>

      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={20}
        color="#334155"
      />
    </TouchableOpacity>
  )
}

function makeAssetFromSignedUrl(signedUrl, storagePath) {
  if (!signedUrl || !storagePath) return null

  return {
    uri: signedUrl,
    storagePath,
    type: 'image',
    mimeType: 'image/jpeg',
    existing: true,
  }
}

async function pickPhotoFromSource(source) {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync()

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to capture the document photo.')
      return null
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    })

    if (result.canceled || !result.assets?.length) return null

    const asset = result.assets[0]

    return {
      uri: asset.uri,
      type: 'image',
      mimeType: asset.mimeType,
      fileName: asset.fileName,
    }
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()

  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow gallery access to upload a document photo.')
    return null
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.8,
  })

  if (result.canceled || !result.assets?.length) return null

  const asset = result.assets[0]

  return {
    uri: asset.uri,
    type: 'image',
    mimeType: asset.mimeType,
    fileName: asset.fileName,
  }
}

async function ensurePrivateUpload(asset, userId) {
  if (!asset?.uri) return null

  const existingPath = getPrivateMediaPath(asset)

  if (existingPath) {
    return existingPath
  }

  const { storagePath } = await uploadPrivateMediaAsset({
    uri: asset.uri,
    type: 'image',
    mimeType: asset.mimeType,
    userId,
    bucket: VERIFICATION_MEDIA_BUCKET,
  })

  return storagePath
}

export default function VerificationCenterScreen() {
  const { width: windowWidth } = useWindowDimensions()
  const [loading, setLoading] = useState(true)
  const [savingOwner, setSavingOwner] = useState(false)
  const [busyPropertyId, setBusyPropertyId] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [phone, setPhone] = useState('')
  const [idType, setIdType] = useState('national_id')
  const [idLast4, setIdLast4] = useState('')
  const [verificationNote, setVerificationNote] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [documentFront, setDocumentFront] = useState(null)
  const [documentBack, setDocumentBack] = useState(null)
  const [selfieAsset, setSelfieAsset] = useState(null)
  const [selfieModalVisible, setSelfieModalVisible] = useState(false)
  const [scanStepIndex, setScanStepIndex] = useState(0)
  const [captureEnabled, setCaptureEnabled] = useState(false)
  const [capturingSelfie, setCapturingSelfie] = useState(false)
  const [verifiedPropertiesExpanded, setVerifiedPropertiesExpanded] = useState(false)
  const [ownerVerificationExpanded, setOwnerVerificationExpanded] = useState(false)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const cameraRef = useRef(null)
  const scanLine = useRef(new Animated.Value(0)).current
  const stepsScrollRef = useRef(null)
  const currentStepIndexRef = useRef(0)

  const loadData = useCallback(async () => {
    setLoading(true)

    const {
      data: { user: nextUser },
    } = await supabase.auth.getUser()

    setUser(nextUser || null)

    if (!nextUser?.id) {
      setProfile(null)
      setPosts([])
      setDocumentFront(null)
      setDocumentBack(null)
      setSelfieAsset(null)
      setLoading(false)
      return
    }

    const [{ data: nextProfile }, { data: nextPosts }] = await Promise.all([
      supabase
        .from('user_profiles')
        .select(`
          user_id,
          user_type,
          phone,
          is_verified,
          owner_verification_status,
          owner_verification_requested_at,
          owner_verification_note,
          owner_verification_rejection_reason,
          owner_verification_phone,
          owner_verification_id_type,
          owner_verification_id_last4,
          owner_verification_document_front_path,
          owner_verification_document_back_path,
          owner_verification_selfie_path,
          owner_verification_attempt_count,
          owner_verification_attempt_day
        `)
        .eq('user_id', nextUser.id)
        .maybeSingle(),
      supabase
        .from('properties')
        .select('id, title, location, price, verification_status, verification_requested_at, status')
        .eq('owner_id', nextUser.id)
        .order('created_at', { ascending: false }),
    ])

    setProfile(nextProfile || null)
    setPosts(nextPosts || [])
    setPhone(nextProfile?.owner_verification_phone || nextProfile?.phone || '')
    setIdType(nextProfile?.owner_verification_id_type || 'national_id')
    setIdLast4(nextProfile?.owner_verification_id_last4 || '')
    setVerificationNote(nextProfile?.owner_verification_note || '')
    setRejectionReason(nextProfile?.owner_verification_rejection_reason || '')

    try {
      const [frontUrl, backUrl, selfieUrl] = await Promise.all([
        nextProfile?.owner_verification_document_front_path
          ? createSignedMediaUrl(VERIFICATION_MEDIA_BUCKET, nextProfile.owner_verification_document_front_path)
          : Promise.resolve(null),
        nextProfile?.owner_verification_document_back_path
          ? createSignedMediaUrl(VERIFICATION_MEDIA_BUCKET, nextProfile.owner_verification_document_back_path)
          : Promise.resolve(null),
        nextProfile?.owner_verification_selfie_path
          ? createSignedMediaUrl(VERIFICATION_MEDIA_BUCKET, nextProfile.owner_verification_selfie_path)
          : Promise.resolve(null),
      ])

      setDocumentFront(
        makeAssetFromSignedUrl(frontUrl, nextProfile?.owner_verification_document_front_path)
      )
      setDocumentBack(
        makeAssetFromSignedUrl(backUrl, nextProfile?.owner_verification_document_back_path)
      )
      setSelfieAsset(
        makeAssetFromSignedUrl(selfieUrl, nextProfile?.owner_verification_selfie_path)
      )
    } catch (_error) {
      setDocumentFront(null)
      setDocumentBack(null)
      setSelfieAsset(null)
    }

    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
  )

  useEffect(() => {
    if (!user?.id) return undefined

    const profileChannel = supabase
      .channel(`verification-profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_profiles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadData()
        }
      )
      .subscribe()

    const propertyChannel = supabase
      .channel(`verification-properties-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'properties',
          filter: `owner_id=eq.${user.id}`,
        },
        () => {
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(profileChannel)
      supabase.removeChannel(propertyChannel)
    }
  }, [loadData, user?.id])

  useEffect(() => {
    if (!selfieModalVisible) return undefined

    setScanStepIndex(0)
    setCaptureEnabled(false)

    const stepTimer = setInterval(() => {
      setScanStepIndex((current) => {
        if (current >= SELFIE_STEPS.length - 1) {
          clearInterval(stepTimer)
          setCaptureEnabled(true)
          return current
        }

        return current + 1
      })
    }, 1700)

    scanLine.setValue(0)
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scanLine, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    )

    animation.start()

    return () => {
      clearInterval(stepTimer)
      animation.stop()
      scanLine.stopAnimation()
    }
  }, [scanLine, selfieModalVisible])

  const isOwner = profile?.user_type === 'property_owner' || user?.user_metadata?.user_type === 'property_owner'
  const ownerStatus = profile?.owner_verification_status || (profile?.is_verified ? 'verified' : 'unverified')
  const ownerStatusMeta = getVerificationMeta(ownerStatus, {
    verifiedLabel: 'Verified owner',
    pendingLabel: 'Owner verification pending',
    rejectedLabel: 'Update and resend',
    defaultLabel: 'Not verified yet',
  })
  const emailConfirmed = Boolean(user?.email_confirmed_at)
  const hasPhone = Boolean(phone.trim())
  const hasIdDigits = Boolean(idLast4.trim() && idType)
  const hasFrontDoc = Boolean(documentFront?.uri)
  const hasBackDoc = Boolean(documentBack?.uri)
  const hasSelfie = Boolean(selfieAsset?.uri)
  const miniCardWidth = Math.min(Math.max(windowWidth * 0.44, 150), 190)
  const activePropertyRequests = posts.filter((item) => getPropertyVerificationStatus(item) !== 'verified')
  const verifiedProperties = posts.filter((item) => getPropertyVerificationStatus(item) === 'verified')
  const attemptCountToday = profile?.owner_verification_attempt_day === new Date().toISOString().slice(0, 10)
    ? Number(profile?.owner_verification_attempt_count || 0)
    : 0
  const attemptsRemaining = Math.max(3 - attemptCountToday, 0)
  const currentSelfieStep = SELFIE_STEPS[scanStepIndex] || SELFIE_STEPS[0]
  const scanLineStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: scanLine.interpolate({
            inputRange: [0, 1],
            outputRange: [-80, 80],
          }),
        },
      ],
    }),
    [scanLine]
  )
  const checkpointItems = useMemo(
    () => [
      {
        key: 'owner',
        icon: 'shield-outline',
        title: 'Owner verification',
        done: ownerStatus === 'verified',
        caption: ownerStatusMeta.label,
      },
      {
        key: 'email',
        icon: 'mail-outline',
        title: 'Email confirmed',
        done: emailConfirmed,
        caption: emailConfirmed ? 'Ready' : 'Confirm first',
      },
      {
        key: 'phone',
        icon: 'call-outline',
        title: 'Phone on file',
        done: hasPhone,
        caption: hasPhone ? 'Added' : 'Add phone',
      },
      {
        key: 'id',
        icon: 'card-outline',
        title: 'ID details',
        done: hasIdDigits,
        caption: hasIdDigits ? 'Attached' : 'Add digits',
      },
      {
        key: 'docs',
        icon: 'document-text-outline',
        title: 'Front & back photos',
        done: hasFrontDoc && hasBackDoc,
        caption: hasFrontDoc && hasBackDoc ? 'Uploaded' : 'Upload both',
      },
      {
        key: 'selfie',
        icon: 'scan-outline',
        title: 'Guided selfie',
        done: hasSelfie,
        caption: hasSelfie ? 'Captured' : 'Capture now',
      },
    ],
    [
      emailConfirmed,
      hasBackDoc,
      hasFrontDoc,
      hasIdDigits,
      hasPhone,
      hasSelfie,
      ownerStatus,
      ownerStatusMeta.label,
    ]
  )

  const ownerVerificationChanged = useMemo(() => {
    const currentPhone = (profile?.owner_verification_phone || profile?.phone || '').trim()
    const currentIdType = profile?.owner_verification_id_type || 'national_id'
    const currentLast4 = (profile?.owner_verification_id_last4 || '').trim()
    const currentFrontPath = profile?.owner_verification_document_front_path || ''
    const currentBackPath = profile?.owner_verification_document_back_path || ''
    const currentSelfiePath = profile?.owner_verification_selfie_path || ''

    return (
      phone.trim() !== currentPhone ||
      idType !== currentIdType ||
      idLast4.trim() !== currentLast4 ||
      (getPrivateMediaPath(documentFront) || '') !== currentFrontPath ||
      (getPrivateMediaPath(documentBack) || '') !== currentBackPath ||
      (getPrivateMediaPath(selfieAsset) || '') !== currentSelfiePath
    )
  }, [
    documentBack,
    documentFront,
    idLast4,
    idType,
    phone,
    profile?.owner_verification_document_back_path,
    profile?.owner_verification_document_front_path,
    profile?.owner_verification_id_last4,
    profile?.owner_verification_id_type,
    profile?.owner_verification_phone,
    profile?.owner_verification_selfie_path,
    profile?.phone,
    selfieAsset,
  ])

  useEffect(() => {
    if (!checkpointItems.length) return undefined

    const timer = setInterval(() => {
      const nextIndex = (currentStepIndexRef.current + 1) % checkpointItems.length
      currentStepIndexRef.current = nextIndex
      stepsScrollRef.current?.scrollTo({
        x: nextIndex * (miniCardWidth + 10),
        animated: true,
      })
    }, 2200)

    return () => clearInterval(timer)
  }, [checkpointItems.length, miniCardWidth])

  async function updateDocumentSide(setter, source) {
    const asset = await pickPhotoFromSource(source)
    if (asset) {
      setter(asset)
    }
  }

  async function openSelfieCapture() {
    if (!cameraPermission?.granted) {
      const permissionResponse = await requestCameraPermission()

      if (!permissionResponse?.granted) {
        Alert.alert('Permission needed', 'Allow camera access to capture your guided selfie.')
        return
      }
    }

    setSelfieModalVisible(true)
  }

  async function captureGuidedSelfie() {
    if (!cameraRef.current || !captureEnabled) return

    setCapturingSelfie(true)

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.75,
      })

      setSelfieAsset({
        uri: photo.uri,
        type: 'image',
        mimeType: 'image/jpeg',
      })
      setSelfieModalVisible(false)
    } catch (error) {
      Alert.alert('Capture failed', error.message)
    }

    setCapturingSelfie(false)
  }

  async function submitOwnerVerification() {
    if (!user?.id) return
    if (!isOwner) {
      Alert.alert('Owner account needed', 'Switch your account type to Property owner in Settings first.')
      return
    }
    if (!emailConfirmed) {
      Alert.alert('Confirm email first', 'Please confirm your email address before requesting verification.')
      return
    }
    if (!phone.trim()) {
      Alert.alert('Phone needed', 'Add a contact phone number for verification.')
      return
    }
    if (!idLast4.trim() || idLast4.trim().length < 4) {
      Alert.alert('ID details needed', 'Add the last 4 digits of your ID to continue.')
      return
    }
    if (!hasFrontDoc || !hasBackDoc) {
      Alert.alert('Document photos needed', 'Upload both the front and back photo of your ID.')
      return
    }
    if (!hasSelfie) {
      Alert.alert('Guided selfie needed', 'Complete the guided selfie capture before submitting.')
      return
    }
    if (attemptCountToday >= 3) {
      Alert.alert('Daily retry limit reached', 'You can submit verification up to 3 times in one day. Please try again tomorrow.')
      return
    }
    if (ownerStatus === 'verified' && !ownerVerificationChanged) {
      Alert.alert(
        'No new verification changes',
        'Update your phone, ID details, or proof photos first if you want to send a new review request to the admin panel.'
      )
      return
    }

    if (ownerStatus === 'verified' && ownerVerificationChanged) {
      Alert.alert(
        'Send verification update?',
        'Your verified blue badge will be removed until the admin reviews and approves your updated information again.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            style: 'default',
            onPress: () => {
              continueOwnerVerificationSubmit()
            },
          },
        ]
      )
      return
    }

    continueOwnerVerificationSubmit()
  }

  async function continueOwnerVerificationSubmit() {
    if (!user?.id) return

    setSavingOwner(true)

    try {
      const [frontPath, backPath, selfiePath] = await Promise.all([
        ensurePrivateUpload(documentFront, user.id),
        ensurePrivateUpload(documentBack, user.id),
        ensurePrivateUpload(selfieAsset, user.id),
      ])

      const today = new Date().toISOString().slice(0, 10)
      const nextAttemptCount =
        profile?.owner_verification_attempt_day === today
          ? Number(profile?.owner_verification_attempt_count || 0) + 1
          : 1

      const payload = {
        user_id: user.id,
        email: user.email,
        phone: phone.trim(),
        is_verified: false,
        owner_verification_status: 'pending',
        owner_verification_requested_at: new Date().toISOString(),
        owner_verification_reviewed_at: null,
        owner_verification_rejection_reason: null,
        owner_verification_phone: phone.trim(),
        owner_verification_id_type: idType,
        owner_verification_id_last4: idLast4.trim(),
        owner_verification_note: verificationNote.trim() || null,
        owner_verification_document_front_path: frontPath,
        owner_verification_document_back_path: backPath,
        owner_verification_selfie_path: selfiePath,
        owner_verification_attempt_day: today,
        owner_verification_attempt_count: nextAttemptCount,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' })

      if (error) {
        throw error
      }

      await supabase.from('owner_verification_history').insert({
        user_id: String(user.id),
        action_type: ownerVerificationChanged && ownerStatus === 'verified' ? 'resubmitted' : 'submitted',
        phone: phone.trim(),
        id_type: idType,
        id_last4: idLast4.trim(),
        note: verificationNote.trim() || null,
      })

      const adminIds = await getPrimaryAdminUserIds()
      const requestedAt = payload.owner_verification_requested_at

      await Promise.all(
        adminIds.map((adminId) =>
          createNotification({
            recipientId: adminId,
            actorId: user.id,
            type: 'owner_verification_review_requested',
            title: 'Owner verification review requested',
            body: 'sent an owner verification request for admin review.',
            eventKey: `owner_verification_review_requested:${adminId}:${user.id}:${requestedAt}`,
            pushData: {
              screen: 'ReviewVerify',
            },
          })
        )
      )

      Alert.alert(
        ownerVerificationChanged && ownerStatus === 'verified' ? 'Update request sent' : 'Request sent',
        ownerVerificationChanged && ownerStatus === 'verified'
          ? 'Your verification changes were sent to the admin panel and are now pending review again.'
          : 'Your owner verification request is now pending review.'
      )
      await loadData()
    } catch (error) {
      Alert.alert(
        'Verification setup needed',
        error?.message || 'Run supabase-verification-features.sql in Supabase, then try again.'
      )
    }

    setSavingOwner(false)
  }

  async function requestPropertyVerification(post) {
    if (!user?.id || !post?.id) return
    if (!phone.trim()) {
      Alert.alert('Phone needed', 'Add your verification phone first so renters and reviewers have a trusted contact.')
      return
    }
    if (ownerStatus === 'unverified') {
      Alert.alert(
        'Complete owner verification first',
        'Upload your document photos and guided selfie, then send your owner verification before requesting property verification.'
      )
      return
    }

    setBusyPropertyId(post.id)

    const requestedAt = new Date().toISOString()
    const { error } = await supabase
      .from('properties')
      .update({
        verification_status: 'pending',
        verification_requested_at: requestedAt,
        verification_contact_phone: phone.trim(),
      })
      .eq('id', post.id)
      .eq('owner_id', user.id)

    setBusyPropertyId(null)

    if (error) {
      Alert.alert(
        'Verification setup needed',
        'Run supabase-verification-features.sql in Supabase, then try again.'
      )
      return
    }

    await supabase.from('property_verification_history').insert({
      property_id: String(post.id),
      owner_id: String(user.id),
      action_type: 'submitted',
      title: post.title || null,
      location: post.location || null,
      price: post.price ? String(post.price) : null,
    })

    const adminIds = await getPrimaryAdminUserIds()
    await Promise.all(
      adminIds.map((adminId) =>
        createNotification({
          recipientId: adminId,
          actorId: user.id,
          type: 'property_verification_review_requested',
          propertyId: post.id,
          title: 'Property verification review requested',
          body: `requested review for ${post.title || 'a property listing'}.`,
          eventKey: `property_verification_review_requested:${adminId}:${user.id}:${post.id}:${requestedAt}`,
          pushData: {
            screen: 'ReviewVerify',
          },
        })
      )
    )

    setPosts((currentPosts) =>
      currentPosts.map((item) =>
        item.id === post.id
          ? {
              ...item,
              verification_status: 'pending',
              verification_requested_at: requestedAt,
            }
          : item
      )
    )
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#f7f7f7' }}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: '#0f172a', fontSize: 24, fontWeight: '900' }}>
            Verification center
          </Text>
          <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 20 }}>
            Help renters trust your profile and listings before they message you.
          </Text>
          <View style={{ marginTop: 10 }}>
            <StatusChip meta={ownerStatusMeta} />
          </View>
        </View>

        <ScrollView
          ref={stepsScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={miniCardWidth + 10}
          snapToAlignment="start"
          disableIntervalMomentum
          contentContainerStyle={{ paddingRight: 4, marginBottom: 16 }}
        >
          {checkpointItems.map((item) => (
            <MiniStepBadge key={item.key} item={item} width={miniCardWidth} />
          ))}
        </ScrollView>

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 16,
            marginBottom: 16,
          }}
        >
          <CollapsibleHeader
            title="Owner verification"
            subtitle="Add a reachable phone number, ID details, front and back document photos, and a guided selfie."
            expanded={ownerVerificationExpanded}
            onPress={() => setOwnerVerificationExpanded((current) => !current)}
          />

          {ownerStatus === 'rejected' && rejectionReason ? (
            <View
              style={{
                backgroundColor: '#fef2f2',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#fecaca',
                padding: 12,
                marginTop: 12,
                marginBottom: 4,
              }}
            >
              <Text style={{ color: '#b91c1c', fontWeight: '900', marginBottom: 4 }}>
                Rejected notice
              </Text>
              <Text style={{ color: '#7f1d1d', lineHeight: 19 }}>
                {rejectionReason}
              </Text>
            </View>
          ) : null}

          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 12 }}>
            Daily retry limit: {attemptCountToday}/3 used today. {attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} left.
          </Text>

          {ownerVerificationExpanded ? (
          <View style={{ marginTop: 12 }}>
            <Field
              label="Verification phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="01XXXXXXXXX"
              keyboardType="phone-pad"
            />

            <Text style={{ color: '#334155', fontSize: 13, fontWeight: '800', marginBottom: 8 }}>
              ID type
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              {ID_TYPES.map((item) => {
                const active = idType === item.id

                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setIdType(item.id)}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? '#1877F2' : '#e2e8f0',
                      backgroundColor: active ? '#eff6ff' : '#fff',
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={{ color: active ? '#1877F2' : '#475569', fontWeight: '800', fontSize: 12 }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Field
              label="Last 4 digits of your ID"
              value={idLast4}
              onChangeText={(value) => setIdLast4(value.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="1234"
              keyboardType="number-pad"
              maxLength={4}
            />

            <DocumentUploadCard
              title="Document front photo"
              subtitle="Capture or upload the front side of your National ID, passport, or driving licence."
              asset={documentFront}
              onTakePhoto={() => updateDocumentSide(setDocumentFront, 'camera')}
              onChooseGallery={() => updateDocumentSide(setDocumentFront, 'gallery')}
              onRemove={() => setDocumentFront(null)}
            />

            <DocumentUploadCard
              title="Document back photo"
              subtitle="Capture or upload the back side clearly. Keep all important text visible."
              asset={documentBack}
              onTakePhoto={() => updateDocumentSide(setDocumentBack, 'camera')}
              onChooseGallery={() => updateDocumentSide(setDocumentBack, 'gallery')}
              onRemove={() => setDocumentBack(null)}
            />

            <SelfieCard
              asset={selfieAsset}
              onOpenCamera={openSelfieCapture}
              onRemove={() => setSelfieAsset(null)}
            />

            <Field
              label="Note for review (optional)"
              value={verificationNote}
              onChangeText={setVerificationNote}
              placeholder="Anything helpful about your property ownership or contact process"
              multiline
            />

            <View
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                padding: 12,
                marginBottom: 14,
              }}
            >
              <Text style={{ color: '#475569', lineHeight: 19 }}>
                Your document photos and guided selfie are uploaded privately for admin review. This is a guided capture flow with manual approval, not automatic biometric verification.
              </Text>
            </View>

            <TouchableOpacity
              onPress={submitOwnerVerification}
              disabled={savingOwner}
              style={{
                backgroundColor: savingOwner ? '#8bbcf7' : '#1877F2',
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>
                {savingOwner
                  ? 'Sending request...'
                  : ownerStatus === 'pending'
                    ? 'Update verification request'
                    : 'Request owner verification'}
              </Text>
            </TouchableOpacity>
          </View>
          ) : null}
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 16,
          }}
        >
          <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900' }}>
            Property verification
          </Text>
          <Text style={{ color: '#64748b', marginTop: 6, lineHeight: 20, marginBottom: 14 }}>
            Ask for a trust badge on the properties you want to highlight most.
          </Text>

          {!activePropertyRequests.length ? (
            <View
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                padding: 16,
              }}
            >
              <Text style={{ color: '#475569', lineHeight: 20 }}>
                {posts.length
                  ? 'No active property verification requests right now.'
                  : 'Publish a property first, then you can request listing verification here.'}
              </Text>
            </View>
          ) : (
            activePropertyRequests.map((item) => (
              <ListingRow
                key={item.id}
                item={item}
                onRequest={requestPropertyVerification}
                busy={busyPropertyId === item.id}
              />
            ))
          )}
        </View>

        {verifiedProperties.length ? (
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              padding: 16,
              marginTop: 16,
            }}
          >
            <TouchableOpacity
              onPress={() => setVerifiedPropertiesExpanded((current) => !current)}
              activeOpacity={0.85}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900' }}>
                  Verified properties
                </Text>
                <Text style={{ color: '#64748b', marginTop: 4 }}>
                  {verifiedProperties.length} verified {verifiedProperties.length === 1 ? 'listing' : 'listings'}
                </Text>
              </View>

              <Ionicons
                name={verifiedPropertiesExpanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#334155"
              />
            </TouchableOpacity>

            {verifiedPropertiesExpanded ? (
              <View style={{ marginTop: 14 }}>
                {verifiedProperties.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      backgroundColor: '#f8fafc',
                      padding: 14,
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 15 }}>
                          {item.title || 'Untitled property'}
                        </Text>
                        <Text style={{ color: '#64748b', marginTop: 4 }}>
                          {item.location || 'Location not added'}
                        </Text>
                      </View>
                      <StatusChip
                        meta={getVerificationMeta('verified', {
                          verifiedLabel: 'Verified property',
                        })}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={selfieModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSelfieModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#020617' }}>
          {!cameraPermission?.granted ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <Ionicons name="camera-outline" size={34} color="#cbd5e1" />
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 12 }}>
                Camera access needed
              </Text>
              <Text style={{ color: '#cbd5e1', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                Allow camera access so we can open the guided selfie flow.
              </Text>
              <TouchableOpacity
                onPress={requestCameraPermission}
                style={{
                  marginTop: 18,
                  borderRadius: 14,
                  backgroundColor: '#1877F2',
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>Grant permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <CameraView
                ref={cameraRef}
                style={{ flex: 1 }}
                facing="front"
                mirror
                active={selfieModalVisible}
              />

              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 24,
                  right: 24,
                  top: 110,
                  bottom: 180,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: '78%',
                    maxWidth: 290,
                    aspectRatio: 0.78,
                    borderRadius: 28,
                    borderWidth: 2,
                    borderColor: '#93c5fd',
                    overflow: 'hidden',
                    backgroundColor: 'rgba(15, 23, 42, 0.18)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Animated.View
                    style={[
                      {
                        position: 'absolute',
                        left: 18,
                        right: 18,
                        height: 3,
                        borderRadius: 999,
                        backgroundColor: '#60a5fa',
                        shadowColor: '#60a5fa',
                        shadowOpacity: 0.6,
                        shadowRadius: 8,
                      },
                      scanLineStyle,
                    ]}
                  />
                </View>
              </View>

              <Pressable
                onPress={() => setSelfieModalVisible(false)}
                style={{
                  position: 'absolute',
                  top: 58,
                  right: 18,
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(15, 23, 42, 0.55)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>

              <View
                style={{
                  position: 'absolute',
                  left: 18,
                  right: 18,
                  bottom: 24,
                  backgroundColor: 'rgba(15, 23, 42, 0.78)',
                  borderRadius: 24,
                  padding: 18,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>
                  {currentSelfieStep.title}
                </Text>
                <Text style={{ color: '#cbd5e1', marginTop: 6, lineHeight: 20 }}>
                  {currentSelfieStep.subtitle}
                </Text>

                <View style={{ flexDirection: 'row', marginTop: 14 }}>
                  {SELFIE_STEPS.map((step, index) => (
                    <View
                      key={step.title}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 999,
                        backgroundColor: index <= scanStepIndex ? '#60a5fa' : 'rgba(148, 163, 184, 0.35)',
                        marginRight: index === SELFIE_STEPS.length - 1 ? 0 : 6,
                      }}
                    />
                  ))}
                </View>

                <Text style={{ color: '#94a3b8', marginTop: 12, fontSize: 12, lineHeight: 18 }}>
                  Guided motion only. A real person still reviews this before approval.
                </Text>

                <TouchableOpacity
                  onPress={captureGuidedSelfie}
                  disabled={!captureEnabled || capturingSelfie}
                  style={{
                    marginTop: 16,
                    borderRadius: 16,
                    backgroundColor: !captureEnabled || capturingSelfie ? '#60a5fa' : '#1877F2',
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900' }}>
                    {capturingSelfie
                      ? 'Capturing...'
                      : captureEnabled
                        ? 'Capture selfie'
                        : 'Follow the guide first'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  )
}
