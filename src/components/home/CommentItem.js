import { memo } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../common/Avatar'
import { getCommentAuthorName, getCommentAvatarUrl } from '../../lib/commentUtils'
import { timeAgo } from '../../lib/time'
import { useAppSettings } from '../../lib/appSettings'

const CommentItem = memo(function CommentItem({
  comment,
  currentUser,
  onLike,
  onReply,
  onDelete,
  onOpenProfile,
  depth = 0,
}) {
  const { theme } = useAppSettings()
  const authorName = getCommentAuthorName(comment)
  const avatarUrl = getCommentAvatarUrl(comment)
  const likes = comment.property_comment_likes || []
  const isLiked = likes.some((like) => like.user_id === currentUser?.id)
  const isOwner = currentUser?.id && String(comment.user_id) === currentUser.id
  const canOpenProfile = Boolean(comment.user_id)
  const replyIndent = depth > 0 ? 34 : 0

  return (
    <View style={{ marginLeft: replyIndent, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <TouchableOpacity
          activeOpacity={0.82}
          disabled={!canOpenProfile}
          onPress={() => onOpenProfile(comment)}
        >
          <Avatar
            name={authorName}
            uri={avatarUrl}
            size={depth > 0 ? 30 : 36}
            backgroundColor="#dfe3ee"
            textColor="#38445a"
          />
        </TouchableOpacity>

        <View style={{ marginLeft: 8, flex: 1 }}>
          <TouchableOpacity
            activeOpacity={0.82}
            onLongPress={() => {
              if (isOwner) {
                onDelete(comment)
              }
            }}
            style={{
              backgroundColor: theme.surfaceMuted,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <TouchableOpacity
              activeOpacity={0.82}
              disabled={!canOpenProfile}
              onPress={() => onOpenProfile(comment)}
              style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}
            >
              <Text style={{ fontWeight: '700', fontSize: 13, color: theme.text }}>
                {authorName}
              </Text>

              {comment.is_verified ? (
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color="#1877F2"
                  style={{ marginLeft: 4 }}
                />
              ) : null}
            </TouchableOpacity>

            <Text style={{ marginTop: 3, fontSize: 14, lineHeight: 19, color: theme.text }}>
              {comment.comment}
            </Text>
          </TouchableOpacity>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              marginTop: 5,
              paddingLeft: 8,
            }}
          >
            <Text style={{ color: theme.mutedText, fontSize: 12 }}>
              {timeAgo(comment.created_at)}
            </Text>

            <TouchableOpacity onPress={() => onLike(comment)}>
              <Text
                style={{
                  color: isLiked ? theme.accent : theme.mutedText,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {isLiked ? 'Unlike' : 'Like'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onReply(comment)}>
              <Text style={{ color: theme.mutedText, fontWeight: '700', fontSize: 12 }}>
                Reply
              </Text>
            </TouchableOpacity>

            {likes.length > 0 ? (
              <Text style={{ color: theme.mutedText, fontSize: 12 }}>
                👍 {likes.length}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {comment.replies?.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          currentUser={currentUser}
          onLike={onLike}
          onReply={onReply}
          onDelete={onDelete}
          onOpenProfile={onOpenProfile}
          depth={depth + 1}
        />
      ))}
    </View>
  )
})

export default CommentItem
