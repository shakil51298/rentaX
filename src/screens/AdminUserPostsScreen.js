import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
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
import { isPrimaryAdmin } from '../lib/admin'
import { createNotification } from '../lib/notifications'
import PostCard from '../components/home/PostCard'
import MediaViewer from '../components/common/MediaViewer'
import { fetchPropertiesWithProfiles } from '../lib/properties'

function ActionRow({ icon, title, subtitle, danger, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: danger ? '#fef2f2' : '#eff6ff',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Ionicons name={icon} size={18} color={danger ? '#dc2626' : '#2563eb'} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? '#dc2626' : '#0f172a', fontWeight: '800', fontSize: 15 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12, lineHeight: 18 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

export default function AdminUserPostsScreen({ navigation, route }) {
  const targetUserId = route?.params?.userId || null
  const ownerName = route?.params?.ownerName || 'User posts'

  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [actionPost, setActionPost] = useState(null)
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })

  const loadPosts = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user || null)
    const allowed = isPrimaryAdmin(user)
    setAuthorized(allowed)

    if (!allowed || !targetUserId) {
      setPosts([])
      setLoading(false)
      return
    }

    try {
      setPosts(await fetchPropertiesWithProfiles({ ownerId: targetUserId, includeBanned: true }))
    } catch (_error) {
      setPosts([])
    }

    setLoading(false)
  }, [targetUserId])

  useFocusEffect(
    useCallback(() => {
      loadPosts()
    }, [loadPosts])
  )

  const postCount = posts.length

  function openMedia(media, index) {
    setMediaViewer({ visible: true, media, index })
  }

  function closeMediaViewer() {
    setMediaViewer({ visible: false, media: [], index: 0 })
  }

  function closeActionSheet() {
    setActionPost(null)
  }

  async function sharePost(post) {
    try {
      await Share.share({
        message: `${post.title}\nRent: ৳ ${post.price}\nLocation: ${post.location || 'Location not added'}\n\n${post.description || ''}`,
      })
    } catch (_error) {}
  }

  async function toggleBanPost(post) {
    if (!post?.id) return

    const nextBanned = !Boolean(post.admin_is_banned)
    const previousPosts = [...posts]
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? {
              ...item,
              admin_is_banned: nextBanned,
              admin_banned_at: nextBanned ? new Date().toISOString() : null,
            }
          : item
      )
    )
    closeActionSheet()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('properties')
      .update({
        admin_is_banned: nextBanned,
        admin_ban_reason: nextBanned ? 'Banned by admin moderation' : null,
        admin_banned_at: nextBanned ? new Date().toISOString() : null,
        admin_banned_by_email: nextBanned ? user?.email || null : null,
      })
      .eq('id', post.id)

    if (error) {
      setPosts(previousPosts)
      Alert.alert('Moderation update failed', error.message)
      return
    }

    if (nextBanned) {
      await createNotification({
        recipientId: post.owner_id,
        actorId: user?.id,
        type: 'property_banned_by_admin',
        propertyId: post.id,
        title: 'Ad hidden by admin',
        body: 'Your ad was hidden from live feeds. Tap to contact customer care.',
        eventKey: `property_banned_by_admin:${post.id}:${Date.now()}`,
        pushData: {
          propertyTitle: post.title || '',
          propertyLocation: post.location || '',
          propertyPrice: post.price || '',
          banReason: 'Banned by admin moderation',
        },
      })
    }
  }

  async function deletePost(post) {
    closeActionSheet()
    Alert.alert(
      'Delete post',
      'This will remove the post and related interactions. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const previousPosts = posts
            setPosts((current) => current.filter((item) => item.id !== post.id))

            try {
              const propertyId = String(post.id)
              const { data: comments } = await supabase
                .from('property_comments')
                .select('id')
                .eq('property_id', propertyId)

              const commentIds = (comments || []).map((item) => item.id)
              if (commentIds.length) {
                await supabase.from('property_comment_likes').delete().in('comment_id', commentIds)
              }

              await supabase.from('property_comments').delete().eq('property_id', propertyId)
              await supabase.from('property_reactions').delete().eq('property_id', propertyId)
              await supabase.from('property_favorites').delete().eq('property_id', propertyId)
              await supabase.from('notifications').delete().eq('property_id', propertyId)

              const { error } = await supabase.from('properties').delete().eq('id', post.id)
              if (error) throw error
            } catch (error) {
              setPosts(previousPosts)
              Alert.alert('Delete failed', error.message)
            }
          },
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

  if (!authorized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 }}>
            <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '900' }}>Admin only</Text>
            <Text style={{ color: '#64748b', marginTop: 8, lineHeight: 20 }}>
              This post moderation page is only available for your first-level admin account.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ color: '#64748b', lineHeight: 20 }}>
            {ownerName} has {postCount} {postCount === 1 ? 'post' : 'posts'}. Admin moderation actions here affect live feeds.
          </Text>
        </View>

        {posts.map((post) => (
          <PostCard
            key={post.id}
            item={post}
            currentUser={currentUser}
            onToggleLike={() => {}}
            onOpenComments={() => {}}
            onToggleFavorite={() => {}}
            onShare={sharePost}
            onOpenMedia={openMedia}
            onOpenOwnerProfile={() => {}}
            onPressMore={setActionPost}
            onOpenPost={(item) => navigation.navigate('Property', { property: item })}
          />
        ))}

        {!posts.length ? (
          <View
            style={{
              marginHorizontal: 16,
              backgroundColor: '#fff',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              padding: 16,
            }}
          >
            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '900' }}>
              No posts found
            </Text>
            <Text style={{ color: '#64748b', marginTop: 6, lineHeight: 20 }}>
              This user does not have any posts yet.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        index={mediaViewer.index}
        onClose={closeMediaViewer}
      />

      <Modal
        visible={Boolean(actionPost)}
        transparent
        animationType="fade"
        onRequestClose={closeActionSheet}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            justifyContent: 'flex-end',
          }}
          onPress={closeActionSheet}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 18,
              paddingTop: 14,
              paddingBottom: 26,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 42,
                height: 5,
                borderRadius: 999,
                backgroundColor: '#dbe4ee',
                marginBottom: 14,
              }}
            />

            <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900' }}>
              Post actions
            </Text>
            <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 20 }}>
              Moderate this listing as admin.
            </Text>

            <View style={{ marginTop: 10 }}>
              <ActionRow
                icon="create-outline"
                title="Edit post"
                subtitle="Open this post in the editor."
                onPress={() => {
                  const post = actionPost
                  closeActionSheet()
                  navigation.navigate('CreatePost', {
                    post,
                    adminEditMode: true,
                  })
                }}
              />
              <ActionRow
                icon={actionPost?.admin_is_banned ? 'eye-outline' : 'ban-outline'}
                title={actionPost?.admin_is_banned ? 'Unban post' : 'Ban post'}
                subtitle={
                  actionPost?.admin_is_banned
                    ? 'Let this post appear in feeds again.'
                    : 'Hide this post from live feeds.'
                }
                onPress={() => toggleBanPost(actionPost)}
              />
              <ActionRow
                icon="open-outline"
                title="Open details"
                subtitle="View the full property page."
                onPress={() => {
                  const post = actionPost
                  closeActionSheet()
                  navigation.navigate('Property', { property: post })
                }}
              />
              <ActionRow
                icon="trash-outline"
                title="Delete post"
                subtitle="Permanently remove this listing."
                danger
                onPress={() => deletePost(actionPost)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
