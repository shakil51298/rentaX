import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { Modal, ScrollView } from 'react-native'
import { VideoView, useVideoPlayer } from 'expo-video'

export default function HomeScreen({ navigation }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [showReacts, setShowReacts] = useState(null)
  const [selectedMedia, setSelectedMedia] = useState([])
const [mediaModal, setMediaModal] = useState(false)

  useEffect(() => {
    loadProperties()
  }, [])

  function VideoBox({ uri }) {
    const player = useVideoPlayer(uri, (player) => {
      player.loop = true
    })
  
    return (
      <VideoView
        player={player}
        style={{
          width: '100%',
          height: 300,
          backgroundColor: '#000',
        }}
        allowsFullscreen
        allowsPictureInPicture
      />
    )
  }

  async function loadProperties() {
    setLoading(true)

    const { data } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false })

    setProperties(data || [])
    setLoading(false)
  }

  function handleReact(type) {
    Alert.alert('Reacted', `You reacted with ${type}`)
    setShowReacts(null)
  }

  function PostCard({ item }) {
    return (
      <View
        style={{
          backgroundColor: '#fff',
          marginBottom: 10,
          paddingTop: 12,
        }}
      >
        {/* USER INFO */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#ddd',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="person" size={22} color="#666" />
          </View>

          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700' }}>
              Property Owner
            </Text>
            <Text style={{ fontSize: 12, color: '#777' }}>Just now</Text>
          </View>

          <Ionicons name="ellipsis-horizontal" size={22} color="#555" />
        </View>

        {/* POST TEXT */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Property', { property: item })}
        >
          <Text
            style={{
              paddingHorizontal: 14,
              marginTop: 10,
              fontSize: 15,
              lineHeight: 21,
            }}
          >
            {item.title || 'Rental property available'}{'\n'}
            {item.description || 'Beautiful rental property is available now.'}
            {'\n\n'}Rent: ৳ {item.price || 'N/A'}
            {'\n'}Location: {item.location || 'Location not added'}
          </Text>
        </TouchableOpacity>

{/* MEDIA PREVIEW */}
{item.media && item.media.length > 0 ? (
  <View
    style={{
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 12,
      paddingHorizontal: 8,
    }}
  >
    {item.media.slice(0, 4).map((mediaItem, index) => (
      <TouchableOpacity
        key={index}
        onPress={() => {
          setSelectedMedia(item.media)
          setMediaModal(true)
        }}
        style={{
          width: '50%',
          padding: 3,
        }}
      >
        {mediaItem.type === 'video' ? (
          <View
            style={{
              height: 130,
              backgroundColor: '#111',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="play-circle" size={40} color="#fff" />

            {index === 3 && item.media.length > 4 ? (
              <Text style={{ color: '#fff', marginTop: 6 }}>
                +{item.media.length - 4} more
              </Text>
            ) : null}
          </View>
        ) : (
          <View>
            <Image
              source={{ uri: mediaItem.uri }}
              style={{
                width: '100%',
                height: 130,
                backgroundColor: '#eee',
              }}
              resizeMode="cover"
            />

            {index === 3 && item.media.length > 4 ? (
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.45)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>
                  +{item.media.length - 4}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </TouchableOpacity>
    ))}
  </View>
) : (
  <View
    style={{
      height: 180,
      marginTop: 12,
      backgroundColor: '#eee',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Ionicons name="home-outline" size={44} color="#aaa" />
    <Text style={{ color: '#777', marginTop: 8 }}>No media</Text>
  </View>
)}

        {/* REACT OPTIONS */}
        {showReacts === item.id ? (
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: '#fff',
              padding: 8,
              borderRadius: 30,
              position: 'absolute',
              bottom: 44,
              left: 12,
              elevation: 5,
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 8,
            }}
          >
            {['👍', '❤️', '😂', '🔥'].map((react) => (
              <TouchableOpacity
                key={react}
                onPress={() => handleReact(react)}
                style={{ paddingHorizontal: 8 }}
              >
                <Text style={{ fontSize: 26 }}>{react}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* ACTION BUTTONS */}
        <View
          style={{
            flexDirection: 'row',
            borderTopWidth: 1,
            borderTopColor: '#eee',
            marginTop: 8,
          }}
        >
          <TouchableOpacity
            onPress={() => handleReact('👍')}
            onLongPress={() => setShowReacts(item.id)}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Ionicons name="thumbs-up-outline" size={20} color="#555" />
            <Text style={{ color: '#555', fontWeight: '600' }}>Like</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#555" />
            <Text style={{ color: '#555', fontWeight: '600' }}>Comment</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Ionicons name="share-social-outline" size={20} color="#555" />
            <Text style={{ color: '#555', fontWeight: '600' }}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  function CreatePostBox() {
    return (
      <View
        style={{
          backgroundColor: '#fff',
          paddingHorizontal: 14,
          paddingVertical: 12,
          marginBottom: 8,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: '#ddd',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="person" size={22} color="#666" />
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('CreatePost')}
            style={{
              flex: 1,
              marginLeft: 10,
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 25,
              paddingVertical: 11,
              paddingHorizontal: 16,
            }}
          >
            <Text style={{ color: '#555' }}>What's on your mind?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('CreatePost')}
            style={{ marginLeft: 10 }}
          >
            <Ionicons name="images" size={28} color="green" />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      {/* STICKY TOP BAR */}
      <View
        style={{
          backgroundColor: '#fff',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: '#eee',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <TouchableOpacity
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: '#f1f1f1',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="search" size={22} color="#111" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard item={item} />}
          ListHeaderComponent={<CreatePostBox />}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshing={loading}
          onRefresh={loadProperties}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 30, color: '#666' }}>
              No posts yet
            </Text>
          }
        />
      )}

      {/* BOTTOM MENU */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingVertical: 10,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#eee',
        }}
      >
        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
          <Ionicons name="home" size={25} color="#1877F2" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Chat')}>
          <Ionicons name="chatbubble-outline" size={25} color="#111" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Favorite')}>
          <Ionicons name="heart-outline" size={25} color="#111" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Ionicons name="person-outline" size={25} color="#111" />
        </TouchableOpacity>
      </View>
      <Modal visible={mediaModal} animationType="slide">
  <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
    <TouchableOpacity
      onPress={() => setMediaModal(false)}
      style={{
        padding: 16,
        alignItems: 'flex-end',
      }}
    >
      <Ionicons name="close" size={30} color="#fff" />
    </TouchableOpacity>

    <ScrollView>
      {selectedMedia.map((item, index) => (
        <View key={index} style={{ marginBottom: 16 }}>
          {item.type === 'video' ? (
            <VideoBox uri={item.uri} />
          ) : (
            <Image
              source={{ uri: item.uri }}
              style={{
                width: '100%',
                height: 420,
                backgroundColor: '#111',
              }}
              resizeMode="contain"
            />
          )}
        </View>
      ))}
    </ScrollView>
  </SafeAreaView>
</Modal>
    </SafeAreaView>
  )
}