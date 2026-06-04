import { Audio } from 'expo-av'
import * as Notifications from 'expo-notifications'
import {
  getConversationNotificationSoundId,
  getConversationRingtoneSoundId,
} from './chatPreferences'

export const PHONE_DEFAULT_SOUND_ID = 'phone_default'
export const SILENT_SOUND_ID = 'silent'
export const RENTALX_POP_SOUND_ID = 'rentalx_pop'
export const RENTALX_POP_SOUND_FILE = 'notification.mp3'
export const BRIGHT_CHIME_SOUND_ID = 'bright_chime'
export const BRIGHT_CHIME_SOUND_FILE = 'bright_chime.wav'
export const CLASSIC_RING_SOUND_ID = 'classic_ring'
export const CLASSIC_RING_SOUND_FILE = 'classic_ring.wav'
export const IPHONE_NOTIFICATION_SOUND_ID = 'iphone_notification'
export const IPHONE_NOTIFICATION_SOUND_FILE = 'iphone_notification.mp3'
export const BEST_LOVE_SOUND_ID = 'best_love'
export const BEST_LOVE_SOUND_FILE = 'best_love.mp3'

const soundAssets = {
  [RENTALX_POP_SOUND_ID]: require('../../assets/sounds/notification.mp3'),
  [BRIGHT_CHIME_SOUND_ID]: require('../../assets/sounds/bright_chime.wav'),
  [CLASSIC_RING_SOUND_ID]: require('../../assets/sounds/classic_ring.wav'),
  [IPHONE_NOTIFICATION_SOUND_ID]: require('../../assets/sounds/iphone_notification.mp3'),
  [BEST_LOVE_SOUND_ID]: require('../../assets/sounds/best_love.mp3'),
}

export const NOTIFICATION_SOUND_OPTIONS = [
  {
    id: PHONE_DEFAULT_SOUND_ID,
    label: 'Phone default',
    subtitle: 'Use the phone notification sound',
    icon: 'phone-portrait-outline',
    channelId: 'messages',
    pushSound: 'default',
  },
  {
    id: RENTALX_POP_SOUND_ID,
    label: 'Rental X pop',
    subtitle: 'Short app sound',
    icon: 'musical-notes-outline',
    channelId: 'messages_rentalx_pop',
    pushSound: RENTALX_POP_SOUND_FILE,
    asset: soundAssets[RENTALX_POP_SOUND_ID],
  },
  {
    id: BRIGHT_CHIME_SOUND_ID,
    label: 'Bright chime',
    subtitle: 'Crisp modern message tone',
    icon: 'sparkles-outline',
    channelId: 'messages_bright_chime',
    pushSound: BRIGHT_CHIME_SOUND_FILE,
    asset: soundAssets[BRIGHT_CHIME_SOUND_ID],
  },
  {
    id: IPHONE_NOTIFICATION_SOUND_ID,
    label: 'iPhone notification',
    subtitle: 'Message tone from your uploaded file',
    icon: 'notifications-outline',
    channelId: 'messages_iphone_notification',
    pushSound: IPHONE_NOTIFICATION_SOUND_FILE,
    asset: soundAssets[IPHONE_NOTIFICATION_SOUND_ID],
  },
  {
    id: SILENT_SOUND_ID,
    label: 'Silent',
    subtitle: 'No sound for this chat',
    icon: 'volume-mute-outline',
    channelId: 'messages_silent',
    pushSound: null,
  },
]

export const RINGTONE_SOUND_OPTIONS = [
  {
    id: PHONE_DEFAULT_SOUND_ID,
    label: 'Phone default',
    subtitle: 'Use the phone call/notification tone',
    icon: 'phone-portrait-outline',
    channelId: 'calls',
    pushSound: 'default',
  },
  {
    id: RENTALX_POP_SOUND_ID,
    label: 'Rental X ring',
    subtitle: 'Loop the app tone for calls',
    icon: 'call-outline',
    channelId: 'calls_rentalx_pop',
    pushSound: RENTALX_POP_SOUND_FILE,
    asset: soundAssets[RENTALX_POP_SOUND_ID],
  },
  {
    id: CLASSIC_RING_SOUND_ID,
    label: 'Classic ring',
    subtitle: 'Clear ringing caller tone',
    icon: 'radio-outline',
    channelId: 'calls_classic_ring',
    pushSound: CLASSIC_RING_SOUND_FILE,
    asset: soundAssets[CLASSIC_RING_SOUND_ID],
  },
  {
    id: BEST_LOVE_SOUND_ID,
    label: 'Best Love',
    subtitle: 'Caller tone from your uploaded file',
    icon: 'musical-notes-outline',
    channelId: 'calls_best_love',
    pushSound: BEST_LOVE_SOUND_FILE,
    asset: soundAssets[BEST_LOVE_SOUND_ID],
  },
  {
    id: SILENT_SOUND_ID,
    label: 'Silent',
    subtitle: 'No caller tone for this chat',
    icon: 'volume-mute-outline',
    channelId: 'calls_silent',
    pushSound: null,
  },
]

