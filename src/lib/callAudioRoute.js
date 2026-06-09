import { Audio } from 'expo-av'

export async function requestCallMicrophonePermission() {
  if (typeof Audio.requestPermissionsAsync !== 'function') return

  const permission = await Audio.requestPermissionsAsync()
  const granted = permission?.status === 'granted' || permission?.granted === true

  if (!granted) {
    throw new Error('Microphone permission is needed for calls.')
  }
}

export async function setCallAudioRoute(speakerOn = true) {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: !speakerOn,
  })
}

export async function setCallRingtoneAudioMode() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
  })
}

export async function resetCallAudioRoute() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  })
}
