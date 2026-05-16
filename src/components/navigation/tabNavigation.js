import { CommonActions } from '@react-navigation/native'

export const MAIN_TAB_SCREENS = {
  home: 'Home',
  chat: 'Chat',
  favorite: 'Favorite',
  notifications: 'Notifications',
  profile: 'Profile',
}

export const MAIN_TAB_ORDER = ['home', 'chat', 'favorite', 'notifications', 'profile']

export function navigateToMainTab(navigation, screen) {
  if (!navigation || !screen) return

  const state = navigation.getState?.()
  const currentRoute = state?.routes?.[state.index]

  if (currentRoute?.name === screen) {
    return
  }

  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: screen }],
    })
  )
}
