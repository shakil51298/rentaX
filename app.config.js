const baseConfig = require('./app.json').expo
const path = require('path')

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.GOOGLE_MAPS_API_KEY
  || null

const googleServicesFile = path.resolve(__dirname, 'google-services.json')

module.exports = {
  expo: {
    ...baseConfig,
    android: {
      ...baseConfig.android,
      googleServicesFile,
      config: {
        ...(baseConfig.android?.config || {}),
        ...(googleMapsApiKey
          ? {
              googleMaps: {
                apiKey: googleMapsApiKey,
              },
            }
          : {}),
      },
    },
  },
}
