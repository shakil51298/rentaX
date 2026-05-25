import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

const APP_SETTINGS_KEY = 'rental-x:app-settings'

export const APP_THEMES = [
  {
    id: 'classic',
    nameKey: 'settings.themeClassic',
    accent: '#1877F2',
    accentSoft: '#eaf3ff',
    accentStrong: '#0f5fd3',
    background: '#f4f7fb',
    surface: '#ffffff',
    surfaceMuted: '#f8fafc',
    border: '#e2e8f0',
    text: '#0f172a',
    mutedText: '#64748b',
    navBackground: '#ffffff',
    navBorder: '#e5e7eb',
    hero: '#dbeafe',
    heroText: '#1d4ed8',
  },
  {
    id: 'emerald',
    nameKey: 'settings.themeEmerald',
    accent: '#059669',
    accentSoft: '#e8faf4',
    accentStrong: '#047857',
    background: '#f3fbf8',
    surface: '#ffffff',
    surfaceMuted: '#f3faf7',
    border: '#d9efe7',
    text: '#082f27',
    mutedText: '#4b6b65',
    navBackground: '#ffffff',
    navBorder: '#dcefe7',
    hero: '#d1fae5',
    heroText: '#047857',
  },
  {
    id: 'sunset',
    nameKey: 'settings.themeSunset',
    accent: '#ea580c',
    accentSoft: '#fff1e8',
    accentStrong: '#c2410c',
    background: '#fff8f4',
    surface: '#ffffff',
    surfaceMuted: '#fff7f2',
    border: '#f5dfd2',
    text: '#431407',
    mutedText: '#7c5a4f',
    navBackground: '#ffffff',
    navBorder: '#f1ddd2',
    hero: '#ffedd5',
    heroText: '#c2410c',
  },
  {
    id: 'violet',
    nameKey: 'settings.themeViolet',
    accent: '#7c3aed',
    accentSoft: '#f3ecff',
    accentStrong: '#6d28d9',
    background: '#f8f5ff',
    surface: '#ffffff',
    surfaceMuted: '#faf7ff',
    border: '#e8dffb',
    text: '#2e1065',
    mutedText: '#6b5a8f',
    navBackground: '#ffffff',
    navBorder: '#e9e0fb',
    hero: '#ede9fe',
    heroText: '#6d28d9',
  },
  {
    id: 'rose',
    nameKey: 'settings.themeRose',
    accent: '#e11d48',
    accentSoft: '#fff0f4',
    accentStrong: '#be123c',
    background: '#fff6f8',
    surface: '#ffffff',
    surfaceMuted: '#fff8fa',
    border: '#f4dbe3',
    text: '#4c0519',
    mutedText: '#8b5f6d',
    navBackground: '#ffffff',
    navBorder: '#f1dce3',
    hero: '#ffe4e6',
    heroText: '#be123c',
  },
]

const FALLBACK_THEME = APP_THEMES[0]

export const APP_APPEARANCE_MODES = [
  { id: 'light', labelKey: 'settings.modeLight' },
  { id: 'dark', labelKey: 'settings.modeDark' },
]

export const APP_LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'bn', label: 'বাংলা' },
]