let notificationSound = null
let previewSoundInstance = null

function normalizeSoundId(soundId, options) {
  return options.some((option) => option.id === soundId) ? soundId : PHONE_DEFAULT_SOUND_ID
}

function getOption(soundId, options) {
  const safeId = normalizeSoundId(soundId, options)
  return options.find((option) => option.id === safeId) || options[0]
}

async function stopPreviewSound() {
  const sound = previewSoundInstance
  previewSoundInstance = null

  if (!sound) return

  try {
    await sound.stopAsync()
  } catch {
    // Sound may already be stopped.
  }

  try {
    await sound.unloadAsync()
  } catch {
    // Sound may already be unloaded.
  }
}

async function createBundledSound(soundId, options, playbackOptions = {}) {
  const option = getOption(soundId, options)
  const asset = option.asset || soundAssets[RENTALX_POP_SOUND_ID]

  return Audio.Sound.createAsync(asset, playbackOptions)
}

export function getNotificationSoundOption(soundId) {
  return getOption(soundId, NOTIFICATION_SOUND_OPTIONS)
}

export function getRingtoneSoundOption(soundId) {
  return getOption(soundId, RINGTONE_SOUND_OPTIONS)
}

export function getPushSoundConfig(kind, soundId) {
  const option = kind === 'ringtone'
    ? getRingtoneSoundOption(soundId)
    : getNotificationSoundOption(soundId)

  return {
    channelId: option.channelId,
    sound: option.pushSound,
  }
}

export async function playNotificationSound(options = {}) {
  try {
    const settings = typeof options === 'string' ? { soundId: options } : options
    const soundId = normalizeSoundId(
      settings.soundId || await getConversationNotificationSoundId(settings.conversationId),
      NOTIFICATION_SOUND_OPTIONS
    )

    if (soundId === SILENT_SOUND_ID) return

    if (soundId === PHONE_DEFAULT_SOUND_ID && settings.playPhoneDefaultFallback === false) {
      return
    }

    if (notificationSound) {
      await notificationSound.replayAsync()
      return
    }

    const { sound } = await Audio.Sound.createAsync(
      getNotificationSoundOption(soundId).asset || soundAssets[RENTALX_POP_SOUND_ID]
    )

    notificationSound = sound
    await sound.playAsync()
  } catch (error) {
    console.log('Notification sound error:', error)
  }
}

export async function createRingtoneSound({
  conversationId,
  soundId,
  shouldPlay = true,
  isLooping = true,
  volume = 0.65,
} = {}) {
  const resolvedSoundId = normalizeSoundId(
    soundId || await getConversationRingtoneSoundId(conversationId),
    RINGTONE_SOUND_OPTIONS
  )

  if (resolvedSoundId === SILENT_SOUND_ID) return null

  const option = getRingtoneSoundOption(resolvedSoundId)
  const { sound } = await Audio.Sound.createAsync(
    option.asset || soundAssets[RENTALX_POP_SOUND_ID],
    {
      shouldPlay,
      isLooping,
      volume,
    }
  )

  return sound
}

export async function previewSound(soundId, kind = 'notification') {
  const options = kind === 'ringtone' ? RINGTONE_SOUND_OPTIONS : NOTIFICATION_SOUND_OPTIONS
  const option = getOption(soundId, options)

  await stopPreviewSound()

  if (option.id === SILENT_SOUND_ID) return

  if (option.id === PHONE_DEFAULT_SOUND_ID) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: kind === 'ringtone' ? 'Caller tone preview' : 'Notification sound preview',
        body: 'Playing the phone default sound.',
        sound: kind === 'ringtone' ? 'defaultRingtone' : 'default',
        data: {
          type: kind === 'ringtone' ? 'ringtone_preview' : 'sound_preview',
        },
      },
      trigger: null,
    })
    return
  }

  const { sound } = await createBundledSound(option.id, options, {
    shouldPlay: true,
    isLooping: false,
    volume: kind === 'ringtone' ? 0.7 : 0.85,
  })

  previewSoundInstance = sound
}
