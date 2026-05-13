import { View, Text, Button } from 'react-native'

export default function PropertyScreen({ route, navigation }) {
  const { property } = route.params

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 22 }}>{property.title}</Text>
      <Text>{property.description}</Text>
      <Text>{property.price}</Text>

      <Button
        title="Message Owner"
        onPress={() => navigation.navigate('Chat', { property })}
      />
    </View>
  )
}