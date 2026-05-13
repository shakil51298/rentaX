import { useState } from 'react'
import { View, TextInput, Button } from 'react-native'
import { supabase } from '../lib/supabase'

export default function ChatScreen() {
  const [message, setMessage] = useState('')

  async function sendMessage() {
    await supabase.from('messages').insert({
      message,
    })

    setMessage('')
  }

  return (
    <View style={{ padding: 20 }}>
      <TextInput value={message} onChangeText={setMessage} placeholder="Message" />
      <Button title="Send" onPress={sendMessage} />
    </View>
  )
}