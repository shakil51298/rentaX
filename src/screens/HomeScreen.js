import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  PanResponder,
  ScrollView,
  TextInput,
  Modal,
  Share,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import {
  createNotification,
  getUnreadNotificationCount,
} from '../lib/notifications'
import { playNotificationSound } from '../lib/sounds'
import MediaViewer from '../components/common/MediaViewer'
import PostCard from '../components/home/PostCard'
import CommentItem from '../components/home/CommentItem'
import BottomNavBar from '../components/navigation/BottomNavBar'
import SwipeTabView from '../components/navigation/SwipeTabView'
import {
  appendCommentToTree,
  buildCommentThread,
  collectCommentIds,
  enrichCommentsWithProfiles,
  fetchCommentProfilesByUserId,
  getCommentAuthorName,
  removeCommentFromTree,
  updateCommentTree,
} from '../lib/commentUtils'
import { getUserAvatarUrl, getUserDisplayName } from '../lib/userDisplay'
import { fetchPropertiesWithProfiles } from '../lib/properties'

export default function HomeScreen({ navigation, route }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [commentModal, setCommentModal] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [replyTarget, setReplyTarget] = useState(null)
  const [commentLoading, setCommentLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0)
  const [messageUnreadCount, setMessageUnreadCount] = useState(0)
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })
  const reopenCommentsOnFocus = useRef(false)
  const handledCommentRouteRequest = useRef(null)
  const commentReturnRoute = useRef(null)

  useEffect(() => {
    loadUser()
    loadProperties()
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadUser()
    }, [])
  )

  useFocusEffect(
    useCallback(() => {
      if (!reopenCommentsOnFocus.current || !selectedPost?.id) return

      reopenCommentsOnFocus.current = false
      setCommentModal(true)
      loadComments(selectedPost.id)
    }, [selectedPost])
  )

  useFocusEffect(
    useCallback(() => {
      const params = route?.params || {}
      const postId = params.openCommentsForPostId || params.openCommentsForPost?.id

      if (!postId) return undefined

      const requestId = params.openCommentsRequestId || `${postId}-${params.openCommentsTargetCommentId || ''}`

      if (handledCommentRouteRequest.current === requestId) return undefined

      handledCommentRouteRequest.current = requestId
      let isActive = true

      async function openRouteCommentSheet() {
        let post =
          params.openCommentsForPost ||
          properties.find((item) => String(item.id) === String(postId)) ||
          null

        if (!post) {
          const { data } = await supabase
            .from('properties')
            .select('*')
            .eq('id', postId)
            .maybeSingle()

          post = data || { id: postId }
        }

        if (!isActive) return

        commentReturnRoute.current = params.openCommentsReturnTo || null
        setSelectedPost(post)
        setReplyTarget(null)
        setCommentText('')
        setCommentModal(true)
        loadComments(post.id)

        navigation.setParams({
          openCommentsForPostId: undefined,
          openCommentsForPost: undefined,
          openCommentsTargetCommentId: undefined,
          openCommentsRequestId: undefined,
          openCommentsReturnTo: undefined,
        })
      }

      openRouteCommentSheet()

      return () => {
        isActive = false
      }
    }, [navigation, properties, route?.params])
  )

  async function refreshMessageBadge(userId) {
    if (!userId) {
      setMessageUnreadCount(0)
      return
    }

    const { count, error } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .is('seen_at', null)

    if (!error) {
      setMessageUnreadCount(count || 0)
    }
  }

  useEffect(() => {
    if (!currentUser?.id) {
      setMessageUnreadCount(0)
      return undefined
    }

    refreshMessageBadge(currentUser.id)

    const channel = supabase
      .channel(`home-message-badge-${currentUser.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        (payload) => {
          if (payload.new?.sender_id !== currentUser.id) {
            playNotificationSound()
          }

          refreshMessageBadge(currentUser.id)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) {
      setNotificationUnreadCount(0)
      return undefined
    }

    refreshNotificationBadge(currentUser.id)

    const channelName = `home-notifications-${currentUser.id}-${Date.now()}-${Math.random()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${currentUser.id}`,
        },
        () => {
          playNotificationSound()
          refreshNotificationBadge(currentUser.id)
        }
      )
      .subscribe()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!commentModal || !selectedPost?.id) return undefined

    let refreshTimer = null
    const postId = selectedPost.id
    const refreshCommentsSilently = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }

      refreshTimer = setTimeout(() => {
        loadComments(postId, false)
      }, 250)
    }

    const channelName = `property-comments-${postId}-${Date.now()}-${Math.random()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'property_comments',
          filter: `property_id=eq.${postId}`,
        },
        refreshCommentsSilently
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'property_comments',
          filter: `property_id=eq.${postId}`,
        },
        refreshCommentsSilently
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'property_comments',
        },
        refreshCommentsSilently
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'property_comment_likes',
        },
        refreshCommentsSilently
      )
      .subscribe()

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }

      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [commentModal, selectedPost?.id])

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user)
  }

  async function refreshNotificationBadge(userId = currentUser?.id) {
    setNotificationUnreadCount(await getUnreadNotificationCount(userId))
  }

  async function loadProperties() {
    setLoading(true)

    try {
      setProperties(await fetchPropertiesWithProfiles())
    } catch (error) {
      Alert.alert('Error', error.message)
    }

    setLoading(false)
  }

  async function selectReaction(propertyId, reaction) {
    if (!currentUser) return

    const { error } = await supabase
      .from('property_reactions')
      .upsert(
        {
          property_id: propertyId,
          user_id: currentUser.id,
          reaction,
        },
        {
          onConflict: 'property_id,user_id',
        }
      )

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    updateLocalReaction(propertyId, reaction)
  }

  function updateLocalReaction(propertyId, reaction) {
    setProperties((oldPosts) =>
      oldPosts.map((post) => {
        if (post.id !== propertyId) return post

        const oldReactions = post.property_reactions || []

        const withoutMine = oldReactions.filter(
          (item) => item.user_id !== currentUser.id
        )

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
              id: `${propertyId}-${currentUser.id}`,
              property_id: propertyId,
              user_id: currentUser.id,
              reaction,
            },
          ],
        }
      })
    )
  }

  async function toggleLike(propertyId) {
    if (!currentUser) return

    const post = properties.find((item) => item.id === propertyId)

    const myReaction = post?.property_reactions?.find(
      (item) => item.user_id === currentUser.id
    )

    // If already reacted with anything, clicking like button removes reaction
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

    // If no reaction, default like
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
    await createNotification({
      recipientId: post?.owner_id,
      actorId: currentUser.id,
      type: 'property_like',
      propertyId,
      title: 'New like',
      body: 'liked your post',
      eventKey: `property_like:${propertyId}:${currentUser.id}`,
    })
  }

  async function reactToPost(propertyId, reaction) {
    if (!currentUser) return

    const post = properties.find((item) => item.id === propertyId)

    const myReaction = post?.property_reactions?.find(
      (item) => item.user_id === currentUser.id
    )

    // if already same reaction, remove reaction
    if (myReaction?.reaction === reaction) {
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

    // if different reaction, update/insert reaction
    const { error } = await supabase
      .from('property_reactions')
      .upsert(
        {
          property_id: propertyId,
          user_id: currentUser.id,
          reaction,
        },
        {
          onConflict: 'property_id,user_id',
        }
      )

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    updateLocalReaction(propertyId, reaction)
    await createNotification({
      recipientId: post?.owner_id,
      actorId: currentUser.id,
      type: 'property_like',
      propertyId,
      title: 'New reaction',
      body: 'reacted to your post',
      eventKey: `property_reaction:${propertyId}:${currentUser.id}`,
    })

  }

  async function loadComments(propertyId, showLoader = true) {
    if (!propertyId) return

    if (showLoader) {
      setCommentLoading(true)
    }

    const { data, error } = await supabase
      .from('property_comments')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true })

    if (error) {
      if (showLoader) {
        setCommentLoading(false)
        Alert.alert('Error', error.message)
      }

      return
    }

    const commentIds = (data || []).map((comment) => String(comment.id))
    const profilesByUserId = await fetchCommentProfilesByUserId(
      (data || []).map((comment) => comment.user_id)
    )
    let likes = []

    if (commentIds.length > 0) {
      const { data: likesData, error: likesError } = await supabase
        .from('property_comment_likes')
        .select('*')
        .in('comment_id', commentIds)

      if (!likesError) {
        likes = likesData || []
      }
    }

    const enrichedComments = enrichCommentsWithProfiles(data || [], profilesByUserId)
    const likesByCommentId = likes.reduce((groupedLikes, like) => {
      const commentId = String(like.comment_id)

      return {
        ...groupedLikes,
        [commentId]: [...(groupedLikes[commentId] || []), like],
      }
    }, {})

    const commentsWithLikes = enrichedComments.map((comment) => ({
      ...comment,
      property_comment_likes: likesByCommentId[String(comment.id)] || [],
    }))

    setComments(buildCommentThread(commentsWithLikes))

    if (showLoader) {
      setCommentLoading(false)
    }
  }

  async function openComments(post) {
    commentReturnRoute.current = null
    setSelectedPost(post)
    setReplyTarget(null)
    setCommentModal(true)
    loadComments(post.id)
  }

  async function addComment() {
    if (!commentText.trim() || !selectedPost) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const profilesByUserId = await fetchCommentProfilesByUserId([user.id])
    const profile = profilesByUserId[user.id]
    const basePayload = {
      property_id: selectedPost.id,
      user_id: user.id,
      user_email: user.email,
      comment: commentText,
    }

    const enhancedPayload = {
      ...basePayload,
      user_name: profile?.display_name || getUserDisplayName(user),
      avatar_url: profile?.avatar_url || getUserAvatarUrl(user),
      parent_comment_id: replyTarget ? String(replyTarget.id) : null,
    }

    const { data: insertedComment, error } = await supabase
      .from('property_comments')
      .insert(enhancedPayload)
      .select('*')
      .single()

    if (error) {
      if (!replyTarget) {
        const { data: fallbackComment, error: fallbackError } = await supabase
          .from('property_comments')
          .insert(basePayload)
          .select('*')
          .single()

        if (!fallbackError) {
          setCommentText('')
          setReplyTarget(null)
          setComments((oldComments) =>
            appendCommentToTree(
              oldComments,
              enrichCommentsWithProfiles([
                {
                  ...fallbackComment,
                  property_comment_likes: [],
                },
              ], profilesByUserId)[0]
            )
          )
          adjustPostCommentCount(selectedPost.id, 1)
          await createNotification({
            recipientId: replyTarget?.user_id || selectedPost.owner_id,
            actorId: user.id,
            type: replyTarget ? 'comment_reply' : 'property_comment',
            propertyId: selectedPost.id,
            commentId: fallbackComment.id,
            title: replyTarget ? 'New reply' : 'New comment',
            body: replyTarget ? 'replied to your comment' : 'commented on your post',
            eventKey: `comment:${fallbackComment.id}`,
          })
          return
        }
      }

      Alert.alert('Error', error.message)
      return
    }

    setCommentText('')
    setReplyTarget(null)
    setComments((oldComments) =>
      appendCommentToTree(
        oldComments,
        enrichCommentsWithProfiles([
          {
            ...insertedComment,
            property_comment_likes: [],
          },
        ], profilesByUserId)[0]
      )
    )
    adjustPostCommentCount(selectedPost.id, 1)
    await createNotification({
      recipientId: replyTarget?.user_id || selectedPost.owner_id,
      actorId: user.id,
      type: replyTarget ? 'comment_reply' : 'property_comment',
      propertyId: selectedPost.id,
      commentId: insertedComment.id,
      title: replyTarget ? 'New reply' : 'New comment',
      body: replyTarget ? 'replied to your comment' : 'commented on your post',
      eventKey: `comment:${insertedComment.id}`,
    })
  }

  async function toggleCommentLike(comment) {
    if (!currentUser) return

    const likes = comment.property_comment_likes || []
    const isLiked = likes.some((like) => like.user_id === currentUser.id)
    const commentId = String(comment.id)

    if (isLiked) {
      const { error } = await supabase
        .from('property_comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', currentUser.id)

      if (error) {
        Alert.alert('Database update needed', error.message)
        return
      }

      setComments((oldComments) =>
        updateCommentTree(oldComments, commentId, (currentComment) => ({
          ...currentComment,
          property_comment_likes: (
            currentComment.property_comment_likes || []
          ).filter((like) => like.user_id !== currentUser.id),
        }))
      )
    } else {
      const { error } = await supabase
        .from('property_comment_likes')
        .insert({
          comment_id: commentId,
          user_id: currentUser.id,
        })

      if (error) {
        Alert.alert('Database update needed', error.message)
        return
      }

      setComments((oldComments) =>
        updateCommentTree(oldComments, commentId, (currentComment) => ({
          ...currentComment,
          property_comment_likes: [
            ...(currentComment.property_comment_likes || []),
            {
              id: `${commentId}-${currentUser.id}`,
              comment_id: commentId,
              user_id: currentUser.id,
            },
          ],
        }))
      )
      await createNotification({
        recipientId: comment.user_id,
        actorId: currentUser.id,
        type: 'comment_like',
        propertyId: selectedPost?.id,
        commentId,
        title: 'New comment like',
        body: 'liked your comment',
        eventKey: `comment_like:${commentId}:${currentUser.id}`,
      })
    }
  }

  function adjustPostCommentCount(propertyId, amount) {
    setProperties((oldPosts) =>
      oldPosts.map((post) => {
        if (post.id !== propertyId) return post

        const oldComments = post.property_comments || []

        if (amount > 0) {
          return {
            ...post,
            property_comments: [
              ...oldComments,
              { id: `local-comment-${Date.now()}` },
            ],
          }
        }

        return {
          ...post,
          property_comments: oldComments.slice(0, Math.max(oldComments.length - 1, 0)),
        }
      })
    )
  }

  function deleteComment(comment) {
    if (!currentUser || String(comment.user_id) !== currentUser.id) return

    Alert.alert(
      'Delete comment?',
      'This will remove your comment from this post.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => confirmDeleteComment(comment),
        },
      ]
    )
  }

  async function confirmDeleteComment(comment) {
    const commentId = String(comment.id)
    const commentIds = collectCommentIds(comment)

    await supabase
      .from('property_comment_likes')
      .delete()
      .in('comment_id', commentIds)

    const { data: deletedComments, error } = await supabase
      .from('property_comments')
      .delete()
      .in('id', commentIds)
      .select('id')

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    if (!deletedComments?.length) {
      Alert.alert(
        'Delete not saved',
        'Supabase did not delete the comment. Check the delete policy for property_comments.'
      )
      return
    }

    setComments((oldComments) => removeCommentFromTree(oldComments, commentId))

    if (replyTarget && commentIds.includes(String(replyTarget.id))) {
      setReplyTarget(null)
      setCommentText('')
    }

    if (selectedPost) {
      adjustPostCommentCount(selectedPost.id, -deletedComments.length)
    }
  }

  async function toggleFavorite(post) {
    if (!currentUser) return

    const isFavorite = post.property_favorites?.some(
      (item) => item.user_id === currentUser.id
    )

    if (isFavorite) {
      await supabase
        .from('property_favorites')
        .delete()
        .eq('property_id', post.id)
        .eq('user_id', currentUser.id)

      setProperties((oldPosts) =>
        oldPosts.map((item) => {
          if (item.id !== post.id) return item

          return {
            ...item,
            property_favorites: item.property_favorites.filter(
              (fav) => fav.user_id !== currentUser.id
            ),
          }
        })
      )
    } else {
      await supabase.from('property_favorites').insert({
        property_id: post.id,
        user_id: currentUser.id,
      })

      setProperties((oldPosts) =>
        oldPosts.map((item) => {
          if (item.id !== post.id) return item

          return {
            ...item,
            property_favorites: [
              ...(item.property_favorites || []),
              {
                id: Date.now().toString(),
                user_id: currentUser.id,
              },
            ],
          }
        })
      )
      await createNotification({
        recipientId: post.owner_id,
        actorId: currentUser.id,
        type: 'property_favorite',
        propertyId: post.id,
        title: 'New favorite',
        body: 'saved your post',
        eventKey: `property_favorite:${post.id}:${currentUser.id}`,
      })
    }
  }

  async function sharePost(post) {
    await Share.share({
      message: `${post.title}\nRent: ৳ ${post.price}\nLocation: ${post.location || ''}`,
    })
  }

  const openMediaViewer = useCallback((media, index) => {
    setMediaViewer({
      visible: true,
      media,
      index,
    })
  }, [])

  const closeMediaViewer = useCallback(() => {
    setMediaViewer((current) => ({
      ...current,
      visible: false,
    }))
  }, [])

  const openOwnerProfile = useCallback((post) => {
    const ownerProfile = post.owner_profile || {}

    navigation.navigate('OwnerProfile', {
      owner: {
        id: post.owner_id,
        email: ownerProfile.email || post.owner_email,
        name: ownerProfile.display_name || post.owner_name,
      },
    })
  }, [navigation])

  const openCommentProfile = useCallback((comment) => {
    if (!comment?.user_id) return

    reopenCommentsOnFocus.current = true
    closeCommentModal({ skipReturn: true })

    navigation.navigate('OwnerProfile', {
      owner: {
        id: comment.user_id,
        email: comment.profile?.email || comment.user_email,
        name: getCommentAuthorName(comment),
      },
    })
  }, [navigation])

  function closeCommentModal(options = {}) {
    setCommentModal(false)
    setReplyTarget(null)
    setCommentText('')

    if (!options.skipReturn && commentReturnRoute.current) {
      const returnRoute = commentReturnRoute.current
      commentReturnRoute.current = null
      navigation.navigate(returnRoute)
    }
  }

  const commentSheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 14 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 70 || gestureState.vy > 0.75) {
          closeCommentModal()
        }
      },
    })
  ).current

  const renderPost = useCallback(({ item }) => (
    <PostCard
      item={item}
      currentUser={currentUser}
      onToggleLike={toggleLike}
      onOpenComments={openComments}
      onToggleFavorite={toggleFavorite}
      onShare={sharePost}
      onOpenMedia={openMediaViewer}
      onOpenOwnerProfile={openOwnerProfile}
      onOpenPost={(post) => navigation.navigate('Property', { property: post })}
    />
  ), [currentUser, navigation, openMediaViewer, openOwnerProfile])

  const showInitialLoader = loading && properties.length === 0
  const canCreatePosts = currentUser?.user_metadata?.user_type === 'property_owner'

  function CreatePostBox() {
    return (
      <View style={{ backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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

          <TouchableOpacity onPress={() => navigation.navigate('CreatePost')} style={{ marginLeft: 10 }}>
            <Ionicons name="images" size={28} color="green" />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SwipeTabView
        navigation={navigation}
        activeTab="home"
        disabled={commentModal || mediaViewer.visible}
      >
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

      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        ListHeaderComponent={canCreatePosts ? <CreatePostBox /> : null}
        ListEmptyComponent={
          showInitialLoader ? <ActivityIndicator style={{ marginTop: 30 }} /> : null
        }
        contentContainerStyle={{ paddingBottom: 80 }}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={loading && properties.length > 0}
        onRefresh={loadProperties}
        removeClippedSubviews
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={60}
        windowSize={7}
      />

      <Modal
        visible={commentModal}
        animationType="slide"
        onRequestClose={closeCommentModal}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View
            {...commentSheetPanResponder.panHandlers}
            style={{
              paddingHorizontal: 14,
              paddingTop: 8,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: '#eee',
            }}
          >
            <View
              style={{
                width: 42,
                height: 5,
                borderRadius: 3,
                backgroundColor: '#d0d0d0',
                alignSelf: 'center',
                marginBottom: 10,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '700' }}>Comments</Text>

              <TouchableOpacity onPress={closeCommentModal}>
                <Ionicons name="close" size={28} color="#111" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
          >
            {commentLoading ? (
              <ActivityIndicator style={{ marginTop: 30 }} />
            ) : comments.length > 0 ? (
              comments.map((item) => (
                <CommentItem
                  key={item.id}
                  comment={item}
                  currentUser={currentUser}
                  onLike={toggleCommentLike}
                  onReply={setReplyTarget}
                  onDelete={deleteComment}
                  onOpenProfile={openCommentProfile}
                />
              ))
            ) : (
              <Text style={{ color: '#666', textAlign: 'center', marginTop: 30 }}>
                No comments yet
              </Text>
            )}
          </ScrollView>

          {replyTarget ? (
            <View
              style={{
                backgroundColor: '#f7f7f7',
                borderTopWidth: 1,
                borderTopColor: '#eee',
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ color: '#555', flex: 1 }}>
                Replying to {getCommentAuthorName(replyTarget)}
              </Text>

              <TouchableOpacity onPress={() => setReplyTarget(null)}>
                <Ionicons name="close-circle" size={21} color="#777" />
              </TouchableOpacity>
            </View>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              padding: 12,
              borderTopWidth: 1,
              borderTopColor: '#eee',
            }}
          >
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder={replyTarget ? 'Write a reply...' : 'Write a comment...'}
              multiline
              style={{
                flex: 1,
                backgroundColor: '#f1f1f1',
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 9,
                maxHeight: 100,
              }}
            />

            <TouchableOpacity onPress={addComment} style={{ padding: 10 }}>
              <Ionicons name="send" size={24} color="#1877F2" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        initialIndex={mediaViewer.index}
        onClose={closeMediaViewer}
      />

      <BottomNavBar
        navigation={navigation}
        activeTab="home"
        messageUnreadCount={messageUnreadCount}
        notificationUnreadCount={notificationUnreadCount}
      />
      </SwipeTabView>
    </SafeAreaView>
  )
}
