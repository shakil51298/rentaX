import { useMemo } from 'react'
import { PanResponder, View } from 'react-native'

const TAB_ORDER = ['home', 'chat', 'favorite', 'notifications', 'profile']

const TAB_SCREENS = {
  home: 'Home',
  chat: 'Chat',
  favorite: 'Favorite',
  notifications: 'Notifications',
  profile: 'Profile',
}

export default function SwipeTabView({
  navigation,
  activeTab,
  children,
  disabled = false,
}) {
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          if (disabled) return false

          const absDx = Math.abs(gestureState.dx)
          const absDy = Math.abs(gestureState.dy)

          return absDx > 20 && absDx > absDy * 1.35
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (disabled) return

          const currentIndex = TAB_ORDER.indexOf(activeTab)

          if (currentIndex === -1) return

          const absDx = Math.abs(gestureState.dx)
          const absDy = Math.abs(gestureState.dy)

          if (absDx < 70 || absDy > 45) return

          const nextIndex =
            gestureState.dx < 0
              ? Math.min(currentIndex + 1, TAB_ORDER.length - 1)
              : Math.max(currentIndex - 1, 0)

          if (nextIndex === currentIndex) return

          const nextTab = TAB_ORDER[nextIndex]
          const nextScreen = TAB_SCREENS[nextTab]

          if (!nextScreen) return

          navigation.navigate(nextScreen)
        },
      }),
    [activeTab, disabled, navigation]
  )

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {children}
    </View>
  )
}
