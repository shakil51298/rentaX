import { supabase } from './supabase'

export function getReviewSummary(reviews = []) {
  const total = reviews.length
  const average = total
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total
    : 0

  return {
    total,
    average,
    averageLabel: total ? average.toFixed(1) : 'New',
  }
}

export function getRelationshipSourceLabel(source) {
  if (source === 'rental') return 'Rented'
  if (source === 'visit') return 'Visited'
  return 'Chatted'
}

async function hasDirectChat(reviewerId, revieweeId) {
  const { data: conversations, error } = await supabase
    .from('chat_conversations')
    .select('id')
    .or(
      `and(participant_one_id.eq.${reviewerId},participant_two_id.eq.${revieweeId}),and(participant_one_id.eq.${revieweeId},participant_two_id.eq.${reviewerId})`
    )
    .limit(5)

  if (error || !conversations?.length) return false

  const conversationIds = conversations.map((item) => item.id).filter(Boolean)

  if (!conversationIds.length) return false

  const { data: messages, error: messageError } = await supabase
    .from('chat_messages')
    .select('id')
    .in('conversation_id', conversationIds)
    .limit(1)

  return !messageError && Boolean(messages?.length)
}

async function hasAcceptedVisit(reviewerId, revieweeId) {
  const { data, error } = await supabase
    .from('property_visit_requests')
    .select('id')
    .or(
      `and(requester_id.eq.${reviewerId},owner_id.eq.${revieweeId}),and(requester_id.eq.${revieweeId},owner_id.eq.${reviewerId})`
    )
    .in('status', ['accepted', 'rescheduled', 'completed'])
    .limit(1)

  return !error && Boolean(data?.length)
}

async function hasAcceptedRental(reviewerId, revieweeId) {
  const { data, error } = await supabase
    .from('property_applications')
    .select('id')
    .or(
      `and(applicant_id.eq.${reviewerId},owner_id.eq.${revieweeId}),and(applicant_id.eq.${revieweeId},owner_id.eq.${reviewerId})`
    )
    .eq('status', 'accepted')
    .limit(1)

  return !error && Boolean(data?.length)
}

export async function fetchRealReviewEligibility({ reviewerId, revieweeId }) {
  if (!reviewerId || !revieweeId || String(reviewerId) === String(revieweeId)) {
    return {
      eligible: false,
      sources: [],
      primarySource: null,
    }
  }

  const [chat, visit, rental] = await Promise.all([
    hasDirectChat(reviewerId, revieweeId).catch(() => false),
    hasAcceptedVisit(reviewerId, revieweeId).catch(() => false),
    hasAcceptedRental(reviewerId, revieweeId).catch(() => false),
  ])
  const sources = [
    rental ? 'rental' : null,
    visit ? 'visit' : null,
    chat ? 'chat' : null,
  ].filter(Boolean)

  return {
    eligible: sources.length > 0,
    sources,
    primarySource: sources[0] || null,
  }
}

export async function fetchUserReviewState({ revieweeId, reviewerId }) {
  if (!revieweeId) {
    return {
      reviews: [],
      summary: getReviewSummary([]),
      eligibility: { eligible: false, sources: [], primarySource: null },
      myReview: null,
      setupNeeded: false,
    }
  }

  const { data: reviews, error } = await supabase
    .from('user_reviews')
    .select('*')
    .eq('reviewee_id', revieweeId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(25)

  if (error) {
    return {
      reviews: [],
      summary: getReviewSummary([]),
      eligibility: { eligible: false, sources: [], primarySource: null },
      myReview: null,
      setupNeeded: /user_reviews|relationship_source|rating/i.test(error.message || ''),
    }
  }

  const reviewerIds = [...new Set((reviews || []).map((item) => item.reviewer_id).filter(Boolean))]
  const { data: profiles } = reviewerIds.length
    ? await supabase
        .from('user_profiles')
        .select('user_id, email, display_name, avatar_url, is_verified, owner_verification_status, rentalx_id')
        .in('user_id', reviewerIds)
    : { data: [] }
  const profilesById = (profiles || []).reduce((itemsById, profile) => ({
    ...itemsById,
    [profile.user_id]: profile,
  }), {})
  const enrichedReviews = (reviews || []).map((review) => ({
    ...review,
    reviewer_profile: profilesById[review.reviewer_id] || null,
  }))
  const eligibility = await fetchRealReviewEligibility({ reviewerId, revieweeId }).catch(() => ({
    eligible: false,
    sources: [],
    primarySource: null,
  }))

  return {
    reviews: enrichedReviews,
    summary: getReviewSummary(enrichedReviews),
    eligibility,
    myReview: reviewerId
      ? enrichedReviews.find((review) => String(review.reviewer_id) === String(reviewerId)) || null
      : null,
    setupNeeded: false,
  }
}

export async function saveUserReview({
  reviewerId,
  revieweeId,
  rating,
  body,
  relationshipSource = 'chat',
}) {
  const nextRating = Number(rating)
  const trimmedBody = String(body || '').trim()

  if (!reviewerId || !revieweeId) {
    throw new Error('Please log in before reviewing this user.')
  }

  if (String(reviewerId) === String(revieweeId)) {
    throw new Error('You cannot review your own profile.')
  }

  if (!Number.isInteger(nextRating) || nextRating < 1 || nextRating > 5) {
    throw new Error('Choose a rating from 1 to 5 stars.')
  }

  if (trimmedBody.length > 1000) {
    throw new Error('Keep the review under 1000 characters.')
  }

  const payload = {
    reviewer_id: reviewerId,
    reviewee_id: revieweeId,
    rating: nextRating,
    body: trimmedBody || null,
    relationship_source: relationshipSource || 'chat',
    is_public: true,
    updated_at: new Date().toISOString(),
  }
  const { data: existingReview, error: existingError } = await supabase
    .from('user_reviews')
    .select('id')
    .eq('reviewer_id', reviewerId)
    .eq('reviewee_id', revieweeId)
    .maybeSingle()

  if (existingError && !/No rows/i.test(existingError.message || '')) {
    throw existingError
  }

  if (existingReview?.id) {
    const { error } = await supabase
      .from('user_reviews')
      .update(payload)
      .eq('id', existingReview.id)
      .eq('reviewer_id', reviewerId)

    if (error) throw error
    return
  }

  const { error } = await supabase.from('user_reviews').insert(payload)

  if (error) throw error
}
