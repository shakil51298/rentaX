import { Image, Text, View } from 'react-native'
import { getAvatarSource, getProfileName } from '../../lib/userDisplay'

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
  const resolvedName = name || getProfileName(profile, 'User')
  const resolvedUri = uri || getAvatarSource(profile)
  const initial = resolvedName?.trim()?.charAt(0)?.toUpperCase() || 'U'

  if (resolvedUri) {
    return (
      <Image
        source={{ uri: resolvedUri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#e5e7eb',
          borderWidth,
          borderColor,
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
        backgroundColor,
        borderWidth,
        borderColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: textColor, fontWeight: '900', fontSize: size * 0.38 }}>
        {initial}
      </Text>
    </View>
  )
}
