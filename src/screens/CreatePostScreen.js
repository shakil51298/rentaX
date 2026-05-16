import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import * as ImagePicker from 'expo-image-picker'
import { PROPERTY_MEDIA_BUCKET, uploadMediaAsset } from '../lib/media'

export default function CreatePostScreen({ navigation }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const [media, setMedia] = useState([])

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
        type: asset.type,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      }))

      setMedia((currentMedia) => [...currentMedia, ...selected])
    }
  }

  async function createPost() {
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

    let uploadedMedia = []

    try {
      uploadedMedia = await Promise.all(
        media.map(async (item) => {
          const messageType = item.type === 'video' ? 'video' : 'image'
          const uploadResult = await uploadMediaAsset({
            uri: item.uri,
            type: messageType,
            mimeType: item.mimeType,
            userId: user.id,
            bucket: PROPERTY_MEDIA_BUCKET,
          })

          return {
            uri: uploadResult.mediaUrl,
            type: messageType,
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

    const { error } = await supabase.from('properties').insert({
      title,
      description,
      price,
      location,
      owner_id: user.id,
      owner_email: user.email,
      owner_name: user.user_metadata?.name || user.email,
      image_url: uploadedMedia[0]?.uri || null,
      media: uploadedMedia,
    })

    setLoading(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    Alert.alert('Success', 'Property post created')

    navigation.goBack()
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f0f2f5' }}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* TOP CARD */}
      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          padding: 16,
        }}
      >
        {/* USER */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: '#ddd',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="person" size={24} color="#666" />
          </View>

          <View style={{ marginLeft: 10 }}>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>
              Create Property Post
            </Text>

            <Text style={{ color: '#777', marginTop: 2 }}>
              Share your rental property
            </Text>
          </View>
        </View>

        {/* TITLE */}
        <TextInput
          placeholder="Property title"
          value={title}
          onChangeText={setTitle}
          style={{
            backgroundColor: '#f5f5f5',
            borderRadius: 10,
            padding: 14,
            marginBottom: 12,
          }}
        />

        {/* DESCRIPTION */}
        <TextInput
          placeholder="Describe your property..."
          value={description}
          onChangeText={setDescription}
          multiline
          style={{
            backgroundColor: '#f5f5f5',
            borderRadius: 10,
            padding: 14,
            marginBottom: 12,
            minHeight: 120,
            textAlignVertical: 'top',
          }}
        />

        {/* PRICE */}
        <TextInput
          placeholder="Monthly rent price"
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          style={{
            backgroundColor: '#f5f5f5',
            borderRadius: 10,
            padding: 14,
            marginBottom: 12,
          }}
        />

        {/* LOCATION */}
        <TextInput
          placeholder="Location"
          value={location}
          onChangeText={setLocation}
          style={{
            backgroundColor: '#f5f5f5',
            borderRadius: 10,
            padding: 14,
            marginBottom: 18,
          }}
        />

        {/* PHOTO BUTTON */}
        <TouchableOpacity
  onPress={pickMedia}
  style={{
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  }}
        >
          <Ionicons name="images-outline" size={22} color="#555" />

          <Text style={{ marginLeft: 8, color: '#555', fontWeight: '600' }}>
            Add Photos / Videos
  </Text>
</TouchableOpacity>

<ScrollView horizontal showsHorizontalScrollIndicator={false}>
  {media.map((item, index) => (
    <View key={index} style={{ marginRight: 8, marginBottom: 16 }}>
      {item.type === 'video' ? (
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 8,
            backgroundColor: '#111',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="play-circle" size={32} color="#fff" />
        </View>
      ) : (
        <Image
          source={{ uri: item.uri }}
          style={{ width: 80, height: 80, borderRadius: 8 }}
        />
      )}
    </View>
          ))}
        </ScrollView>

        {/* POST BUTTON */}
        <TouchableOpacity
          onPress={createPost}
          disabled={loading}
          style={{
            backgroundColor: '#1877F2',
            paddingVertical: 15,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontWeight: '700',
              fontSize: 16,
            }}
          >
            {loading ? 'Posting...' : 'Post Property'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}
