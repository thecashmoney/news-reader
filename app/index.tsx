// Voice-driven Q&A app using built-in TTS and speech-to-text API

import axios from "axios";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as Speech from "expo-speech";
import HTMLParser from "fast-html-parser";
import * as he from "he";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  StyleSheet,
  Text,
  useColorScheme,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function App() {
  const colorScheme = useColorScheme();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [answers, setAnswers] = useState<{ [key: string]: string }>({
    topic: "",
    outlet: "",
    articlePreference: "",
    satisfaction: "",
    outletPreference: "",
    nextTopic: "",
  });
  const [transcribedText, setTranscribedText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [jsonResponse, setJsonResponse] = useState(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const steps = [
    { key: "topic", question: "What would you like to read about today" },
    {
      key: "outlet",
      question: "What specific outlet would you like to choose",
    },
  ];

  const themeTextStyle =
    colorScheme === "light" ? styles.lightThemeText : styles.darkThemeText;
  const themeContainerStyle =
    colorScheme === "light" ? styles.lightContainer : styles.darkContainer;

  useEffect(() => {
    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert("Permission to access microphone was denied");
        return;
      }
      runCurrentStep();
    })();
  }, []);

  // useEffect(() => {
  //   if (stepIndex < steps.length) {
  //     runCurrentStep();
  //   } else {
  //     Speech.speak("Fetching articles for you now");
  //     if (answers.topic && answers.outlet)
  //       fetchArticles(answers.topic, answers.outlet);
  //     else if (answers.topic) fetchArticles(answers.topic, null);
  //     else if (answers.outlet) fetchArticles(answers.outlet, null);
  //     else await fetchArticles(null, null);

  //     console.log(jsonResponse);
  //     processArticle(jsonResponse[0]);
  //     Speech.speak(content);
  //   }
  // }, [stepIndex]);

  useEffect(() => {
    const executeFetch = async () => {
      Speech.speak("Fetching articles for you now");
      if (answers.topic && answers.outlet)
        await fetchArticles(answers.topic, answers.outlet);
      else if (answers.topic) await fetchArticles(answers.topic, null);
      else if (answers.outlet) await fetchArticles(answers.outlet, null);
      else await fetchArticles(null, null);
      console.log(jsonResponse[0]);
      await processArticle(jsonResponse[0]);
      Speech.speak(content);
    };

    useEffect(() => {
  const executeFetch = async () => {
    Speech.speak('Fetching articles for you now');
    await fetchArticles(
      answers.topic?.trim() || '',
      answers.outlet?.trim() || ''
    );
    if (jsonResponse) {
      await processArticle(jsonResponse[0]);
      Speech.speak(content);
    } else {
      Speech.speak('No articles were found for the given topic and source');
    }
  };

  if (stepIndex >= steps.length) {
    executeFetch();
  } else {
    runCurrentStep();
  }
}, [stepIndex]);


    if (stepIndex >= steps.length) {
      executeFetch();
    } else {
      runCurrentStep();
    }
  }, [stepIndex]);

  const runCurrentStep = () => {
    const current = steps[stepIndex];
    isSpeakingRef.current = true;
    Speech.speak(current.question, {
      onDone: () => {
        isSpeakingRef.current = false;
        setTimeout(() => safeStartRecording(current.key), 500);
      },
      onError: () => {
        isSpeakingRef.current = false;
        setTimeout(() => safeStartRecording(current.key), 500);
      },
    });
  };

  const safeStartRecording = async (stepKey: keyof typeof answers) => {
    if (isRecording || isProcessingRef.current || isSpeakingRef.current) return;
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (err) {
        console.log("Safe stop failed (may have already been stopped)", err);
      }
      recordingRef.current = null;
      setRecording(null);
    }
    await startRecording(stepKey);
  };

  const startRecording = async (stepKey: keyof typeof answers) => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await newRecording.startAsync();
      recordingRef.current = newRecording;
      setRecording(newRecording);
      setIsRecording(true);

      timeoutRef.current = setTimeout(() => stopAndTranscribe(stepKey), 5000);
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  };

  const stopAndTranscribe = async (currentStep: keyof typeof answers) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const currentRecording = recordingRef.current;
      if (!currentRecording) return;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();
      recordingRef.current = null;
      setRecording(null);
      setIsRecording(false);

      if (!uri) {
        console.error("Recording URI is null");
        isProcessingRef.current = false;
        return;
      }

      const uploadRes = await FileSystem.uploadAsync(
        "https://api.assemblyai.com/v2/upload",
        uri,
        {
          httpMethod: "POST",
          headers: { authorization: "e8dd923d1a4143d29f0bc0a7a2c119dd" },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        }
      );

      const uploadData = JSON.parse(uploadRes.body);
      const audioUrl = uploadData.upload_url;

      const transcriptRes = await fetch(
        "https://api.assemblyai.com/v2/transcript",
        {
          method: "POST",
          headers: {
            authorization: "e8dd923d1a4143d29f0bc0a7a2c119dd",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ audio_url: audioUrl }),
        }
      );

      const transcriptData = await transcriptRes.json();
      const transcriptId = transcriptData.id;

      let completed = false;
      while (!completed) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollingRes = await fetch(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          {
            headers: { authorization: "e8dd923d1a4143d29f0bc0a7a2c119dd" },
          }
        );
        const pollingData = await pollingRes.json();

        if (pollingData.status === "completed") {
          const response = pollingData.text;
          setTranscribedText(
            (prev: string) => `${prev}\n${currentStep}: ${response}`
          );
          setAnswers((prev) => ({ ...prev, [currentStep]: response }));

          isSpeakingRef.current = true;
          Speech.speak("You said: " + response, {
            onDone: () => {
              isSpeakingRef.current = false;
              isProcessingRef.current = false;
              setStepIndex((prev) => prev + 1);
            },
            onError: () => {
              isSpeakingRef.current = false;
              isProcessingRef.current = false;
            },
          });
          completed = true;
        } else if (pollingData.status === "error") {
          console.error("Transcription error:", pollingData.error);
          completed = true;
          isProcessingRef.current = false;
        }
      }
    } catch (error) {
      console.error("Transcription failed:", error);
      isProcessingRef.current = false;
    }
  };

  // const fetchArticles = async (q, s) => {
  //   const url = `https://getnews-px5bnsfj3q-uc.a.run.app${s || q ? "?" : ""}${
  //     s ? `source=${s.toLowerCase().replace(/\s+/g, "-")}` : ""
  //   }${s && q ? "&" : ""}${q ? `q=${q}` : ""}`;
  //   try {
  //     setLoading(true);
  //     const response = await axios.get(url);
  //     setJsonResponse(response.data.articles);
  //   } catch (err) {
  //     console.error("Fetch error:", err);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const fetchArticles = async (q, s) => {
  const url = `https://getnews-px5bnsfj3q-uc.a.run.app${s || q ? '?' : ''}${s ? `source=${s.toLowerCase().replace(/\s+/g, '-')}` : ''}${s && q ? '&' : ''}${q ? `q=${q}` : ''}`;
  try {
    setLoading(true);
    const response = await axios.get(url);
    const articles = response.data.articles;
    return articles?.length > 0 ? articles[0] : null;
  } catch (err) {
    console.error('Fetch error:', err);
    return null;
  } finally {
    setLoading(false);
  }
};


  const processArticle = async (article: any) => {
    try {
      const res = await axios.get(article.url);
      const parsed = HTMLParser.parse(res.data);
      const decode = (str: string) => he.decode(str);
      const extractText = (node: any): string[] => {
        if (!node) return [];
        if (Array.isArray(node)) return node.flatMap(extractText);
        if (node.type === "text") return [node.content?.trim()].filter(Boolean);
        if (node.type === "tag" && node.children)
          return node.children.flatMap(extractText);
        return [];
      };
      const findBody = (nodes: any[]): any => {
        for (const n of nodes) {
          if (n.type === "tag" && n.name === "body") return n;
          if (n.children?.length) {
            const found = findBody(n.children);
            if (found) return found;
          }
        }
        return null;
      };
      const body = findBody(parsed.childNodes);
      const fullText = decode(extractText(body).join("\n"));
      console.log("📰 Article Content:\n", fullText);
      setContent(fullText);
      setTimeout(() => Speech.speak(fullText), 1000);
    } catch (err) {
      console.error("Article parsing failed:", err);
      Speech.speak("There was an error processing the article");
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, themeContainerStyle]}>
        <Text style={[themeTextStyle, styles.titleText]}>News Reader</Text>
        <Text style={styles.text}>Step: {steps[stepIndex]?.key ?? "done"}</Text>
        <Text style={styles.text}>Transcribed Text: {transcribedText}</Text>
        <Text style={styles.text}>Topic: {answers.topic || "N/A"}</Text>
        <Text style={styles.text}>Outlet: {answers.outlet || "N/A"}</Text>
        {loading && <ActivityIndicator size="large" color="blue" />}
        {isRecording && <ActivityIndicator size="large" color="tomato" />}
        <Text style={styles.text}>{content}</Text>
        <Button
          title={isRecording ? "Stop Recording" : "Start Recording"}
          onPress={
            isRecording
              ? () =>
                  stopAndTranscribe(
                    steps[stepIndex]?.key as keyof typeof answers
                  )
              : () =>
                  safeStartRecording(
                    steps[stepIndex]?.key as keyof typeof answers
                  )
          }
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  lightContainer: {
    backgroundColor: "#D0D0D0",
  },
  darkContainer: {
    backgroundColor: "#353636",
  },
  lightThemeText: {
    color: "#353636",
    justifyContent: "center",
    backgroundColor: "#ecf0f1",
    padding: 16,
  },
  darkThemeText: {
    color: "#D0D0D0",
  },
  text: {
    fontSize: 18,
    marginBottom: 16,
  },
  titleText: {
    paddingTop: 20,
    fontWeight: "bold",
    fontSize: 40,
  },
});
