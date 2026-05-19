import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

function ActionItem({ icon, title, subtitle, danger, disabled, onPress }) {
  const tint = danger ? '#dc2626' : '#2563eb'

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: danger ? '#fef2f2' : '#eff6ff',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Ionicons name={icon} size={18} color={tint} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? '#dc2626' : '#0f172a', fontWeight: '800', fontSize: 15 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12, lineHeight: 18 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

export default function ActionSheetModal({
  visible,
  title,
  subtitle,
  actions,
  onClose,
  closeLabel = 'Close',
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.42)',
          justifyContent: 'flex-end',
          paddingHorizontal: 14,
          paddingBottom: 14,
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: '#fff',
            borderRadius: 24,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            maxHeight: '78%',
            overflow: 'hidden',
          }}
        >
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={{
              flexGrow: 0,
            }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 10,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 42,
                height: 5,
                borderRadius: 999,
                backgroundColor: '#cbd5e1',
                marginBottom: 12,
              }}
            />

            <Text style={{ color: '#0f172a', fontSize: 17, fontWeight: '900' }}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 19 }}>
                {subtitle}
              </Text>
            ) : null}

            <View style={{ marginTop: 12 }}>
              {actions.map((action, index) => (
                <View key={`${action.title}-${index}`}>
                  <ActionItem {...action} />
                  {index < actions.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />
                  ) : null}
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.86}
              style={{
                marginTop: 8,
                borderRadius: 16,
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#334155', fontWeight: '800' }}>{closeLabel}</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
