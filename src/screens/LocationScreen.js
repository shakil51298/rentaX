import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import MapView, { Marker } from 'react-native-maps'
import * as Location from 'expo-location'
import { CommonActions } from '@react-navigation/native'
import {
  getLocationSelectionFromCoords,
  searchLocationSelection,
} from '../lib/location'

const DEFAULT_REGION = {
  latitude: 23.8103,
  longitude: 90.4125,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
}

const HAS_ANDROID_GOOGLE_MAPS_KEY =
  Platform.OS !== 'android' || Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY)

export default function LocationScreen({ navigation, route }) {
  const mapRef = useRef(null)
  const hasManualSelectionRef = useRef(false)
  const isMountedRef = useRef(true)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [searchText, setSearchText] = useState(route?.params?.initialLabel || '')
  const [currentCoords, setCurrentCoords] = useState(null)
  const [selectedCoords, setSelectedCoords] = useState(null)
  const [selectedLabel, setSelectedLabel] = useState('Loading location...')
  const [selectedDetails, setSelectedDetails] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false)

  useEffect(() => {
    loadInitialLocation()
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !selectedCoords) return

    mapRef.current?.animateToRegion(
      {
        latitude: selectedCoords.latitude,
        longitude: selectedCoords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      350
    )
  }, [mapReady, selectedCoords])

  async function loadInitialLocation() {
    try {
      setLoading(true)
      const initialLocation = route?.params?.initialLocation

      if (initialLocation?.latitude && initialLocation?.longitude) {
        const coords = {
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
        }

        setCurrentCoords(coords)
        setSelectedCoords(coords)
        setSelectedLabel(initialLocation.areaLabel || initialLocation.label || 'Pinned location')
        setSelectedDetails(initialLocation.fullLabel || initialLocation.areaLabel || '')
        setLoading(false)
        return
      }

      setSelectedCoords(DEFAULT_REGION)
      setSelectedLabel(route?.params?.initialLabel || 'Select an area on the map')
      setSelectedDetails('')
      setLoading(false)

      const permission = await Location.getForegroundPermissionsAsync()
      if (!isMountedRef.current) return
      setLocationPermissionGranted(Boolean(permission.granted))

      if (!permission.granted) {
        return
      }

      const lastKnownPosition = await Location.getLastKnownPositionAsync()

      const position =
        lastKnownPosition ||
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })

      if (!position || !isMountedRef.current) {
        return
      }

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }

      setCurrentCoords(coords)

      if (!hasManualSelectionRef.current && !route?.params?.initialLocation) {
        setSelectedCoords(coords)
        await updateSelectedLabel(coords, 'Current location')
      }
    } catch (_error) {
      if (!hasManualSelectionRef.current && !route?.params?.initialLocation) {
        setSelectedLabel(route?.params?.initialLabel || 'Select an area on the map')
        setSelectedDetails('')
        setSelectedCoords(DEFAULT_REGION)
      }
    } finally {
      setLoading(false)
    }
  }

  async function updateSelectedLabel(coords, fallbackLabel) {
    try {
      const selection = await getLocationSelectionFromCoords(coords, fallbackLabel)
      if (!isMountedRef.current) return
      setSelectedLabel(selection.areaLabel || fallbackLabel || 'Pinned location')
      setSelectedDetails(selection.fullLabel || selection.areaLabel || '')
    } catch (_error) {
      if (!isMountedRef.current) return
      setSelectedLabel(fallbackLabel || 'Pinned location')
      setSelectedDetails('')
    }
  }

  async function handleSearch() {
    const query = searchText.trim()
    if (!query) return

    try {
      setSearching(true)
      Keyboard.dismiss()

      const selection = await searchLocationSelection(query)

      if (!selection) {
        Alert.alert('Location not found', 'Try a more specific area or place name.')
        return
      }

      const coords = {
        latitude: selection.latitude,
        longitude: selection.longitude,
      }

      hasManualSelectionRef.current = true
      setSelectedCoords(coords)
      setSelectedLabel(selection.areaLabel || query)
      setSelectedDetails(selection.fullLabel || selection.areaLabel || query)
    } catch (_error) {
      Alert.alert('Search failed', 'We could not search that location right now.')
    } finally {
      setSearching(false)
    }
  }

  async function handleMapPick(event) {
    const coords = event.nativeEvent.coordinate
    hasManualSelectionRef.current = true
    setSelectedCoords(coords)
    await updateSelectedLabel(coords, 'Pinned location')
  }

  async function handleUseCurrentLocation() {
    try {
      if (!locationPermissionGranted) {
        const permission = await Location.requestForegroundPermissionsAsync()
        setLocationPermissionGranted(Boolean(permission.granted))

        if (!permission.granted) {
          Alert.alert('Location permission needed', 'Please allow location access to use your current position.')
          return
        }
      }

      let coords = currentCoords

      if (!coords) {
        const lastKnownPosition = await Location.getLastKnownPositionAsync()
        const position =
          lastKnownPosition ||
          await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })

        if (!position || !isMountedRef.current) {
          Alert.alert('Location unavailable', 'We could not get your current location right now.')
          return
        }

        coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }

        setCurrentCoords(coords)
      }

      hasManualSelectionRef.current = true
      setSelectedCoords(coords)
      await updateSelectedLabel(coords, 'Current location')
    } catch (_error) {
      Alert.alert('Location unavailable', 'We could not get your current location right now.')
    }
  }

  function handleConfirmLocation() {
    if (!selectedCoords) {
      Alert.alert('Select a location', 'Tap on the map or search for a location first.')
      return
    }

    const returnScreen = route?.params?.returnScreen || 'Home'
    const returnKey = route?.params?.returnKey
    const params = {
      selectedLocation: {
        label: selectedLabel,
        areaLabel: selectedLabel,
        fullLabel: selectedDetails || selectedLabel,
        latitude: selectedCoords.latitude,
        longitude: selectedCoords.longitude,
      },
      selectedLocationRequestId: String(Date.now()),
      ...(route?.params?.returnParams || {}),
    }

    if (returnKey) {
      const navigationState = navigation.getState()
      const targetIndex = navigationState.routes.findIndex((screenRoute) => screenRoute.key === returnKey)

      if (targetIndex >= 0) {
        const nextRoutes = navigationState.routes
          .slice(0, targetIndex + 1)
          .map((screenRoute, index) => (
            index === targetIndex
              ? {
                  ...screenRoute,
                  params: {
                    ...(screenRoute.params || {}),
                    ...params,
                  },
                }
              : screenRoute
          ))

        navigation.dispatch(
          CommonActions.reset({
            ...navigationState,
            routes: nextRoutes,
            index: nextRoutes.length - 1,
          })
        )
        return
      }
    }

    navigation.navigate(returnScreen, params)
  }

  const initialRegion = {
    ...(selectedCoords || DEFAULT_REGION),
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#f1f5f9',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#0f172a" />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '900', color: '#0f172a' }}>
              Select Location
            </Text>
            <Text style={{ marginTop: 2, color: '#64748b', fontSize: 12 }}>
              Search a place or pin it on the map.
            </Text>
          </View>
        </View>

        <View
          style={{
            marginTop: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#dbe4ee',
              paddingHorizontal: 12,
              height: 48,
            }}
          >
            <Ionicons name="search" size={18} color="#64748b" />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={handleSearch}
              placeholder="Search area or address"
              placeholderTextColor="#94a3b8"
              style={{ flex: 1, marginLeft: 8, color: '#0f172a', fontSize: 15 }}
              returnKeyType="search"
            />
          </View>

          <TouchableOpacity
            onPress={handleSearch}
            disabled={searching}
            style={{
              height: 48,
              paddingHorizontal: 16,
              borderRadius: 16,
              backgroundColor: searching ? '#93c5fd' : '#2563eb',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {searching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                Search
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={{ marginTop: 10, color: '#64748b' }}>Loading map...</Text>
          </View>
        ) : (
          <>
            {HAS_ANDROID_GOOGLE_MAPS_KEY ? (
              <MapView
                ref={mapRef}
                style={{ flex: 1 }}
                initialRegion={initialRegion}
                onMapReady={() => setMapReady(true)}
                onPress={handleMapPick}
                showsUserLocation
                showsMyLocationButton={false}
                toolbarEnabled={false}
              >
                {selectedCoords ? (
                  <Marker
                    coordinate={selectedCoords}
                    draggable
                    onDragEnd={(event) => handleMapPick(event)}
                  />
                ) : null}
              </MapView>
            ) : (
              <View
                style={{
                  flex: 1,
                  backgroundColor: '#f8fafc',
                  paddingHorizontal: 18,
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    padding: 18,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: '#eff6ff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <Ionicons name="map-outline" size={22} color="#2563eb" />
                  </View>

                  <Text style={{ color: '#0f172a', fontSize: 17, fontWeight: '900' }}>
                    Map setup needed for installed Android app
                  </Text>
                  <Text style={{ color: '#64748b', lineHeight: 20, marginTop: 8 }}>
                    This APK does not have a Google Maps API key yet. Search and current-location still work here, and the app should stop closing on open.
                  </Text>
                  <Text style={{ color: '#64748b', lineHeight: 20, marginTop: 8 }}>
                    Add `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, rebuild the app, and the full map will show in installed builds too.
                  </Text>

                  {selectedCoords ? (
                    <View
                      style={{
                        marginTop: 14,
                        backgroundColor: '#f8fafc',
                        borderRadius: 14,
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: '#0f172a', fontWeight: '800' }}>
                        Current selection
                      </Text>
                      <Text style={{ color: '#475569', marginTop: 5 }}>
                        {selectedLabel}
                      </Text>
                      <Text style={{ color: '#64748b', marginTop: 4, fontSize: 12 }}>
                        {selectedCoords.latitude.toFixed(5)}, {selectedCoords.longitude.toFixed(5)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}

            <TouchableOpacity
              onPress={handleUseCurrentLocation}
              style={{
                position: 'absolute',
                right: 16,
                top: 16,
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 5,
              }}
            >
              <Ionicons name="locate" size={21} color="#2563eb" />
            </TouchableOpacity>

            <View
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                bottom: 20,
                backgroundColor: '#fff',
                borderRadius: 22,
                padding: 16,
                shadowColor: '#000',
                shadowOpacity: 0.12,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#eff6ff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Ionicons name="location" size={19} color="#2563eb" />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '900' }}>
                    {selectedLabel}
                  </Text>
                  {selectedDetails ? (
                    <Text style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
                      {selectedDetails}
                    </Text>
                  ) : null}
                  {selectedCoords ? (
                    <Text style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
                      {selectedCoords.latitude.toFixed(5)}, {selectedCoords.longitude.toFixed(5)}
                    </Text>
                  ) : null}
                </View>
              </View>

              <TouchableOpacity
                onPress={handleConfirmLocation}
                style={{
                  marginTop: 16,
                  backgroundColor: '#2563eb',
                  borderRadius: 16,
                  height: 50,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>
                  Use This Location
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  )
}
