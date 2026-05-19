import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import { getUserAvatarUrl, getUserDisplayName } from '../lib/userDisplay'
import { isPrimaryAdmin } from '../lib/admin'

function Field({ label, placeholder, multiline, keyboardType, value, onChangeText }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          color: '#334155',
          fontSize: 13,
          fontWeight: '800',
          marginBottom: 8,
        }}
      >
        {label}
      </Text>

      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        style={{
          backgroundColor: '#f8fafc',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#e2e8f0',
          paddingHorizontal: 14,
          paddingVertical: 14,
          minHeight: multiline ? 120 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          color: '#0f172a',
        }}
      />
    </View>
  )
}

function MediaTile({ item, index, selected, onPress, onRemove }) {
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
            width: 92,
            height: 92,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: '#0f172a',
            borderWidth: selected ? 2 : 1,
            borderColor: selected ? '#1877F2' : '#dbe4ee',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="videocam" size={28} color="#fff" />
          <Text
            style={{
              color: '#cbd5e1',
              fontSize: 11,
              fontWeight: '800',
              marginTop: 6,
            }}
          >
            Video
          </Text>
        </View>
      ) : (
        <Image
          source={{ uri: item.uri }}
          style={{
            width: 92,
            height: 92,
            borderRadius: 16,
            backgroundColor: '#e2e8f0',
            borderWidth: selected ? 2 : 1,
            borderColor: selected ? '#1877F2' : '#dbe4ee',
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
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
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
    if (!title || !price) {
      Alert.alert('Required', 'Please enter title and price')
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
      Alert.alert(
        'Media upload failed',
        'Please run supabase-property-media-features.sql in Supabase, then try again.'
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
      : supabase.from('properties').insert(payload)

    const { error } = await query

    setLoading(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    Alert.alert('Success', isEditing ? 'Property post updated' : 'Property post created')

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
      style={{ flex: 1, backgroundColor: '#eef4fb' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 24,
            padding: 18,
            borderWidth: 1,
            borderColor: '#dbe4ee',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 18,
            }}
          >
            <Avatar
              profile={composerProfile}
              name={composerName}
              uri={composerProfile?.avatar_url || getUserAvatarUrl(composerUser)}
              size={52}
            />

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: '#0f172a', fontSize: 17, fontWeight: '900' }}>
                {composerName}
              </Text>
              <Text style={{ color: '#64748b', marginTop: 4 }}>
                {composerSubtitle}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: '#eff6ff',
              }}
            >
              <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '800' }}>
                {isEditing ? 'Editing' : 'New post'}
              </Text>
            </View>
          </View>

          <Field
            label="Property title"
            placeholder="2 bedroom apartment near Bashundhara"
            value={title}
            onChangeText={setTitle}
          />

          <Field
            label="Description"
            placeholder="Tell renters about the rooms, washroom, security, nearby transport, and anything helpful."
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Field
            label="Monthly rent"
            placeholder="25000"
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />

          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                color: '#334155',
                fontSize: 13,
                fontWeight: '800',
                marginBottom: 8,
              }}
            >
              Location
            </Text>

            <View
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                padding: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  placeholder="Dhaka, Bashundhara R/A"
                  placeholderTextColor="#94a3b8"
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
                    color: '#0f172a',
                    fontSize: 15,
                    minHeight: 22,
                    paddingVertical: 6,
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
                    height: 38,
                    paddingHorizontal: 12,
                    borderRadius: 13,
                    backgroundColor: '#eff6ff',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="map-outline" size={16} color="#2563eb" />
                  <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '900', marginLeft: 6 }}>
                    Pick map
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={{ color: '#64748b', fontSize: 11, marginTop: 8, lineHeight: 16 }}>
                {locationHelperText}
              </Text>
            </View>
          </View>

          <View
            style={{
              backgroundColor: '#f8fafc',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              padding: 14,
              marginBottom: 18,
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
                <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '900' }}>
                  Photos and videos
                </Text>
                <Text style={{ color: '#64748b', marginTop: 4 }}>
                  Add clear media so renters can understand the property fast.
                </Text>
              </View>

              <TouchableOpacity
                onPress={pickMedia}
                activeOpacity={0.86}
                style={{
                  backgroundColor: '#1877F2',
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="images-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', marginLeft: 6 }}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>

            {previewItem ? (
              <>
                <View
                  style={{
                    height: 208,
                    borderRadius: 20,
                    overflow: 'hidden',
                    backgroundColor: '#dbeafe',
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
                      <Ionicons name="play-circle" size={54} color="#fff" />
                      <Text style={{ color: '#e2e8f0', fontWeight: '800', marginTop: 10 }}>
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
                      left: 12,
                      bottom: 12,
                      backgroundColor: 'rgba(15, 23, 42, 0.72)',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
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
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 18,
                  paddingVertical: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: '#e0edff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Ionicons name="camera-outline" size={24} color="#2563eb" />
                </View>

                <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '900' }}>
                  Add property media
                </Text>
                <Text style={{ color: '#64748b', marginTop: 6, textAlign: 'center' }}>
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
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="send" size={18} color="#fff" />
            <Text
              style={{
                color: '#fff',
                fontWeight: '900',
                fontSize: 16,
                marginLeft: 8,
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
    </KeyboardAvoidingView>
  )
}
