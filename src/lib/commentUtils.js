import { supabase } from './supabase'
import { displayNameFromEmail } from './userDisplay'

export function getCommentAuthorName(comment) {
  return (
    comment.profile?.display_name ||
    comment.user_name ||
    comment.owner_name ||
    comment.full_name ||
    displayNameFromEmail(comment.user_email)
  )
}

export function getCommentAvatarUrl(comment) {
  return (
    comment.profile?.avatar_url ||
    comment.avatar_url ||
    comment.user_avatar ||
    comment.profile_picture ||
    comment.photo_url ||
    null
  )
}

export function getCommentParentId(comment) {
  return comment.parent_comment_id || comment.parent_id || comment.reply_to_comment_id || null
}

export async function fetchCommentProfilesByUserId(userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]

  if (uniqueUserIds.length === 0) return {}

  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, email, display_name, avatar_url, is_verified')
    .in('user_id', uniqueUserIds)

  if (error) return {}

  return (data || []).reduce((profilesById, profile) => {
    profilesById[profile.user_id] = profile
    return profilesById
  }, {})
}

export function enrichCommentsWithProfiles(comments, profilesByUserId) {
  return comments.map((comment) => {
    const profile = profilesByUserId[comment.user_id]

    return {
      ...comment,
      profile: profile || null,
      user_name: profile?.display_name || comment.user_name,
      avatar_url: profile?.avatar_url || comment.avatar_url,
      is_verified: profile?.is_verified ?? comment.is_verified,
    }
  })
}

export function buildCommentThread(rawComments) {
  const commentsById = new Map()
  const rootComments = []

  rawComments.forEach((comment) => {
    commentsById.set(String(comment.id), {
      ...comment,
      replies: [],
    })
  })

  commentsById.forEach((comment) => {
    const parentId = getCommentParentId(comment)

    if (parentId && commentsById.has(String(parentId))) {
      commentsById.get(String(parentId)).replies.push(comment)
    } else {
      rootComments.push(comment)
    }
  })

  return rootComments
}

export function updateCommentTree(comments, commentId, updater) {
  return comments.map((comment) => {
    if (String(comment.id) === String(commentId)) {
      return updater(comment)
    }

    return {
      ...comment,
      replies: updateCommentTree(comment.replies || [], commentId, updater),
    }
  })
}

export function removeCommentFromTree(comments, commentId) {
  return comments
    .filter((comment) => String(comment.id) !== String(commentId))
    .map((comment) => ({
      ...comment,
      replies: removeCommentFromTree(comment.replies || [], commentId),
    }))
}

export function appendCommentToTree(comments, newComment) {
  const commentWithReplies = {
    ...newComment,
    property_comment_likes: newComment.property_comment_likes || [],
    replies: newComment.replies || [],
  }
  const parentId = getCommentParentId(commentWithReplies)

  if (!parentId) {
    return [...comments, commentWithReplies]
  }

  function insertIntoBranch(branch) {
    let inserted = false

    const items = branch.map((comment) => {
      if (String(comment.id) === String(parentId)) {
        inserted = true

        return {
          ...comment,
          replies: [...(comment.replies || []), commentWithReplies],
        }
      }

      const childResult = insertIntoBranch(comment.replies || [])

      if (childResult.inserted) {
        inserted = true

        return {
          ...comment,
          replies: childResult.items,
        }
      }

      return comment
    })

    return { inserted, items }
  }

  const result = insertIntoBranch(comments)

  return result.inserted ? result.items : [...comments, commentWithReplies]
}

export function collectCommentIds(comment) {
  return [
    String(comment.id),
    ...(comment.replies || []).flatMap((reply) => collectCommentIds(reply)),
  ]
}
