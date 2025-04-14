import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import React, { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [step, setStep] = useState<'intro' | 'topic' | 'outlet' | 'read' | 'done'>('intro');

  useEffect(() => {
    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission to access microphone was denied');
        return;
      }

      runFlow();
    })();
  }, []);

  const runFlow = () => {
    setStep('topic');
    Speech.speak('What would you like to read about today?', {
      onDone: () => {
        setTimeout(async () => {
          await safeStartRecording();
          setTimeout(() => {
            stopAndTranscribe('topic');
          }, 5000);
        }, 500);
      },
    });
  };

  const outletFlow = () => {
    setStep('outlet');
    Speech.speak('Would you like to choose a specific outlet next?', {
      onDone: () => {
        setTimeout(async () => {
          await safeStartRecording();
          setTimeout(() => {
            stopAndTranscribe('outlet');
          }, 5000);
        }, 500);
      },
    });
  };

  const safeStartRecording = async () => {
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch (err) {
        console.log('Safe stop failed (may have already been stopped)', err);
      }
      setRecording(null);
    }
    await startRecording();
  };

  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRecording.startAsync();
      setRecording(newRecording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopAndTranscribe = async (currentStep: 'topic' | 'outlet') => {
    try {
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setIsRecording(false);
      setRecording(null);

      if (!uri) {
        console.error('Recording URI is null');
        return;
      }

      const uploadRes = await FileSystem.uploadAsync(
        'https://api.assemblyai.com/v2/upload',
        uri,
        {
          httpMethod: 'POST',
          headers: {
            authorization: 'e8dd923d1a4143d29f0bc0a7a2c119dd',
          },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        }
      );

      const uploadData = JSON.parse(uploadRes.body);
      const audioUrl = uploadData.upload_url;

      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          authorization: 'e8dd923d1a4143d29f0bc0a7a2c119dd',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audio_url: audioUrl }),
      });

      const transcriptData = await transcriptRes.json();
      const transcriptId = transcriptData.id;

      let completed = false;
      while (!completed) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollingRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
          headers: {
            authorization: 'e8dd923d1a4143d29f0bc0a7a2c119dd',
          },
        });
        const pollingData = await pollingRes.json();
        if (pollingData.status === 'completed') {
          setTranscribedText(pollingData.text);
          Speech.speak('You said: ' + pollingData.text, {
            onDone: () => {
              if (currentStep === 'topic') {
                outletFlow();
              } else {
                setStep('read');
                Speech.speak('Here are the top articles from that outlet.');
              }
            },
          });
          completed = true;
        } else if (pollingData.status === 'error') {
          console.error('Transcription error:', pollingData.error);
          completed = true;
        }
      }
    } catch (error) {
      console.error('Transcription failed:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Step: {step}</Text>
      <Text style={styles.text}>Transcribed Text: {transcribedText}</Text>
      <Button
        title={isRecording ? 'Stop Recording' : 'Start Recording'}
        onPress={isRecording ? () => stopAndTranscribe(step as 'topic' | 'outlet') : safeStartRecording}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#ecf0f1',
    padding: 16,
  },
  text: {
    fontSize: 18,
    marginBottom: 16,
  },
});
