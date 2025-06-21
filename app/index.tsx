// Voice-driven Q&A app using Expo TTS and speech-to-text API
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
  const [fetchedArticle, setFetchedArticle] = useState<any | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const allArticlesRef = useRef<any[]>([]);
  const [allArticles, setAllArticles] = useState<any[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isInArticleSelection, setIsInArticleSelection] = useState(false);

  const steps = [
    {
      key: "topic",
      question:
        "What would you like to read about today? You can say 'skip' to skip this.",
    },
    {
      key: "outlet",
      question:
        "What specific outlet would you like to choose? You can say 'skip' to skip this.",
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

  useEffect(() => {
    const executeFetch = async () => {
      // Convert empty strings to null for the API call
      const topicParam = answers.topic?.trim() || "";
      const outletParam = answers.outlet?.trim() || "";

      console.log(
        `Fetching articles with topic: ${topicParam}, outlet: ${outletParam}`
      );

      const articles = await fetchArticles(topicParam, outletParam);

      if (!articles || articles.length === 0) {
        Speech.speak("No articles were found for the given topic and source");
        return;
      }

      // Store in both state (for UI display) and ref (for immediate access)
      setAllArticles(articles);
      allArticlesRef.current = articles;
      setCurrentPageIndex(0);
      setIsInArticleSelection(true);
      speakArticlesPage(articles, 0);
    };

    if (stepIndex >= steps.length && !isInArticleSelection) {
      executeFetch();
    } else if (stepIndex < steps.length) {
      runCurrentStep();
    }
  }, [stepIndex]);

  const speakArticlesPage = (articles: any[], pageIndex: number) => {
    const start = pageIndex * 5;
    const currentPage = articles.slice(start, start + 5);

    console.log(
      `📋 Speaking page ${pageIndex + 1}, articles ${start + 1}-${
        start + currentPage.length
      }`
    );
    console.log(
      "📋 Current page articles:",
      currentPage.map((a) => a.title)
    );

    if (currentPage.length === 0) {
      Speech.speak("No more articles available.");
      return;
    }

    const titles = currentPage.map(
      (article, i) => `Article ${i + 1}: ${article.title}`
    );

    const hasMorePages = start + 5 < articles.length;
    const prompt = hasMorePages
      ? "Say a number from 1 to 5 to choose an article, or say 'more' to hear the next 5 articles."
      : "Say a number from 1 to 5 to choose an article.";

    const text = titles.join(". ") + ". " + prompt;

    isSpeakingRef.current = true;
    setIsSpeaking(true);

    Speech.speak(text, {
      onDone: () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(
          () => safeStartRecording("articleSelection", currentPage),
          500
        );
      },
      onError: () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(
          () => safeStartRecording("articleSelection", currentPage),
          500
        );
      },
    });
  };

  const handleArticleSelection = (spokenText: string, currentPage: any[]) => {
    const numberWords: { [key: string]: number } = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
    };

    const normalized = spokenText.toLowerCase().trim();

    if (normalized === "more") {
      const nextPageIndex = currentPageIndex + 1;
      const start = nextPageIndex * 5;

      console.log(
        `🔄 User said "more". Current page: ${currentPageIndex}, Next page: ${nextPageIndex}`
      );
      console.log(
        `🔄 Total articles: ${allArticlesRef.current.length}, Start index: ${start}`
      ); // Use ref here!

      if (start < allArticlesRef.current.length) {
        // Use ref here!
        console.log(`✅ Moving to next page ${nextPageIndex}`);
        setCurrentPageIndex(nextPageIndex);
        speakArticlesPage(allArticlesRef.current, nextPageIndex); // Use ref here!
      } else {
        console.log(`❌ No more articles available`);
        Speech.speak(
          "No more articles available. Please choose from the current list."
        );
        // Go back to current page
        timeoutRef.current = setTimeout(
          () => safeStartRecording("articleSelection", currentPage),
          1000
        );
      }
      return;
    }

    let selectedIndex = -1;
    if (!isNaN(Number(normalized))) {
      selectedIndex = Number(normalized) - 1;
    } else if (numberWords[normalized]) {
      selectedIndex = numberWords[normalized] - 1;
    }

    if (selectedIndex >= 0 && selectedIndex < currentPage.length) {
      setIsInArticleSelection(false);
      processArticle(currentPage[selectedIndex]);
    } else {
      const hasMorePages =
        (currentPageIndex + 1) * 5 < allArticlesRef.current.length; // Use ref here!
      const errorMessage = hasMorePages
        ? "I did not understand. Say a number from 1 to 5 to choose an article, or say 'more' for the next page."
        : "I did not understand. Say a number from 1 to 5 to choose an article.";

      Speech.speak(errorMessage, {
        onDone: () => {
          timeoutRef.current = setTimeout(
            () => safeStartRecording("articleSelection", currentPage),
            500
          );
        },
      });
    }
  };

  const runCurrentStep = () => {
    if (stepIndex >= steps.length) return;

    const current = steps[stepIndex];
    isSpeakingRef.current = true;
    setIsSpeaking(true);

    Speech.speak(current.question, {
      onDone: () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(
          () => safeStartRecording(current.key),
          500
        );
      },
      onError: () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(
          () => safeStartRecording(current.key),
          500
        );
      },
    });
  };

  const safeStartRecording = async (
    stepKey: keyof typeof answers | "articleSelection",
    articles: any[] = []
  ) => {
    if (isRecording || isProcessingRef.current || isSpeakingRef.current) return;
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
      setRecording(null);
    }

    if (stepKey === "articleSelection") {
      await startRecording("articleSelection" as any);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await stopAndTranscribeForArticleSelection(articles);
      return;
    }

    await startRecording(stepKey);
  };

  const startRecording = async (stepKey: keyof typeof answers) => {
    try {
      if (recordingRef.current) return;

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

      if (stepKey !== "articleSelection") {
        timeoutRef.current = setTimeout(() => stopAndTranscribe(stepKey), 5000);
      }
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  };

  const stopAndTranscribeForArticleSelection = async (
    currentPageArticles: any[]
  ) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const currentRecording = recordingRef.current;
      if (!currentRecording) {
        isProcessingRef.current = false;
        return;
      }
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
          const response = pollingData.text.replace(/[.。！？!?]+$/, "");
          console.log("Article selection response:", response);

          isProcessingRef.current = false;
          handleArticleSelection(response, currentPageArticles);
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

  const stopAndTranscribe = async (currentStep: keyof typeof answers) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const currentRecording = recordingRef.current;
      if (!currentRecording) {
        isProcessingRef.current = false;
        return;
      }
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
          const response = pollingData.text.replace(/[.。！？!?]+$/, "");

          // Check if user said "skip"
          const normalizedResponse = response.toLowerCase().trim();
          if (
            normalizedResponse === "skip" ||
            normalizedResponse.includes("skip")
          ) {
            console.log(`User skipped ${currentStep}`);

            // Set the answer to null/empty for this step
            setAnswers((prev) => ({ ...prev, [currentStep]: "" }));
            setTranscribedText(
              (prev: string) => `${prev}\n${currentStep}: [SKIPPED]`
            );

            // Acknowledge the skip and move to next step
            isSpeakingRef.current = true;
            setIsSpeaking(true);
            Speech.speak(
              `Skipping ${
                currentStep === "topic" ? "topic selection" : "outlet selection"
              }.`,
              {
                onDone: () => {
                  isSpeakingRef.current = false;
                  setIsSpeaking(false);
                  isProcessingRef.current = false;
                  setStepIndex((prev) => prev + 1);
                },
                onError: () => {
                  isSpeakingRef.current = false;
                  setIsSpeaking(false);
                  isProcessingRef.current = false;
                  setStepIndex((prev) => prev + 1);
                },
              }
            );
          } else {
            // Normal processing - not a skip
            setTranscribedText(
              (prev: string) => `${prev}\n${currentStep}: ${response}`
            );
            setAnswers((prev) => ({ ...prev, [currentStep]: response }));

            isSpeakingRef.current = true;
            setIsSpeaking(true);
            Speech.speak("You said: " + response, {
              onDone: () => {
                isSpeakingRef.current = false;
                setIsSpeaking(false);
                isProcessingRef.current = false;
                setStepIndex((prev) => prev + 1);
              },
              onError: () => {
                isSpeakingRef.current = false;
                setIsSpeaking(false);
                isProcessingRef.current = false;
                setStepIndex((prev) => prev + 1);
              },
            });
          }
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

  const fetchArticles = async (q: string, s: string) => {
    const url = `https://getnews-px5bnsfj3q-uc.a.run.app${s || q ? "?" : ""}${
      s ? `source=${s.toLowerCase().replace(/\s+/g, "-")}` : ""
    }${s && q ? "&" : ""}${q ? `q=${q}` : ""}`;
    try {
      console.log("🔍 Fetching articles from:", url);
      setLoading(true);
      const response = await axios.get(url, { timeout: 10000 });
      const articles = response.data.articles;
      console.log("📎 API Response:", articles?.length, "articles found");
      return articles.length > 0 ? articles : null;
    } catch (err) {
      console.error("Fetch error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const processArticle = async (article) => {
    try {
      console.log("🔗 Processing article:", article);
      console.log("🔗 Article URL:", article.url);
      console.log("🔗 Article title:", article.title);
      console.log("🔗 Article description:", article.description);

      // First, try to use the article content/description from the API if available
      const res = await axios.get(article.url);
      const parsed = HTMLParser.parse(res.data);
      const decode = (str) => he.decode(str);

      // Recursively extract text from nodes
      const extractText = (node) => {
        if (!node) return [];
        if (Array.isArray(node)) return node.flatMap(extractText);

        // Text node
        if (node.nodeType === 3) return [node.rawText?.trim()].filter(Boolean);

        // Tag node with children
        if (node.nodeType === 1 && node.childNodes?.length)
          return node.childNodes.flatMap(extractText);

        return [];
      };

      // Recursively find the <body> tag
      const findBody = (nodes) => {
        if (!Array.isArray(nodes)) return null;
        for (const node of nodes) {
          if (node.tagName?.toLowerCase() === "body") return node;
          if (node.childNodes?.length) {
            const found = findBody(node.childNodes);
            if (found) return found;
          }
        }
        return null;
      };

      const body = findBody(parsed.childNodes);
      const articleContent = body ? decode(extractText(body).join("\n")) : "";

      console.log("📰 Final content length:", articleContent.length);
      console.log(
        "📰 Final content preview:",
        articleContent.slice(0, 300) + "..."
      );

      if (!articleContent || articleContent.trim().length <= 0) {
        throw new Error("Could not extract meaningful content from article");
      }

      setContent(articleContent);

      // Split into words and read every 5 words
      const words = articleContent
        .split(/\s+/)
        .filter((word) => word.trim().length > 0);

      console.log(`📖 Starting to read ${words.length} words in groups of 5`);

      isSpeakingRef.current = true;
      setIsSpeaking(true);

      // Read in groups of 5 words
      for (let i = 0; i < words.length; i += 5) {
        // Check if we should stop (user pressed stop button)
        if (!isSpeakingRef.current) {
          console.log("📖 Reading stopped by user");
          break;
        }

        // Get next 5 words (or remaining words if less than 5)
        const wordGroup = words.slice(i, i + 5);
        const phrase = wordGroup.join(" ");

        // Clean punctuation for better speech
        const cleanPhrase = phrase.replace(/["""'']/g, "").trim();

        console.log(
          `📖 Reading group ${Math.floor(i / 5) + 1}: "${cleanPhrase}"`
        );

        await new Promise<void>((resolve) => {
          Speech.speak(cleanPhrase, {
            rate: 0.85,
            pitch: 1.0,
            onDone: () => {
              console.log(`✅ Finished speaking: "${cleanPhrase}"`);
              resolve();
            },
            onError: (error) => {
              console.error("❌ Speech error for phrase:", cleanPhrase, error);
              resolve();
            },
          });
        });

        // Add pause between word groups
        if (isSpeakingRef.current) {
          // Longer pause if the last word in group ends with sentence punctuation
          const lastWord = wordGroup[wordGroup.length - 1];
          if (lastWord && lastWord.match(/[.!?]$/)) {
            await new Promise((resolve) => setTimeout(resolve, 800));
          } else if (lastWord && lastWord.match(/[,;:]$/)) {
            await new Promise((resolve) => setTimeout(resolve, 400));
          } else {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }

        // Progress update every 10 groups (50 words)
        if ((i + 5) % 50 === 0) {
          const progress = Math.min(
            Math.round(((i + 5) / words.length) * 100),
            100
          );
          console.log(
            `📖 Progress: ${i + 5}/${words.length} words (${progress}%)`
          );
        }
      }

      isSpeakingRef.current = false;
      setIsSpeaking(false);

      // Announce completion if not stopped by user
      if (isSpeakingRef.current !== false) {
        Speech.speak("Article reading completed.", {
          onDone: () => {
            console.log("📖 Article reading finished successfully");
          },
        });
      }
    } catch (err) {
      console.error("❌ Article processing failed:", err);
      isSpeakingRef.current = true;
      setIsSpeaking(true);

      const errorMessage = err.message?.includes("extract meaningful content")
        ? "Could not extract readable content from this article. Please try a different article."
        : "There was an error processing the article. Please try again.";

      Speech.speak(errorMessage, {
        onDone: () => {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
        },
        onError: () => {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
        },
      });
    }
  };

  const stopSpeaking = () => {
    console.log("🛑 Stop button pressed");
    Speech.stop();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  };

  const getCurrentStepDisplay = () => {
    if (stepIndex < steps.length) {
      return steps[stepIndex]?.key;
    } else if (isInArticleSelection) {
      return "Selecting Article";
    } else {
      return "Reading Article";
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, themeContainerStyle]}>
        <Text style={[themeTextStyle, styles.titleText]}>News Reader</Text>
        <Text style={[styles.text, themeTextStyle]}>
          Step: {getCurrentStepDisplay()}
        </Text>
        <Text style={[styles.text, themeTextStyle]}>
          Topic: {answers.topic || "N/A"}
        </Text>
        <Text style={[styles.text, themeTextStyle]}>
          Outlet: {answers.outlet || "N/A"}
        </Text>

        {isInArticleSelection && (
          <Text style={[styles.text, themeTextStyle]}>
            Articles found: {allArticles.length} | Page: {currentPageIndex + 1}{" "}
            of {Math.ceil(allArticles.length / 5)}
          </Text>
        )}

        {loading && (
          <>
            <ActivityIndicator size="large" color="blue" />
            <Text style={[styles.text, themeTextStyle]}>
              Loading articles...
            </Text>
          </>
        )}

        {isRecording && (
          <>
            <ActivityIndicator size="large" color="tomato" />
            <Text style={[styles.text, themeTextStyle]}>Recording...</Text>
          </>
        )}

        {isSpeaking && (
          <>
            <ActivityIndicator size="large" color="green" />
            <Text style={[styles.text, themeTextStyle]}>Speaking...</Text>
            <Button title="Stop Reading" onPress={stopSpeaking} color="red" />
          </>
        )}

        {stepIndex < steps.length && !isInArticleSelection && (
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
            disabled={isSpeaking || loading}
          />
        )}

        {content && (
          <Text style={[styles.contentText, themeTextStyle]} numberOfLines={15}>
            {content}
          </Text>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    padding: 20,
  },
  lightContainer: {
    backgroundColor: "#D0D0D0",
  },
  darkContainer: {
    backgroundColor: "#353636",
  },
  lightThemeText: {
    color: "#353636",
  },
  darkThemeText: {
    color: "#D0D0D0",
  },
  text: {
    fontSize: 16,
    marginBottom: 12,
    textAlign: "center",
  },
  titleText: {
    paddingTop: 20,
    paddingBottom: 20,
    fontWeight: "bold",
    fontSize: 32,
    textAlign: "center",
  },
  contentText: {
    fontSize: 14,
    marginTop: 20,
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 8,
    maxHeight: 300,
  },
});
