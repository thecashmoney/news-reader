import React from 'react';
import { View, Text, Button } from 'react-native';
import * as Speech from 'expo-speech';

// This would eventually be replaced with fetched news
const articleText = "This is the sample news article. It will be read out loud when you press the button.";

const TextToSpeechButton = () => {
  // Function to speak the article text aloud
  const speak = () => {
    Speech.stop(); // Stop anything currently being spoken
    Speech.speak(articleText, {
      language: 'en-US',
      pitch: 1.0,
      rate: 0.9,
    });
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 16, marginBottom: 20 }}>
        Press the button to hear the article.
      </Text>
      <Button title="Start Reading" onPress={speak} />
    </View>
  );
};

export default TextToSpeechButton;