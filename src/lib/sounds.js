import { Audio } from 'expo-av'

let notificationSound = null

export async function playNotificationSound() {
  try {
    if (notificationSound) {
      await notificationSound.replayAsync()
      return
    }

    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/sounds/notification.mp3')
    )

    notificationSound = sound
    await sound.playAsync()
  } catch (error) {
    console.log('Notification sound error:', error)
  }
}