import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  useColorScheme,
  Button,
  FlatList,
  TextInput,
  Keyboard,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import axios from 'axios';
import HTMLParser from 'html-parse-stringify';
import he from 'he';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';

export default function Index() {
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [step, setStep] = useState<'intro' | 'topic' | 'outlet' | 'read'>('intro');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [jsonResponse, setJsonResponse] = useState(null);
  const [content, setContent] = useState('');
  const [articleIndex, setArticleIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const colorScheme = useColorScheme();

  useEffect(() => {
    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission to access microphone was denied');
        return;
      }
      askQuestion('What would you like to read about today?', 'topic');
    })();
  }, []);

  const askQuestion = (prompt: string, nextStep: 'topic' | 'outlet' | 'read') => {
    setStep(nextStep);
    Speech.speak(prompt, {
      onDone: () => {
        setTimeout(async () => {
          await safeStartRecording();
          setTimeout(() => {
            stopAndTranscribe(nextStep);
          }, 5000);
        }, 500);
      },
    });
  };

  const safeStartRecording = async () => {
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {}
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

  const stopAndTranscribe = async (currentStep) => {
    try {
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setIsRecording(false);
      setRecording(null);

      if (!uri) return;

      const uploadRes = await FileSystem.uploadAsync(
        'https://api.assemblyai.com/v2/upload',
        uri,
        {
          httpMethod: 'POST',
          headers: {
            authorization: 'YOUR_ASSEMBLYAI_API_KEY',
          },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        }
      );

      const uploadData = JSON.parse(uploadRes.body);
      const audioUrl = uploadData.upload_url;

      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          authorization: 'YOUR_ASSEMBLYAI_API_KEY',
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
          headers: { authorization: 'YOUR_ASSEMBLYAI_API_KEY' },
        });
        const pollingData = await pollingRes.json();
        if (pollingData.status === 'completed') {
          const text = pollingData.text;
          if (currentStep === 'topic') {
            setQuery(text);
            fetchArticles(text, source);
            askQuestion('Would you like to choose a specific outlet next?', 'outlet');
          } else if (currentStep === 'outlet') {
            setSource(text);
            fetchArticles(query, text);
          }
          completed = true;
        } else if (pollingData.status === 'error') {
          completed = true;
          console.error('Transcription error:', pollingData.error);
        }
      }
    } catch (err) {
      console.error('Transcription failed:', err);
    }
  };

  const fetchArticles = async (q: string, source: string) => {
    const url = `https://getnews-px5bnsfj3q-uc.a.run.app` +
      (!source && !q ? '' : '?') +
      (source ? `source=${source.toLowerCase().replace(/\s+/g, '-')}` : '') +
      (source && q ? '&' : '') +
      (q ? `q=${q}` : '');
    try {
      setLoading(true);
      const response = await axios.get(url);
      setJsonResponse(response.data.articles);
    } catch (error) {
      console.error('Error fetching articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const processArticle = async (article) => {
    try {
      const articleResponse = await axios.get(article.url);
      const parsedHTML = HTMLParser.parse(articleResponse.data);

      const decodeHtmlEntities = (str) => he.decode(str);

      const isShareElement = (text) => ['share', 'facebook'].some(k => text.toLowerCase().includes(k));

      const extractVisibleText = (node) => {
        if (!node) return [];
        if (Array.isArray(node)) return node.flatMap(extractVisibleText);
        if (node.type === 'text') return [node.content?.trim()].filter(Boolean);
        if (node.type === 'tag' && node.children) return node.children.flatMap(extractVisibleText);
        return [];
      };

      const findBodyTag = (nodes) => {
        for (const node of nodes) {
          if (node.type === 'tag' && node.name === 'body') return node;
          if (node.children?.length) {
            const found = findBodyTag(node.children);
            if (found) return found;
          }
        }
        return null;
      };

      const bodyNode = findBodyTag(parsedHTML);
      const rawText = decodeHtmlEntities(extractVisibleText(bodyNode).join('\n'));
      setContent(rawText);
    } catch (err) {
      console.error('Error processing article:', err);
    }
  };

  const themeTextStyle = colorScheme === 'light' ? styles.lightThemeText : styles.darkThemeText;
  const themeContainerStyle = colorScheme === 'light' ? styles.lightContainer : styles.darkContainer;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, themeContainerStyle]}>
        <Text style={[themeTextStyle, styles.titleText]}>Voice News Reader</Text>
        {jsonResponse?.length > 0 && (
          <>
            <FlatList
              data={jsonResponse}
              keyExtractor={(item, index) => item.title + index}
              renderItem={({ item, index }) => (
                <View style={{ marginVertical: 10 }}>
                  <Text style={[themeTextStyle, { fontWeight: 'bold' }]}>[{index}] {item.title}</Text>
                </View>
              )}
            />
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="Enter article index to load"
              value={articleIndex.toString()}
              onChangeText={(text) => setArticleIndex(Number(text))}
            />
            <Button
              title="Load Article"
              onPress={() => {
                if (!jsonResponse || articleIndex < 0 || articleIndex >= jsonResponse.length) {
                  setError('Invalid article index');
                  return;
                }
                processArticle(jsonResponse[articleIndex]);
              }}
            />
          </>
        )}
        {error && <Text style={themeTextStyle}>{error}</Text>}
        {loading && <Text style={themeTextStyle}>Loading...</Text>}
        {content !== '' && (
          <ScrollView contentContainerStyle={styles.contentContainer}>
            <Text style={themeTextStyle}>{content}</Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  lightContainer: { backgroundColor: '#D0D0D0' },
  darkContainer: { backgroundColor: '#353636' },
  lightThemeText: { color: '#353636' },
  darkThemeText: { color: '#D0D0D0' },
  titleText: { paddingTop: 20, fontWeight: 'bold', fontSize: 30 },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 20,
    paddingLeft: 8,
    width: '80%',
  },
  contentContainer: {
    marginTop: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: 'gray',
  },
});
