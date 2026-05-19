import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const ACTION_TONES = [
  { tint: '#2563eb', background: '#dbeafe' },
  { tint: '#7c3aed', background: '#ede9fe' },
  { tint: '#0891b2', background: '#cffafe' },
  { tint: '#ea580c', background: '#ffedd5' },
  { tint: '#16a34a', background: '#dcfce7' },
]

function getActionTone(index, danger) {
  if (danger) {
    return {
      tint: '#dc2626',
      background: '#fee2e2',
    }
  }

  return ACTION_TONES[index % ACTION_TONES.length]
}

function ActionItem({ icon, title, subtitle, danger, disabled, onPress, index }) {
  const tone = getActionTone(index, danger)

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          backgroundColor: tone.background,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <Ionicons name={icon} size={16} color={tone.tint} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? '#dc2626' : '#0f172a', fontWeight: '800', fontSize: 13.5 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: '#64748b', marginTop: 2, fontSize: 11, lineHeight: 15 }}>
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
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            maxHeight: '72%',
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
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: 8,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 38,
                height: 4,
                borderRadius: 999,
                backgroundColor: '#cbd5e1',
                marginBottom: 10,
              }}
            />

            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '900' }}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={{ color: '#64748b', marginTop: 3, fontSize: 11.5, lineHeight: 17 }}>
                {subtitle}
              </Text>
            ) : null}

            <View style={{ marginTop: 10 }}>
              {actions.map((action, index) => (
                <View key={`${action.title}-${index}`}>
                  <ActionItem {...action} index={index} />
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
                marginTop: 6,
                borderRadius: 14,
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                paddingVertical: 11,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#334155', fontWeight: '800', fontSize: 12.5 }}>{closeLabel}</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
