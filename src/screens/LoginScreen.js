import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import appConfig from '../../app.json'
import { supabase } from '../lib/supabase'
import { activateGuestMode, clearGuestMode } from '../lib/guestSession'
import { ensureUserProfileRecord } from '../lib/profileSync'
import { useAppSettings } from '../lib/appSettings'

const USER_TYPES = [
  {
    id: 'property_owner',
    titleKey: 'authPropertyOwner',
    subtitleKey: 'authPropertyOwnerSubtitle',
    icon: 'business-outline',
  },
  {
    id: 'renter',
    titleKey: 'authFindingProperty',
    subtitleKey: 'authFindingPropertySubtitle',
    icon: 'search-outline',
  },
]

export default function LoginScreen({ navigation }) {
  const { theme, t } = useAppSettings()
  const scrollRef = useRef(null)
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [userType, setUserType] = useState('renter')
  const [loading, setLoading] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [passwordFieldY, setPasswordFieldY] = useState(0)
  const [confirmPasswordFieldY, setConfirmPasswordFieldY] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const isRegisterMode = mode === 'register'

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const showSubscription = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true)
    })
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false)
    })

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

  function scrollToField(fieldY) {
    if (!scrollRef.current) return

    scrollRef.current.scrollTo({
      y: Math.max(0, fieldY - 120),
      animated: true,
    })
  }

  function resetFormForMode(nextMode) {
    setMode(nextMode)
    setPassword('')
    setConfirmPassword('')
  }

  function validateAuthForm() {
    const cleanEmail = email.trim()

    if (!cleanEmail || !password) {
      Alert.alert(t('authMissingDetails', 'Missing details'), t('authMissingDetailsBody', 'Please enter your email and password.'))
      return false
    }

    if (isRegisterMode && !name.trim()) {
      Alert.alert(t('authMissingName', 'Missing name'), t('authMissingNameBody', 'Please enter your full name.'))
      return false
    }

    if (isRegisterMode && password.length < 6) {
      Alert.alert(t('authWeakPassword', 'Weak password'), t('authWeakPasswordBody', 'Password should be at least 6 characters.'))
      return false
    }

    if (isRegisterMode && password !== confirmPassword) {
      Alert.alert(t('authPasswordMismatch', 'Password mismatch'), t('authPasswordMismatchBody', 'Both passwords should match.'))
      return false
    }

    return true
  }

  async function login() {
    if (!validateAuthForm()) return

    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setLoading(false)

    if (error) {
      Alert.alert(t('authLoginFailed', 'Login failed'), error.message)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user?.id) {
      try {
        await ensureUserProfileRecord(user)
      } catch (_error) {
        // Let login continue; profile sync will retry from the app screens.
      }
    }

    await clearGuestMode()
    navigation.replace('MainTabs')
  }

  async function register() {
    if (!validateAuthForm()) return

    setLoading(true)

    const selectedType = USER_TYPES.find((item) => item.id === userType)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          name: name.trim(),
          full_name: name.trim(),
          user_type: userType,
          user_type_label: selectedType ? t(selectedType.titleKey, 'Finding property') : t('authFindingProperty', 'Finding property'),
        },
      },
    })

    setLoading(false)

    if (error) {
      Alert.alert(t('authRegistrationFailed', 'Registration failed'), error.message)
      return
    }

    if (data.session) {
      try {
        await ensureUserProfileRecord(data.session.user)
      } catch (_error) {
        // Let registration continue; profile sync will retry from the app screens.
      }
      await clearGuestMode()
      navigation.replace('MainTabs')
      return
    }

    Alert.alert(
      t('authCheckEmail', 'Check your email'),
      t('authCheckEmailBody', 'Your account was created. Please confirm your email, then log in.')
    )
    resetFormForMode('login')
  }

  function submitAuthForm() {
    if (loading) return

    if (isRegisterMode) {
      register()
    } else {
      login()
    }
  }

  async function continueAsGuest() {
    if (loading) return

    await activateGuestMode()
    navigation.replace('MainTabs')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 20}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 22,
            paddingTop: 12,
            paddingBottom: 26,
            justifyContent: keyboardVisible ? 'flex-start' : 'center',
            paddingBottom: keyboardVisible ? 120 : 26,
          }}
        >
        <View style={{ flex: 1, justifyContent: keyboardVisible ? 'flex-start' : 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 18 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              backgroundColor: theme.surface,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 68, height: 68, borderRadius: 18 }}
              resizeMode="contain"
            />
          </View>

          <Text
            style={{
              marginTop: 12,
              fontSize: 22,
              fontWeight: '900',
              color: theme.text,
              letterSpacing: 0,
            }}
          >
            {t('appName', 'Rental X')}
          </Text>

          <Text
            style={{
              marginTop: 4,
              fontSize: 12,
              fontWeight: '700',
              color: theme.mutedText,
              letterSpacing: 0,
            }}
          >
            {t('appTagline', 'Rent. Live. Connect.')}
          </Text>

          <Text
            style={{
              marginTop: 8,
              fontSize: 13,
              color: theme.mutedText,
              textAlign: 'center',
              lineHeight: 19,
              maxWidth: 240,
            }}
          >
            {t('appDescription', 'Find the right place, talk to owners directly, and move with confidence.')}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 18,
            shadowColor: '#0f172a',
            shadowOpacity: 0.04,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 2,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: theme.surfaceMuted,
              borderRadius: 12,
              padding: 4,
              marginBottom: 16,
            }}
          >
            {['login', 'register'].map((item) => {
              const isActive = mode === item

              return (
                <TouchableOpacity
                  key={item}
                  onPress={() => resetFormForMode(item)}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 9,
                    backgroundColor: isActive ? theme.surface : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? theme.text : theme.mutedText,
                      fontWeight: '700',
                    }}
                  >
                    {item === 'login' ? t('authLogin', 'Login') : t('authRegister', 'Register')}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {isRegisterMode ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: theme.mutedText, fontWeight: '700', marginBottom: 7 }}>
                {t('authFullName', 'Full name')}
              </Text>

              <TextInput
                placeholder={t('authEnterName', 'Enter your name')}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                textContentType="name"
                style={{
                  backgroundColor: theme.surfaceMuted,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  fontSize: 15,
                  color: theme.text,
                }}
              />
            </View>
          ) : null}

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: theme.mutedText, fontWeight: '700', marginBottom: 7 }}>
              {t('authEmail', 'Email')}
            </Text>

            <TextInput
              placeholder="name@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              style={{
                backgroundColor: theme.surfaceMuted,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 13,
                fontSize: 15,
                color: theme.text,
              }}
            />
          </View>

          <View
            style={{ marginBottom: 12 }}
            onLayout={(event) => {
              setPasswordFieldY(event.nativeEvent.layout.y)
            }}
          >
            <Text style={{ fontSize: 13, color: theme.mutedText, fontWeight: '700', marginBottom: 7 }}>
              {t('authPassword', 'Password')}
            </Text>

            <View
              style={{
                backgroundColor: theme.surfaceMuted,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                paddingLeft: 14,
                paddingRight: 10,
                minHeight: 50,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <TextInput
                placeholder={t('authEnterPassword', 'Enter your password')}
                value={password}
                onChangeText={setPassword}
                onFocus={() => scrollToField(passwordFieldY)}
                secureTextEntry={!showPassword}
                textContentType={isRegisterMode ? 'newPassword' : 'password'}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  fontSize: 15,
                  color: theme.text,
                }}
              />

              <TouchableOpacity
                onPress={() => setShowPassword((current) => !current)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color={theme.mutedText}
                />
              </TouchableOpacity>
            </View>
          </View>

          {isRegisterMode ? (
            <>
              <View
                style={{ marginBottom: 16 }}
                onLayout={(event) => {
                  setConfirmPasswordFieldY(event.nativeEvent.layout.y)
                }}
              >
                <Text style={{ fontSize: 13, color: theme.mutedText, fontWeight: '700', marginBottom: 7 }}>
                  {t('authConfirmPassword', 'Confirm password')}
                </Text>

                <View
                  style={{
                    backgroundColor: theme.surfaceMuted,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 12,
                    paddingLeft: 14,
                    paddingRight: 10,
                    minHeight: 50,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <TextInput
                    placeholder={t('authReenterPassword', 'Re-enter your password')}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => scrollToField(confirmPasswordFieldY)}
                    secureTextEntry={!showConfirmPassword}
                    textContentType="newPassword"
                    style={{
                      flex: 1,
                      paddingVertical: 13,
                      fontSize: 15,
                      color: theme.text,
                    }}
                  />

                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword((current) => !current)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={19}
                      color={theme.mutedText}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={{ fontSize: 13, color: theme.mutedText, fontWeight: '700', marginBottom: 8 }}>
                {t('authAccountType', 'Account type')}
              </Text>

              <View style={{ gap: 10, marginBottom: 18 }}>
                {USER_TYPES.map((item) => {
                  const isSelected = userType === item.id

                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => setUserType(item.id)}
                      activeOpacity={0.86}
                      style={{
                        borderWidth: 1,
                        borderColor: isSelected ? theme.accent : theme.border,
                        backgroundColor: isSelected ? theme.accentSoft : theme.surfaceMuted,
                        borderRadius: 13,
                        padding: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: isSelected ? theme.accent : theme.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons
                          name={item.icon}
                          size={21}
                          color={isSelected ? '#fff' : theme.mutedText}
                        />
                      </View>

                      <View style={{ marginLeft: 11, flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '800' }}>
                          {t(item.titleKey, '')}
                        </Text>

                        <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                          {t(item.subtitleKey, '')}
                        </Text>
                      </View>

                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={23}
                        color={isSelected ? theme.accent : theme.mutedText}
                      />
                    </TouchableOpacity>
                  )
                })}
              </View>
            </>
          ) : null}

          <TouchableOpacity
            onPress={submitAuthForm}
            activeOpacity={0.9}
            disabled={loading}
            style={{
              backgroundColor: loading ? theme.accentStrong : theme.accent,
              borderRadius: 13,
              paddingVertical: 15,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
            ) : null}

            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
              {isRegisterMode ? t('authCreateAccount', 'Create account') : t('authLogin', 'Login')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => resetFormForMode(isRegisterMode ? 'login' : 'register')}
            style={{ paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: theme.mutedText }}>
              {isRegisterMode ? t('authAlreadyHaveAccount', 'Already have an account?') : t('authDontHaveAccount', "Don't have an account?")}
              <Text style={{ color: theme.accent, fontWeight: '800' }}>
                {isRegisterMode ? ` ${t('authLogin', 'Login')}` : ` ${t('authRegister', 'Register')}`}
              </Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={continueAsGuest}
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.border,
              paddingTop: 14,
              alignItems: 'center',
            }}
          >
              <Text style={{ color: theme.mutedText, fontWeight: '700' }}>
              {t('authSkipForNow', 'Skip for now')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: theme.mutedText, textAlign: 'center', marginTop: 18, fontSize: 12 }}>
          {t('appName', 'Rental X')} version {appConfig.expo.version}
        </Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
