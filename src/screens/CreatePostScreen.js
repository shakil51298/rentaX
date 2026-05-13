import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import * as ImagePicker from 'expo-image-picker'
import { Image, ScrollView } from 'react-native'

export default function CreatePostScreen({ navigation }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const [image, setImage] = useState(null)
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
      }))
  
      setMedia([...media, ...selected])
    }
  }

  async function pickImage() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync()
  
    if (!permission.granted) {
      Alert.alert('Permission needed')
      return
    }
  
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    })
  
    if (!result.canceled) {
      setImage(result.assets[0].uri)
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

    const { error } = await supabase.from('properties').insert({
      title,
      description,
      price,
      location,
      owner_id: user.id,
      image_url: media[0]?.uri || null,
      media: media,
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

{image ? (
  <Image
    source={{ uri: image }}
    style={{
      width: '100%',
      height: 220,
      borderRadius: 12,
      marginBottom: 18,
    }}
  />
) : null}

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