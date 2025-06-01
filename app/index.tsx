import React, { useEffect, useState } from 'react';
import { View, ScrollView, Text, StyleSheet, useColorScheme, FlatList } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import axios from 'axios';
import HTMLParser from 'html-parse-stringify';
import he from 'he';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';


export default function App() {
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [step, setStep] = useState<'topic' | 'outlet' | 'read'>('topic');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [jsonResponse, setJsonResponse] = useState(null);
  const [content, setContent] = useState('');
  const [articleIndex, setArticleIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [transcriptionDisplay, setTranscriptionDisplay] = useState('');
  const colorScheme = useColorScheme();


  useEffect(() => {
    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        alert('Permission to access microphone was denied');
        return;
      }
      askQuestion('What would you like to read about today?', 'topic');
    })();
  }, []);


  const askQuestion = (prompt, nextStep) => {
    setStep(nextStep);
    Speech.speak(prompt, {
      onDone: async () => {
        await safeStartRecording();
        setTimeout(() => {
          stopAndTranscribe(nextStep);
        }, 5000);
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
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRecording.startAsync();
      setRecording(newRecording);
      setIsRecording(true);
    } catch (err) {
      console.error('Recording start error:', err);
    }
  };


  const stopAndTranscribe = async (currentStep) => {
    try {
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setIsRecording(false);
      if (!uri) return;


      const uploadRes = await FileSystem.uploadAsync('https://api.assemblyai.com/v2/upload', uri, {
        httpMethod: 'POST',
        headers: { authorization: 'YOUR_ASSEMBLYAI_API_KEY' },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });


      const audioUrl = JSON.parse(uploadRes.body).upload_url;


      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { authorization: 'YOUR_ASSEMBLYAI_API_KEY', 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: audioUrl }),
      });


      const { id: transcriptId } = await transcriptRes.json();


      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
          headers: { authorization: 'YOUR_ASSEMBLYAI_API_KEY' },
        });
        const data = await res.json();
        if (data.status === 'completed') {
          const text = data.text;
          console.log(`📝 Transcribed (${currentStep}):`, text);
          setTranscriptionDisplay(text);


          if (currentStep === 'topic') {
            setQuery(text);
            fetchArticles(text, source);
            Speech.speak('You said: ' + text, {
              onDone: () => askQuestion('Would you like to choose a specific outlet?', 'outlet'),
            });
          } else if (currentStep === 'outlet') {
            setSource(text);
            fetchArticles(query, text);
            Speech.speak('You said: ' + text, {
              onDone: () => askQuestion('Say the number of the article you want to hear.', 'read'),
            });
          } else if (currentStep === 'read') {
            Speech.speak('You said: ' + text);
            const match = text.match(/\d+/);
            const index = match ? parseInt(match[0], 10) : -1;
            if (!isNaN(index) && jsonResponse && index < jsonResponse.length) {
              setArticleIndex(index);
              await processArticle(jsonResponse[index]);
              Speech.speak(content || 'Sorry, no content available.');
            } else {
              Speech.speak('Invalid number. Please try again.');
              askQuestion('Please say the number of the article you want to hear.', 'read');
            }
          }
          done = true;
        } else if (data.status === 'error') {
          console.error('Transcription error:', data.error);
          done = true;
        }
      }
    } catch (err) {
      console.error('Transcription failed:', err);
    }
  };


  const fetchArticles = async (q, s) => {
    const url = `https://getnews-px5bnsfj3q-uc.a.run.app${s || q ? '?' : ''}${s ? `source=${s.toLowerCase().replace(/\s+/g, '-')}` : ''}${s && q ? '&' : ''}${q ? `q=${q}` : ''}`;
    try {
      setLoading(true);
      const response = await axios.get(url);
      setJsonResponse(response.data.articles);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };


  const processArticle = async (article) => {
    try {
      const res = await axios.get(article.url);
      const parsed = HTMLParser.parse(res.data);
      const decode = (str) => he.decode(str);
      const extractText = (node) => {
        if (!node) return [];
        if (Array.isArray(node)) return node.flatMap(extractText);
        if (node.type === 'text') return [node.content?.trim()].filter(Boolean);
        if (node.type === 'tag' && node.children) return node.children.flatMap(extractText);
        return [];
      };
      const findBody = (nodes) => {
        for (const n of nodes) {
          if (n.type === 'tag' && n.name === 'body') return n;
          if (n.children?.length) {
            const found = findBody(n.children);
            if (found) return found;
          }
        }
        return null;
      };
      const body = findBody(parsed);
      setContent(decode(extractText(body).join('\n')));
    } catch (err) {
      console.error('Article parsing failed:', err);
    }
  };


  const themeStyle = colorScheme === 'light' ? styles.lightThemeText : styles.darkThemeText;
  const containerStyle = colorScheme === 'light' ? styles.lightContainer : styles.darkContainer;


  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, containerStyle]}>
        <ScrollView contentContainerStyle={styles.scrollView}>
          <Text style={[themeStyle, styles.title]}>Voice News Reader</Text>
          <Text style={themeStyle}>Latest response: {transcriptionDisplay}</Text>
          {jsonResponse?.length > 0 && (
            <FlatList
              data={jsonResponse}
              keyExtractor={(item, index) => item.title + index}
              renderItem={({ item, index }) => (
                <View style={{ marginVertical: 10 }}>
                  <Text style={[themeStyle, { fontWeight: 'bold' }]}>[{index}] {item.title}</Text>
                </View>
              )}
            />
          )}
          {loading && <Text style={themeStyle}>Loading...</Text>}
          {content !== '' && (
            <ScrollView contentContainerStyle={styles.contentContainer}>
              <Text style={themeStyle}>{content}</Text>
            </ScrollView>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  scrollView: { paddingHorizontal: 20, paddingBottom: 60 },
  lightContainer: { backgroundColor: '#F2F2F2' },
  darkContainer: { backgroundColor: '#1C1C1E' },
  lightThemeText: { color: '#1C1C1E' },
  darkThemeText: { color: '#F2F2F2' },
  title: { fontSize: 30, fontWeight: 'bold', paddingTop: 20 },
  contentContainer: { marginTop: 20, padding: 10, borderWidth: 1, borderColor: 'gray' },
});