const STRINGS = {
  en: {
    appName: 'Rental X',
    appTagline: 'Rent. Live. Connect.',
    appDescription: 'Find the right place, talk to owners directly, and move with confidence.',
    appStarting: 'Rental X is starting',
    appLoadingResources: 'Loading app resources...',
    appConfigMissing: 'Rental X configuration missing',
    appConfigHelp: 'Add your EXPO_PUBLIC Supabase values to the EAS build profile, then rebuild the APK.',
    commonClose: 'Close',
    commonCancel: 'Cancel',
    commonSave: 'Save',
    commonApply: 'Apply',
    commonLogin: 'Login',
    commonRegister: 'Register',
    commonEnglish: 'English',
    commonBangla: 'বাংলা',
    settingsAppearanceTitle: 'Appearance',
    settingsAppearanceSubtitle: 'Choose a light or dark look for the app.',
    settingsModeLight: 'Light',
    settingsModeDark: 'Dark',
    guestLoginOrRegister: 'Login or Register',
    guestChatTitle: 'Chat needs an account',
    guestChatSubtitle: 'Create an account to message owners and continue conversations.',
    guestFavoriteTitle: 'Favorites need an account',
    guestFavoriteSubtitle: 'Login to save listings and come back to them later.',
    guestNotificationTitle: 'Notifications need an account',
    guestNotificationSubtitle: 'Login to get message updates, alerts, and admin or verification notices.',
    guestProfileTitle: 'Profile needs an account',
    guestProfileSubtitle: 'Create an account to manage your profile, listings, and saved activity.',
    authLogin: 'Login',
    authRegister: 'Register',
    authFullName: 'Full name',
    authEnterName: 'Enter your name',
    authEmail: 'Email',
    authPassword: 'Password',
    authConfirmPassword: 'Confirm password',
    authAccountType: 'Account type',
    authEnterPassword: 'Enter your password',
    authReenterPassword: 'Re-enter your password',
    authCreateAccount: 'Create account',
    authAlreadyHaveAccount: 'Already have an account?',
    authDontHaveAccount: "Don't have an account?",
    authSkipForNow: 'Skip for now',
    authMissingDetails: 'Missing details',
    authMissingDetailsBody: 'Please enter your email and password.',
    authMissingName: 'Missing name',
    authMissingNameBody: 'Please enter your full name.',
    authWeakPassword: 'Weak password',
    authWeakPasswordBody: 'Password should be at least 6 characters.',
    authPasswordMismatch: 'Password mismatch',
    authPasswordMismatchBody: 'Both passwords should match.',
    authLoginFailed: 'Login failed',
    authRegistrationFailed: 'Registration failed',
    authCheckEmail: 'Check your email',
    authCheckEmailBody: 'Your account was created. Please confirm your email, then log in.',
    authPropertyOwner: 'Property owner',
    authPropertyOwnerSubtitle: 'Post and manage rental listings',
    authFindingProperty: 'Finding property',
    authFindingPropertySubtitle: 'Search and save homes for rent',
    profilePosts: 'Posts',
    profileFollowers: 'Followers',
    profileFollowing: 'Following',
    profileAdsManagement: 'Ads Management',
    profileAdsManagementSubtitle: 'View, edit, share, and delete your property posts.',
    profileAdminPanel: 'Admin panel',
    profileAdminPanelSubtitle: 'Review owner and property verification requests.',
    profileSettings: 'Settings',
    profileSettingsSubtitle: 'Profile, notifications, password, security, and account type.',
    profileGeneralSettings: 'General settings',
    profileGeneralSettingsSubtitle: 'Change the app theme and switch between Bangla and English.',
    settingsThemeTitle: 'Theme',
    settingsThemeSubtitle: 'Pick the colors and button style you want across the app.',
    settingsLanguageTitle: 'Language',
    settingsLanguageSubtitle: 'Switch app text between English and Bangla.',
    settingsThemeClassic: 'Classic Blue',
    settingsThemeEmerald: 'Emerald',
    settingsThemeSunset: 'Sunset',
    settingsThemeViolet: 'Violet',
    settingsThemeRose: 'Rose',
    settingsPreviewPrimary: 'Primary',
    settingsPreviewSoft: 'Soft',
    stackProperty: 'Property',
    stackCreatePost: 'Create Post',
    stackChatSettings: 'Chat settings',
    stackChatHistorySearch: 'Search chat history',
    stackChatAppearance: 'Chat appearance',
    stackCreateGroupChat: 'Create group',
    stackOwnerProfile: 'Public Profile',
    stackSettings: 'Settings',
    stackVerificationCenter: 'Verification center',
    stackAdminPanel: 'Admin panel',
    stackReviewVerify: 'Review Verify',
    stackAdminUsers: 'Total Users',
    stackAdminReports: 'Report Queue',
    stackAdminBanners: 'Home Banners',
    stackAdminUserDetail: 'User Detail',
    stackAdminUserPosts: 'User Posts',
    stackCustomerCare: 'Customer Care',
    stackReportIssue: 'Report',
    stackAdsManagement: 'Ads Management',
    stackVisitRequests: 'Visit Requests',
    stackRecentlyViewed: 'Recently Viewed',
    stackCompareProperties: 'Compare Properties',
  },
  bn: {
    appName: 'রেন্টাল এক্স',
    appTagline: 'ভাড়া। থাকা। সংযোগ।',
    appDescription: 'সঠিক বাসা খুঁজুন, মালিকের সঙ্গে সরাসরি কথা বলুন, আর নিশ্চিন্তে সিদ্ধান্ত নিন।',
    appStarting: 'রেন্টাল এক্স চালু হচ্ছে',
    appLoadingResources: 'অ্যাপের রিসোর্স লোড হচ্ছে...',
    appConfigMissing: 'রেন্টাল এক্স কনফিগারেশন পাওয়া যায়নি',
    appConfigHelp: 'EAS build profile-এ আপনার EXPO_PUBLIC Supabase value যোগ করে আবার APK build করুন।',
    commonClose: 'বন্ধ',
    commonCancel: 'বাতিল',
    commonSave: 'সেভ',
    commonApply: 'প্রয়োগ করুন',
    commonLogin: 'লগইন',
    commonRegister: 'রেজিস্টার',
    commonEnglish: 'English',
    commonBangla: 'বাংলা',
    settingsAppearanceTitle: 'অ্যাপিয়ারেন্স',
    settingsAppearanceSubtitle: 'অ্যাপের জন্য লাইট বা ডার্ক লুক বেছে নিন।',
    settingsModeLight: 'লাইট',
    settingsModeDark: 'ডার্ক',
    guestLoginOrRegister: 'লগইন বা রেজিস্টার',
    guestChatTitle: 'চ্যাট করতে অ্যাকাউন্ট লাগবে',
    guestChatSubtitle: 'মালিককে মেসেজ করতে এবং কথোপকথন চালিয়ে যেতে একটি অ্যাকাউন্ট তৈরি করুন।',
    guestFavoriteTitle: 'ফেভারিট দেখতে অ্যাকাউন্ট লাগবে',
    guestFavoriteSubtitle: 'লিস্টিং সেভ করতে লগইন করুন এবং পরে আবার ফিরে আসুন।',
    guestNotificationTitle: 'নোটিফিকেশন দেখতে অ্যাকাউন্ট লাগবে',
    guestNotificationSubtitle: 'মেসেজ, অ্যালার্ট, অ্যাডমিন বা ভেরিফিকেশন আপডেট পেতে লগইন করুন।',
    guestProfileTitle: 'প্রোফাইল দেখতে অ্যাকাউন্ট লাগবে',
    guestProfileSubtitle: 'প্রোফাইল, লিস্টিং আর সেভ করা কাজগুলো সামলাতে অ্যাকাউন্ট তৈরি করুন।',
    authLogin: 'লগইন',
    authRegister: 'রেজিস্টার',
    authFullName: 'পূর্ণ নাম',
    authEnterName: 'আপনার নাম লিখুন',
    authEmail: 'ইমেইল',
    authPassword: 'পাসওয়ার্ড',
    authConfirmPassword: 'পাসওয়ার্ড নিশ্চিত করুন',
    authAccountType: 'অ্যাকাউন্ট টাইপ',
    authEnterPassword: 'আপনার পাসওয়ার্ড লিখুন',
    authReenterPassword: 'আবার পাসওয়ার্ড লিখুন',
    authCreateAccount: 'অ্যাকাউন্ট তৈরি করুন',
    authAlreadyHaveAccount: 'আগে থেকেই অ্যাকাউন্ট আছে?',
    authDontHaveAccount: 'অ্যাকাউন্ট নেই?',
    authSkipForNow: 'এখন না',
    authMissingDetails: 'তথ্য অসম্পূর্ণ',
    authMissingDetailsBody: 'অনুগ্রহ করে ইমেইল এবং পাসওয়ার্ড দিন।',
    authMissingName: 'নাম পাওয়া যায়নি',
    authMissingNameBody: 'অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন।',
    authWeakPassword: 'দুর্বল পাসওয়ার্ড',
    authWeakPasswordBody: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।',
    authPasswordMismatch: 'পাসওয়ার্ড মেলেনি',
    authPasswordMismatchBody: 'দুইটি পাসওয়ার্ড একই হতে হবে।',
    authLoginFailed: 'লগইন ব্যর্থ',
    authRegistrationFailed: 'রেজিস্ট্রেশন ব্যর্থ',
    authCheckEmail: 'ইমেইল দেখুন',
    authCheckEmailBody: 'আপনার অ্যাকাউন্ট তৈরি হয়েছে। ইমেইল নিশ্চিত করে তারপর লগইন করুন।',
    authPropertyOwner: 'প্রপার্টি মালিক',
    authPropertyOwnerSubtitle: 'ভাড়ার লিস্টিং পোস্ট ও ম্যানেজ করুন',
    authFindingProperty: 'বাসা খুঁজছি',
    authFindingPropertySubtitle: 'ভাড়ার বাসা খুঁজুন ও সেভ করুন',
    profilePosts: 'পোস্ট',
    profileFollowers: 'ফলোয়ার',
    profileFollowing: 'ফলোইং',
    profileAdsManagement: 'অ্যাডস ম্যানেজমেন্ট',
    profileAdsManagementSubtitle: 'আপনার প্রপার্টি পোস্ট দেখুন, এডিট করুন, শেয়ার করুন, বা ডিলিট করুন।',
    profileAdminPanel: 'অ্যাডমিন প্যানেল',
    profileAdminPanelSubtitle: 'মালিক ও প্রপার্টি ভেরিফিকেশন রিকোয়েস্ট রিভিউ করুন।',
    profileSettings: 'সেটিংস',
    profileSettingsSubtitle: 'প্রোফাইল, নোটিফিকেশন, পাসওয়ার্ড, সিকিউরিটি ও অ্যাকাউন্ট টাইপ।',
    profileGeneralSettings: 'সাধারণ সেটিংস',
    profileGeneralSettingsSubtitle: 'অ্যাপের থিম বদলান এবং বাংলা বা ইংরেজির মধ্যে পরিবর্তন করুন।',
    settingsThemeTitle: 'থিম',
    settingsThemeSubtitle: 'অ্যাপজুড়ে কোন রং আর বাটন স্টাইল দেখতে চান সেটি বেছে নিন।',
    settingsLanguageTitle: 'ভাষা',
    settingsLanguageSubtitle: 'অ্যাপের লেখা ইংরেজি ও বাংলার মধ্যে বদলান।',
    settingsThemeClassic: 'ক্লাসিক নীল',
    settingsThemeEmerald: 'এমেরাল্ড',
    settingsThemeSunset: 'সানসেট',
    settingsThemeViolet: 'ভায়োলেট',
    settingsThemeRose: 'রোজ',
    settingsPreviewPrimary: 'প্রাইমারি',
    settingsPreviewSoft: 'সফট',
    stackProperty: 'প্রপার্টি',
    stackCreatePost: 'পোস্ট তৈরি',
    stackChatSettings: 'চ্যাট সেটিংস',
    stackChatHistorySearch: 'চ্যাট হিস্টোরি সার্চ',
    stackChatAppearance: 'চ্যাট অ্যাপিয়ারেন্স',
    stackCreateGroupChat: 'গ্রুপ তৈরি',
    stackOwnerProfile: 'পাবলিক প্রোফাইল',
    stackSettings: 'সেটিংস',
    stackVerificationCenter: 'ভেরিফিকেশন সেন্টার',
    stackAdminPanel: 'অ্যাডমিন প্যানেল',
    stackReviewVerify: 'রিভিউ ভেরিফাই',
    stackAdminUsers: 'মোট ব্যবহারকারী',
    stackAdminReports: 'রিপোর্ট কিউ',
    stackAdminBanners: 'হোম ব্যানার',
    stackAdminUserDetail: 'ইউজার ডিটেইল',
    stackAdminUserPosts: 'ইউজার পোস্ট',
    stackCustomerCare: 'কাস্টমার কেয়ার',
    stackReportIssue: 'রিপোর্ট',
    stackAdsManagement: 'অ্যাডস ম্যানেজমেন্ট',
    stackVisitRequests: 'ভিজিট রিকোয়েস্ট',
    stackRecentlyViewed: 'সাম্প্রতিক দেখা',
    stackCompareProperties: 'প্রপার্টি তুলনা',
  },
}

