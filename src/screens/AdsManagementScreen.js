import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import MediaViewer from '../components/common/MediaViewer'
import PostCard from '../components/home/PostCard'
import { fetchPropertiesWithProfiles } from '../lib/properties'

export default function AdsManagementScreen({ navigation }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userType, setUserType] = useState('renter')
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState([])
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })

  const loadAds = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user || null)

    if (!user?.id) {
      setUserType('renter')
      setPosts([])
      setLoading(false)
      return
    }

    const metadata = user.user_metadata || {}
    const fallbackUserType = metadata.user_type || 'renter'

    const { data: dbProfile } = await supabase
      .from('user_profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .maybeSingle()

    const resolvedUserType = dbProfile?.user_type || fallbackUserType
    setUserType(resolvedUserType)

    if (resolvedUserType !== 'property_owner') {
      setPosts([])
      setLoading(false)
      return
    }

    try {
      setPosts(await fetchPropertiesWithProfiles({ ownerId: user.id }))
    } catch (error) {
      Alert.alert('Error', error.message)
    }

    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadAds()
    }, [loadAds])
  )

  function openMedia(media, index) {
    setMediaViewer({
      visible: true,
      media,
      index,
    })
  }

  function closeMediaViewer() {
    setMediaViewer({
      visible: false,
      media: [],
      index: 0,
    })
  }

  function updateLocalReaction(propertyId, reaction) {
    setPosts((oldPosts) =>
      oldPosts.map((post) => {
        if (post.id !== propertyId) return post

        const oldReactions = post.property_reactions || []
        const withoutMine = oldReactions.filter((item) => item.user_id !== currentUser?.id)

        if (!reaction) {
          return {
            ...post,
            property_reactions: withoutMine,
          }
        }

        return {
          ...post,
          property_reactions: [
            ...withoutMine,
            {
              id: `${propertyId}-${currentUser?.id}`,
              property_id: propertyId,
              user_id: currentUser?.id,
              reaction,
            },
          ],
        }
      })
    )
  }

  async function toggleLike(propertyId) {
    if (!currentUser) return

    const post = posts.find((item) => item.id === propertyId)
    const myReaction = post?.property_reactions?.find((item) => item.user_id === currentUser.id)

    if (myReaction) {
      const { error } = await supabase
        .from('property_reactions')
        .delete()
        .eq('property_id', propertyId)
        .eq('user_id', currentUser.id)

      if (error) {
        Alert.alert('Error', error.message)
        return
      }

      updateLocalReaction(propertyId, null)
      return
    }

    const { error } = await supabase.from('property_reactions').insert({
      property_id: propertyId,
      user_id: currentUser.id,
      reaction: '👍',
    })

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    updateLocalReaction(propertyId, '👍')
  }

  async function toggleFavorite(post) {
    if (!currentUser) return

    const isFavorite = post.property_favorites?.some((item) => item.user_id === currentUser.id)

    if (isFavorite) {
      const { error } = await supabase
        .from('property_favorites')
        .delete()
        .eq('property_id', post.id)
        .eq('user_id', currentUser.id)

      if (error) {
        Alert.alert('Error', error.message)
        return
      }

      setPosts((oldPosts) =>
        oldPosts.map((item) =>
          item.id === post.id
            ? {
              ...item,
              property_favorites: item.property_favorites.filter((fav) => fav.user_id !== currentUser.id),
            }
            : item
        )
      )
      return
    }

    const { error } = await supabase.from('property_favorites').insert({
      property_id: post.id,
      user_id: currentUser.id,
    })

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    setPosts((oldPosts) =>
      oldPosts.map((item) =>
        item.id === post.id
          ? {
            ...item,
            property_favorites: [
              ...(item.property_favorites || []),
              {
                id: `${post.id}-${currentUser.id}`,
                property_id: post.id,
                user_id: currentUser.id,
              },
            ],
          }
          : item
      )
    )
  }

  async function sharePost(post) {
    try {
      await Share.share({
        message: `${post.title}\nRent: ৳ ${post.price}\nLocation: ${post.location || 'Location not added'}\n\n${post.description || ''}`,
      })
    } catch (_error) {
      Alert.alert('Share unavailable', 'Could not open share options right now.')
    }
  }

  function openComments(post) {
    navigation.navigate('Home', {
      openCommentsForPostId: String(post.id),
      openCommentsForPost: post,
      openCommentsRequestId: `ads-management-${post.id}-${Date.now()}`,
    })
  }

  async function deletePost(post) {
    Alert.alert(
      'Delete ad',
      'This will remove the post from your feed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const previousPosts = posts
            setPosts((currentPosts) => currentPosts.filter((item) => item.id !== post.id))

            const propertyId = String(post.id)

            try {
              const { data: comments } = await supabase
                .from('property_comments')
                .select('id')
                .eq('property_id', propertyId)

              const commentIds = (comments || []).map((item) => item.id)

              if (commentIds.length) {
                await supabase
                  .from('property_comment_likes')
                  .delete()
                  .in('comment_id', commentIds)
              }

              await supabase.from('property_comments').delete().eq('property_id', propertyId)
              await supabase.from('property_reactions').delete().eq('property_id', propertyId)
              await supabase.from('property_favorites').delete().eq('property_id', propertyId)
              await supabase.from('notifications').delete().eq('property_id', propertyId)

              const { error } = await supabase
                .from('properties')
                .delete()
                .eq('id', post.id)
                .eq('owner_id', currentUser?.id)

              if (error) {
                throw error
              }
            } catch (error) {
              setPosts(previousPosts)
              Alert.alert('Delete failed', error.message)
            }
          },
        },
      ]
    )
  }

  function openPostActions(post) {
    Alert.alert(
      'Manage ad',
      post.title || 'Property post',
      [
        {
          text: 'Edit ad',
          onPress: () => navigation.navigate('CreatePost', { post }),
        },
        {
          text: 'Open comments',
          onPress: () => openComments(post),
        },
        {
          text: 'View details',
          onPress: () => navigation.navigate('Property', { property: post }),
        },
        {
          text: 'Share',
          onPress: () => sharePost(post),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deletePost(post),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 16,
            marginBottom: 18,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#0f172a' }}>
                Ads Management
              </Text>
              <Text style={{ color: '#64748b', marginTop: 4 }}>
                {posts.length} {posts.length === 1 ? 'post' : 'posts'} published
              </Text>
            </View>

            {userType === 'property_owner' ? (
              <TouchableOpacity
                onPress={() => navigation.navigate('CreatePost')}
                style={{
                  backgroundColor: '#1877F2',
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900', marginLeft: 4 }}>
                  New ad
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {userType !== 'property_owner' ? (
            <View
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                padding: 14,
              }}
            >
              <Text style={{ color: '#334155', lineHeight: 20 }}>
                Switch your account type to Property owner from Settings to create and manage ads here.
              </Text>
            </View>
          ) : posts.length === 0 ? (
            <View
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                paddingVertical: 22,
                paddingHorizontal: 16,
                alignItems: 'center',
              }}
            >
              <Ionicons name="newspaper-outline" size={26} color="#94a3b8" />
              <Text style={{ color: '#0f172a', fontWeight: '800', marginTop: 10 }}>
                No ads yet
              </Text>
              <Text style={{ color: '#64748b', marginTop: 6, textAlign: 'center' }}>
                Your property posts will appear here as soon as you publish one.
              </Text>
            </View>
          ) : null}
        </View>

        {posts.map((item) => (
          <PostCard
            key={item.id}
            item={item}
            currentUser={currentUser}
            onToggleLike={toggleLike}
            onOpenComments={openComments}
            onToggleFavorite={toggleFavorite}
            onShare={sharePost}
            onOpenMedia={openMedia}
            onOpenOwnerProfile={() => {}}
            onPressMore={openPostActions}
          />
        ))}
      </ScrollView>

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        initialIndex={mediaViewer.index}
        onClose={closeMediaViewer}
      />
    </SafeAreaView>
  )
}
