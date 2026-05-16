import { useMemo } from 'react'
import { PanResponder, View } from 'react-native'
import { MAIN_TAB_ORDER, MAIN_TAB_SCREENS, navigateToMainTab } from './tabNavigation'

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

          const currentIndex = MAIN_TAB_ORDER.indexOf(activeTab)

          if (currentIndex === -1) return

          const absDx = Math.abs(gestureState.dx)
          const absDy = Math.abs(gestureState.dy)

          if (absDx < 70 || absDy > 45) return

          const nextIndex =
            gestureState.dx < 0
              ? Math.min(currentIndex + 1, MAIN_TAB_ORDER.length - 1)
              : Math.max(currentIndex - 1, 0)

          if (nextIndex === currentIndex) return

          const nextTab = MAIN_TAB_ORDER[nextIndex]
          const nextScreen = MAIN_TAB_SCREENS[nextTab]

          if (!nextScreen) return

          navigateToMainTab(navigation, nextScreen)
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
