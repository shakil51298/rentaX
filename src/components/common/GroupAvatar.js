import { Image, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Avatar from './Avatar'
import { useAppSettings } from '../../lib/appSettings'

function normalizeProfiles(members = []) {
  return members
    .map((member) => member?.profile || member)
    .filter((profile) => profile?.user_id || profile?.id || profile?.display_name || profile?.email)
    .slice(0, 4)
}

function getAvatarLayout(count, size) {
  const small = count <= 2 ? Math.round(size * 0.54) : Math.round(size * 0.43)
  const edge = Math.max(2, Math.round(size * 0.06))

  if (count <= 1) {
    return [
      {
        width: Math.round(size * 0.72),
        left: Math.round(size * 0.14),
        top: Math.round(size * 0.14),
      },
    ]
  }

  if (count === 2) {
    return [
      { width: small, left: edge, top: Math.round(size * 0.22) },
      { width: small, left: size - small - edge, top: Math.round(size * 0.22) },
    ]
  }

  if (count === 3) {
    return [
      { width: small, left: Math.round((size - small) / 2), top: edge },
      { width: small, left: edge, top: size - small - edge },
      { width: small, left: size - small - edge, top: size - small - edge },
    ]
  }

  return [
    { width: small, left: edge, top: edge },
    { width: small, left: size - small - edge, top: edge },
    { width: small, left: edge, top: size - small - edge },
    { width: small, left: size - small - edge, top: size - small - edge },
  ]
}

export default function GroupAvatar({
  members = [],
  uri,
  size = 52,
  borderWidth = 0,
  borderColor,
}) {
  const { theme } = useAppSettings()
  const profiles = normalizeProfiles(members)
  const layout = getAvatarLayout(profiles.length, size)
  const resolvedBorderColor = borderColor || theme.surface

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        backgroundColor: theme.accentSoft,
        borderWidth,
        borderColor: resolvedBorderColor,
        overflow: 'hidden',
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      ) : profiles.length ? (
        profiles.map((profile, index) => {
          const item = layout[index]

          return (
            <View
              key={`${profile.user_id || profile.id || index}`}
              style={{
                position: 'absolute',
                left: item.left,
                top: item.top,
              }}
            >
              <Avatar
                profile={profile}
                size={item.width}
                borderWidth={2}
                borderColor={theme.surface}
              />
            </View>
          )
        })
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="people" size={Math.round(size * 0.5)} color={theme.accentStrong} />
        </View>
      )}
    </View>
  )
}
