const { withAndroidManifest } = require('@expo/config-plugins')

const FOREGROUND_SERVICE_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
]

const FOREGROUND_SERVICES = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
  'expo.modules.video.playbackService.ExpoVideoPlaybackService',
]

function ensureToolsNamespace(manifest) {
  manifest.$ = manifest.$ || {}
  manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools'
}

function addPermissionRemoval(manifest, permissionName) {
  manifest['uses-permission'] = manifest['uses-permission'] || []

  const existingPermission = manifest['uses-permission'].find(
    (permission) => permission?.$?.['android:name'] === permissionName
  )

  if (existingPermission) {
    existingPermission.$['tools:node'] = 'remove'
    return
  }

  manifest['uses-permission'].push({
    $: {
      'android:name': permissionName,
      'tools:node': 'remove',
    },
  })
}

function addServiceRemoval(application, serviceName) {
  application.service = application.service || []

  const existingService = application.service.find(
    (service) => service?.$?.['android:name'] === serviceName
  )

  if (existingService) {
    existingService.$['tools:node'] = 'remove'
    return
  }

  application.service.push({
    $: {
      'android:name': serviceName,
      'tools:node': 'remove',
    },
  })
}

module.exports = function withNoForegroundMediaServices(config) {
  return withAndroidManifest(config, (pluginConfig) => {
    const manifest = pluginConfig.modResults.manifest
    ensureToolsNamespace(manifest)

    FOREGROUND_SERVICE_PERMISSIONS.forEach((permissionName) => {
      addPermissionRemoval(manifest, permissionName)
    })

    const application = manifest.application?.[0]
    if (application) {
      FOREGROUND_SERVICES.forEach((serviceName) => {
        addServiceRemoval(application, serviceName)
      })
    }

    return pluginConfig
  })
}
