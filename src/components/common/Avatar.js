import { Image, Text, View } from 'react-native'
import { getAvatarSource, getProfileName } from '../../lib/userDisplay'
import { useAppSettings } from '../../lib/appSettings'

export default function Avatar({
  profile,
  name,
  uri,
  size = 34,
  backgroundColor = '#dbeafe',
  textColor = '#1d4ed8',
  borderWidth = 0,
  borderColor = '#fff',
}) {
  const { theme } = useAppSettings()
  const resolvedName = name || getProfileName(profile, 'User')
  const resolvedUri = uri || getAvatarSource(profile)
  const initial = resolvedName?.trim()?.charAt(0)?.toUpperCase() || 'U'
  const resolvedBackgroundColor = backgroundColor === '#dbeafe' ? theme.accentSoft : backgroundColor
  const resolvedTextColor = textColor === '#1d4ed8' ? theme.accentStrong : textColor
  const resolvedBorderColor = borderColor === '#fff' ? theme.surface : borderColor

  if (resolvedUri) {
    return (
      <Image
        source={{ uri: resolvedUri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.surfaceMuted,
          borderWidth,
          borderColor: resolvedBorderColor,
        }}
      />
    )
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: resolvedBackgroundColor,
        borderWidth,
        borderColor: resolvedBorderColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: resolvedTextColor, fontWeight: '900', fontSize: size * 0.38 }}>
        {initial}
      </Text>
    </View>
  )
}
