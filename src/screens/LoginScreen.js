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
import { ensureUserProfileRecord } from '../lib/profileSync'

const USER_TYPES = [
  {
    id: 'property_owner',
    title: 'Property owner',
    subtitle: 'Post and manage rental listings',
    icon: 'business-outline',
  },
  {
    id: 'renter',
    title: 'Finding property',
    subtitle: 'Search and save homes for rent',
    icon: 'search-outline',
  },
]

export default function LoginScreen({ navigation }) {
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
      Alert.alert('Missing details', 'Please enter your email and password.')
      return false
    }

    if (isRegisterMode && !name.trim()) {
      Alert.alert('Missing name', 'Please enter your full name.')
      return false
    }

    if (isRegisterMode && password.length < 6) {
      Alert.alert('Weak password', 'Password should be at least 6 characters.')
      return false
    }

    if (isRegisterMode && password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Both passwords should match.')
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
      Alert.alert('Login failed', error.message)
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
          user_type_label: selectedType?.title || 'Finding property',
        },
      },
    })

    setLoading(false)

    if (error) {
      Alert.alert('Registration failed', error.message)
      return
    }

    if (data.session) {
      try {
        await ensureUserProfileRecord(data.session.user)
      } catch (_error) {
        // Let registration continue; profile sync will retry from the app screens.
      }
      navigation.replace('MainTabs')
      return
    }

    Alert.alert(
      'Check your email',
      'Your account was created. Please confirm your email, then log in.'
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f7fb' }}>
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
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#e5eaf2',
            }}
          >
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 68, height: 68, borderRadius: 18 }}
              resizeMode="contain"
            />
          </View>
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#e5eaf2',
            padding: 16,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: '#eef2f7',
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
                    backgroundColor: isActive ? '#fff' : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? '#111827' : '#64748b',
                      fontWeight: '700',
                      textTransform: 'capitalize',
                    }}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {isRegisterMode ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: '#475569', fontWeight: '700', marginBottom: 7 }}>
                Full name
              </Text>

              <TextInput
                placeholder="Enter your name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                textContentType="name"
                style={{
                  backgroundColor: '#f8fafc',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  fontSize: 15,
                }}
              />
            </View>
          ) : null}

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: '#475569', fontWeight: '700', marginBottom: 7 }}>
              Email
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
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 13,
                fontSize: 15,
              }}
            />
          </View>

          <View
            style={{ marginBottom: 12 }}
            onLayout={(event) => {
              setPasswordFieldY(event.nativeEvent.layout.y)
            }}
          >
            <Text style={{ fontSize: 13, color: '#475569', fontWeight: '700', marginBottom: 7 }}>
              Password
            </Text>

            <TextInput
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              onFocus={() => scrollToField(passwordFieldY)}
              secureTextEntry
              textContentType={isRegisterMode ? 'newPassword' : 'password'}
              style={{
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 13,
                fontSize: 15,
              }}
            />
          </View>

          {isRegisterMode ? (
            <>
              <View
                style={{ marginBottom: 16 }}
                onLayout={(event) => {
                  setConfirmPasswordFieldY(event.nativeEvent.layout.y)
                }}
              >
                <Text style={{ fontSize: 13, color: '#475569', fontWeight: '700', marginBottom: 7 }}>
                  Confirm password
                </Text>

                <TextInput
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => scrollToField(confirmPasswordFieldY)}
                  secureTextEntry
                  textContentType="newPassword"
                  style={{
                    backgroundColor: '#f8fafc',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 13,
                    fontSize: 15,
                  }}
                />
              </View>

              <Text style={{ fontSize: 13, color: '#475569', fontWeight: '700', marginBottom: 8 }}>
                Account type
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
                        borderColor: isSelected ? '#1877F2' : '#e2e8f0',
                        backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
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
                          backgroundColor: isSelected ? '#1877F2' : '#e2e8f0',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons
                          name={item.icon}
                          size={21}
                          color={isSelected ? '#fff' : '#475569'}
                        />
                      </View>

                      <View style={{ marginLeft: 11, flex: 1 }}>
                        <Text style={{ color: '#111827', fontWeight: '800' }}>
                          {item.title}
                        </Text>

                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          {item.subtitle}
                        </Text>
                      </View>

                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={23}
                        color={isSelected ? '#1877F2' : '#94a3b8'}
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
              backgroundColor: loading ? '#8bbcf7' : '#1877F2',
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
              {isRegisterMode ? 'Create account' : 'Login'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => resetFormForMode(isRegisterMode ? 'login' : 'register')}
            style={{ paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#475569' }}>
              {isRegisterMode ? 'Already have an account?' : "Don't have an account?"}
              <Text style={{ color: '#1877F2', fontWeight: '800' }}>
                {isRegisterMode ? ' Login' : ' Register'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: '#94a3b8', textAlign: 'center', marginTop: 18, fontSize: 12 }}>
          Rental X version {appConfig.expo.version}
        </Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
