import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { isPrimaryAdmin } from '../lib/admin'
import { HOME_BANNER_BUCKET, uploadMediaAsset } from '../lib/media'
import {
  createHomeBanner,
  deleteHomeBanner,
  fetchAdminHomeBanners,
  updateHomeBanner,
} from '../lib/homeBanners'

function BannerKindChip({ id, label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={() => onPress(id)}
      activeOpacity={0.86}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 14,
        backgroundColor: active ? '#2563eb' : '#eff6ff',
      }}
    >
      <Text style={{ color: active ? '#fff' : '#1d4ed8', fontSize: 12, fontWeight: '900' }}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function FormField({ label, value, onChangeText, placeholder, multiline = false, keyboardType }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: '#475569', fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        multiline={multiline}
        keyboardType={keyboardType}
        style={{
          backgroundColor: '#f8fafc',
          borderWidth: 1,
          borderColor: '#dbe4ee',
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 11,
          minHeight: multiline ? 82 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          color: '#0f172a',
          fontSize: 13,
        }}
      />
    </View>
  )
}

export default function AdminBannersScreen({ navigation }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [banners, setBanners] = useState([])
  const [kind, setKind] = useState('offer')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [targetPropertyId, setTargetPropertyId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [pendingImage, setPendingImage] = useState(null)

  const loadBanners = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const allowed = isPrimaryAdmin(user)
    setAuthorized(allowed)

    if (!allowed) {
      setBanners([])
      setLoading(false)
      return
    }

    try {
      const nextBanners = await fetchAdminHomeBanners()
      setBanners(nextBanners)
    } catch (error) {
      Alert.alert('Could not load banners', error?.message || 'Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadBanners()
    }, [loadBanners])
  )

  async function pickBannerImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow gallery access to upload a banner image.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
      aspect: [16, 9],
    })

    if (result.canceled || !result.assets?.length) return

    setPendingImage(result.assets[0])
  }

  function resetForm() {
    setKind('offer')
    setTitle('')
    setSubtitle('')
    setCtaLabel('')
    setTargetPropertyId('')
    setSortOrder('0')
    setPendingImage(null)
  }

  async function handleCreateBanner() {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please add a short banner title.')
      return
    }

    if (!pendingImage?.uri) {
      Alert.alert('Missing image', 'Please choose a banner image first.')
      return
    }

    setSaving(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user?.id) {
        throw new Error('Please log in again and try once more.')
      }

      const uploadResult = await uploadMediaAsset({
        uri: pendingImage.uri,
        type: 'image',
        mimeType: pendingImage.mimeType,
        userId: user.id,
        bucket: HOME_BANNER_BUCKET,
      })

      const createdBanner = await createHomeBanner({
        kind,
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        image_url: uploadResult.mediaUrl,
        cta_label: ctaLabel.trim() || null,
        target_property_id: targetPropertyId.trim() || null,
        sort_order: Number(sortOrder) || 0,
        is_active: true,
        created_by: user.id,
      })

      setBanners((current) => [createdBanner, ...current].sort((a, b) => {
        if ((a.sort_order || 0) !== (b.sort_order || 0)) {
          return (a.sort_order || 0) - (b.sort_order || 0)
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }))
      resetForm()
      Alert.alert('Banner uploaded', 'Your home banner is now ready for the homepage.')
    } catch (error) {
      Alert.alert('Banner upload failed', error?.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleBannerActive(banner) {
    try {
      const updated = await updateHomeBanner(banner.id, {
        is_active: !banner.is_active,
      })

      setBanners((current) =>
        current.map((item) => (item.id === banner.id ? updated : item))
      )
    } catch (error) {
      Alert.alert('Could not update banner', error?.message || 'Please try again.')
    }
  }

  async function handleDeleteBanner(banner) {
    Alert.alert('Delete banner?', 'This will remove the banner from the homepage.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteHomeBanner(banner.id)
            setBanners((current) => current.filter((item) => item.id !== banner.id))
          } catch (error) {
            Alert.alert('Could not delete banner', error?.message || 'Please try again.')
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#f7f7f7' }}>
        <ActivityIndicator />
      </View>
    )
  }

  if (!authorized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
        <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              padding: 16,
            }}
          >
            <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '900' }}>
              Admin only
            </Text>
            <Text style={{ color: '#64748b', marginTop: 8, lineHeight: 20 }}>
              This banner manager is only available for your first-level admin account.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                marginTop: 16,
                borderRadius: 14,
                backgroundColor: '#1877F2',
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>Go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <Text style={{ color: '#64748b', lineHeight: 20, marginBottom: 14 }}>
          Upload homepage banners for featured posts and special offers. Two cards will appear side by side on the home feed.
        </Text>

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 14,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '900', marginBottom: 12 }}>
            New banner
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <BannerKindChip id="offer" label="Offer" active={kind === 'offer'} onPress={setKind} />
            <BannerKindChip id="post" label="Post" active={kind === 'post'} onPress={setKind} />
          </View>

          <FormField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Summer move-in offer"
          />
          <FormField
            label="Subtitle"
            value={subtitle}
            onChangeText={setSubtitle}
            placeholder="2 bed apartment near Uttara"
            multiline
          />
          <FormField
            label="Button label"
            value={ctaLabel}
            onChangeText={setCtaLabel}
            placeholder="View details"
          />
          <FormField
            label="Linked property ID (optional)"
            value={targetPropertyId}
            onChangeText={setTargetPropertyId}
            placeholder="Paste a property id if this banner should open a post"
          />
          <FormField
            label="Sort order"
            value={sortOrder}
            onChangeText={setSortOrder}
            placeholder="0"
            keyboardType="number-pad"
          />

          <TouchableOpacity
            onPress={pickBannerImage}
            activeOpacity={0.86}
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#dbe4ee',
              backgroundColor: '#f8fafc',
              padding: 12,
              marginBottom: 12,
            }}
          >
            {pendingImage?.uri ? (
              <Image
                source={{ uri: pendingImage.uri }}
                style={{ width: '100%', height: 136, borderRadius: 12, backgroundColor: '#dbe4ee' }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  height: 136,
                  borderRadius: 12,
                  backgroundColor: '#eef4ff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="image-outline" size={30} color="#93c5fd" />
                <Text style={{ color: '#475569', fontWeight: '800', marginTop: 8 }}>
                  Choose banner image
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleCreateBanner}
            disabled={saving}
            style={{
              minHeight: 46,
              borderRadius: 14,
              backgroundColor: saving ? '#93c5fd' : '#2563eb',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>
                Upload banner
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '900', marginBottom: 10 }}>
          Existing banners
        </Text>

        {banners.length ? (
          banners.map((banner) => (
            <View
              key={banner.id}
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Image
                source={{ uri: banner.image_url }}
                style={{ width: '100%', height: 128, borderRadius: 12, backgroundColor: '#dbe4ee' }}
                resizeMode="cover"
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: banner.kind === 'offer' ? '#fff7ed' : '#eff6ff',
                    marginRight: 8,
                  }}
                >
                  <Text
                    style={{
                      color: banner.kind === 'offer' ? '#c2410c' : '#1d4ed8',
                      fontSize: 10,
                      fontWeight: '900',
                      textTransform: 'uppercase',
                    }}
                  >
                    {banner.kind}
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: banner.is_active ? '#ecfdf5' : '#f1f5f9',
                  }}
                >
                  <Text
                    style={{
                      color: banner.is_active ? '#15803d' : '#64748b',
                      fontSize: 10,
                      fontWeight: '900',
                    }}
                  >
                    {banner.is_active ? 'ACTIVE' : 'HIDDEN'}
                  </Text>
                </View>
              </View>

              <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '900', marginTop: 10 }}>
                {banner.title}
              </Text>
              {banner.subtitle ? (
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                  {banner.subtitle}
                </Text>
              ) : null}

              <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 7 }}>
                Sort: {banner.sort_order || 0}
                {banner.target_property_id ? ` · Linked post: ${banner.target_property_id}` : ''}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => toggleBannerActive(banner)}
                  style={{
                    flex: 1,
                    minHeight: 40,
                    borderRadius: 12,
                    backgroundColor: banner.is_active ? '#eff6ff' : '#ecfdf5',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: banner.is_active ? '#1d4ed8' : '#15803d',
                      fontSize: 12,
                      fontWeight: '900',
                    }}
                  >
                    {banner.is_active ? 'Hide banner' : 'Show banner'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleDeleteBanner(banner)}
                  style={{
                    paddingHorizontal: 14,
                    minHeight: 40,
                    borderRadius: 12,
                    backgroundColor: '#fee2e2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="trash-outline" size={17} color="#dc2626" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              padding: 18,
            }}
          >
            <Text style={{ color: '#64748b', lineHeight: 20 }}>
              No banners yet. Upload your first homepage card above.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