const AppSettingsContext = createContext(null)

export function resolveAppTheme(themeId) {
  return APP_THEMES.find((item) => item.id === themeId) || FALLBACK_THEME
}

function withAlpha(hexColor, alphaHex) {
  const cleanHex = String(hexColor || '').replace('#', '')

  if (cleanHex.length !== 6) {
    return `#000000${alphaHex}`
  }

  return `#${cleanHex}${alphaHex}`
}

function buildDarkTheme(baseTheme) {
  return {
    ...baseTheme,
    background: '#09111f',
    surface: '#101b2d',
    surfaceMuted: '#132238',
    border: withAlpha(baseTheme.accent, '33'),
    text: '#f8fafc',
    mutedText: '#94a3b8',
    navBackground: '#0b1526',
    navBorder: withAlpha(baseTheme.accent, '2b'),
    hero: withAlpha(baseTheme.accent, '2b'),
    heroText: '#ffffff',
    accentSoft: withAlpha(baseTheme.accent, '2b'),
  }
}

export function translateText(language, key, fallback, params) {
  const table = STRINGS[language] || STRINGS.en
  let template = table[key] || STRINGS.en[key] || fallback || key

  if (!params) {
    return template
  }

  Object.entries(params).forEach(([paramKey, value]) => {
    template = template.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value))
  })

  return template
}

export function AppSettingsProvider({ children }) {
  const [themeId, setThemeId] = useState(FALLBACK_THEME.id)
  const [appearanceMode, setAppearanceMode] = useState('light')
  const [language, setLanguage] = useState('en')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(APP_SETTINGS_KEY)
        const parsed = raw ? JSON.parse(raw) : null

        if (!isMounted || !parsed) {
          return
        }

        if (parsed.themeId) {
          setThemeId(parsed.themeId)
        }

        if (parsed.appearanceMode) {
          setAppearanceMode(parsed.appearanceMode)
        }

        if (parsed.language) {
          setLanguage(parsed.language)
        }
      } catch {
        // Ignore local settings read issues.
      } finally {
        if (isMounted) {
          setReady(true)
        }
      }
    }

    hydrate()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!ready) return

    AsyncStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        themeId,
        appearanceMode,
        language,
      })
    ).catch(() => {
      // Ignore local settings write issues.
    })
  }, [appearanceMode, language, ready, themeId])

  const value = useMemo(() => {
    const baseTheme = resolveAppTheme(themeId)
    const theme = appearanceMode === 'dark' ? buildDarkTheme(baseTheme) : baseTheme

    return {
      ready,
      themeId,
      theme,
      appearanceMode,
      language,
      setThemeId,
      setAppearanceMode,
      setLanguage,
      t: (key, fallback, params) => translateText(language, key, fallback, params),
    }
  }, [appearanceMode, language, ready, themeId])

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings() {
  const value = useContext(AppSettingsContext)

  if (!value) {
    throw new Error('useAppSettings must be used inside AppSettingsProvider')
  }

  return value
}
