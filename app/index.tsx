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
  const [shouldFetchArticles, setShouldFetchArticles] = useState(false); // Add this flag

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

  // Function to reset the entire app state
  const resetAppState = () => {
    console.log("🔄 Resetting app to start");

    // Stop any ongoing speech
    Speech.stop();

    // Clear timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Stop any ongoing recording
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch(() => { });
      recordingRef.current = null;
    }

    // Reset all state
    setAnswers({
      topic: "",
      outlet: "",
      articlePreference: "",
      satisfaction: "",
      outletPreference: "",
      nextTopic: "",
    });
    setTranscribedText("");
    setIsRecording(false);
    setStepIndex(0);
    setContent("");
    setLoading(false);
    setFetchedArticle(null);
    setIsSpeaking(false);
    setAllArticles([]);
    setCurrentPageIndex(0);
    setIsInArticleSelection(false);
    setShouldFetchArticles(false); // Reset the flag

    // Reset refs
    isProcessingRef.current = false;
    isSpeakingRef.current = false;
    allArticlesRef.current = [];
    setRecording(null);

    // Start the flow again after a brief delay
    setTimeout(() => {
      runCurrentStep();
    }, 1000);
  };

  const configureAudioSession = async () => {
    try {
      await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      playsInSilentModeIOS: false,
      shouldDuckAndroid: true,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      playThroughEarpieceAndroid: false, // (Android only)
});
    } catch (error) {
      console.error('Failed to configure audio session:', error);
    }
  };

  useEffect(() => {
    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert("Permission to access microphone was denied");
        return;
      }
      await configureAudioSession();
      runCurrentStep();
    })();
  }, []);

  // Modified useEffect to handle both step progression and article fetching
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
        Speech.speak("No articles were found for the given topic and source. Let's try again with different criteria.", { volume: 1.0 });
        // Reset and start over instead of just calling resetAppState
        setTimeout(() => {
          resetAppState();
        }, 2000);
        return;
      }

      // Store in both state (for UI display) and ref (for immediate access)
      setAllArticles(articles);
      allArticlesRef.current = articles;
      setCurrentPageIndex(0);
      setIsInArticleSelection(true);
      setShouldFetchArticles(false); // Reset the flag after successful fetch
      speakArticlesPage(articles, 0);
    };

    // Check if we should fetch articles (completed all steps and flag is set)
    if (stepIndex >= steps.length && shouldFetchArticles && !isInArticleSelection) {
      executeFetch();
    } else if (stepIndex < steps.length) {
      runCurrentStep();
    }
  }, [stepIndex, shouldFetchArticles]); // Add shouldFetchArticles to dependencies

  const speakArticlesPage = (articles: any[], pageIndex: number) => {
    const start = pageIndex * 5;
    const currentPage = articles.slice(start, start + 5);

    console.log(
      `📋 Speaking page ${pageIndex + 1}, articles ${start + 1}-${start + currentPage.length
      }`
    );
    console.log(
      "📋 Current page articles:",
      currentPage.map((a) => a.title)
    );

    if (currentPage.length === 0) {
      Speech.speak("No more articles available.", { volume: 1.0 });
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
      volume: 1.0,
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
          "No more articles available. Please choose from the current list.", { volume: 1.0 }
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
        volume: 1.0,
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
      volume: 1.0,
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
    stepKey: keyof typeof answers | "articleSelection" | "postArticle",
    articles: any[] = []
  ) => {
    if (isRecording || isProcessingRef.current || isSpeakingRef.current) return;
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch { }
      recordingRef.current = null;
      setRecording(null);
    }

    if (stepKey === "articleSelection") {
      await startRecording("articleSelection" as any);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await stopAndTranscribeForArticleSelection(articles);
      return;
    }

    if (stepKey === "postArticle") {
      await startRecording("postArticle" as any);
      // Record for 5 seconds then process
      timeoutRef.current = setTimeout(() => stopAndTranscribe("postArticle" as any), 5000);
      return;
    }

    await startRecording(stepKey);
  };

  const startRecording = async (stepKey: keyof typeof answers | "articleSelection" | "postArticle") => {
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

      if (stepKey !== "articleSelection" && stepKey !== "postArticle") {
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
        "https://transcribe-px5bnsfj3q-uc.a.run.app",
        uri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        }
      );

      if (uploadRes.status == 200) {
        const response = JSON.parse(uploadRes.body);
        console.log("Article selection response:", response);
        isProcessingRef.current = false;
        handleArticleSelection(response, currentPageArticles);
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
        "https://transcribe-px5bnsfj3q-uc.a.run.app",
        uri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        }
      );

      if (uploadRes.status == 200) {
        const response = JSON.parse(uploadRes.body);
        if (currentStep === "postArticle") {
          // Handle post-article response
          isProcessingRef.current = false;
          handlePostArticleResponse(response);
          return; // Exit early for post-article handling
        }

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
            `Skipping ${currentStep === "topic" ? "topic selection" : "outlet selection"
            }.`,
            {
              volume: 1.0,
              onDone: () => {
                isSpeakingRef.current = false;
                setIsSpeaking(false);
                isProcessingRef.current = false;
                const nextStep = stepIndex + 1;
                setStepIndex(nextStep);
                
                // If we've completed all steps, trigger article fetch
                if (nextStep >= steps.length) {
                  setShouldFetchArticles(true);
                }
              },
              onError: () => {
                isSpeakingRef.current = false;
                setIsSpeaking(false);
                isProcessingRef.current = false;
                const nextStep = stepIndex + 1;
                setStepIndex(nextStep);
                
                // If we've completed all steps, trigger article fetch
                if (nextStep >= steps.length) {
                  setShouldFetchArticles(true);
                }
              },
            }
          );
        } else {
          // Normal processing - not a skip (EXISTING CODE STAYS HERE)
          setTranscribedText(
            (prev: string) => `${prev}\n${currentStep}: ${response}`
          );
          setAnswers((prev) => ({ ...prev, [currentStep]: response }));

          isSpeakingRef.current = true;
          setIsSpeaking(true);
          Speech.speak("You said: " + response, {
            volume: 1.0,
            onDone: () => {
              isSpeakingRef.current = false;
              setIsSpeaking(false);
              isProcessingRef.current = false;
              const nextStep = stepIndex + 1;
              setStepIndex(nextStep);
              
              // If we've completed all steps, trigger article fetch
              if (nextStep >= steps.length) {
                setShouldFetchArticles(true);
              }
            },
            onError: () => {
              isSpeakingRef.current = false;
              setIsSpeaking(false);
              isProcessingRef.current = false;
              const nextStep = stepIndex + 1;
              setStepIndex(nextStep);
              
              // If we've completed all steps, trigger article fetch
              if (nextStep >= steps.length) {
                setShouldFetchArticles(true);
              }
            },
          });
        }
      }
    } catch (error) {
      console.error("Transcription failed:", error);
      isProcessingRef.current = false;
    }
  };

  const fetchArticles = async (q: string, s: string) => {
    const url = `https://getnews-px5bnsfj3q-uc.a.run.app${s || q ? "?" : ""}${s ? `source=${s.toLowerCase().replace(/\s+/g, "-")}` : ""
      }${s && q ? "&" : ""}${q ? `q=${q}` : ""}`;
    try {
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

  const handlePostArticleResponse = (spokenText: string) => {
    const normalized = spokenText.toLowerCase().trim();

    console.log("📝 Post-article response:", normalized);

    // Clear the auto-reset timeout since user responded
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Check for positive responses
    const positiveResponses = ['yes', 'yeah', 'yep', 'sure', 'okay', 'ok', 'continue', 'another'];
    const negativeResponses = ['no', 'nope', 'stop', 'quit', 'exit', 'done', 'finish'];

    const isPositive = positiveResponses.some(word => normalized.includes(word));
    const isNegative = negativeResponses.some(word => normalized.includes(word));

    if (isPositive) {
      Speech.speak("Great! Let's find another article for you.", {
        volume: 1.0,
        onDone: () => {
          // Reset to start the flow again
          resetAppState();
        },
        onError: () => {
          resetAppState();
        }
      });
    } else if (isNegative) {
      Speech.speak("Thank you for using the news reader. Goodbye!", {
        volume: 1.0,
        onDone: () => {
          console.log("👋 User chose to exit");
          // You could add app exit logic here or just reset
          // For now, we'll reset after a longer delay
          setTimeout(() => {
            resetAppState();
          }, 5000);
        }
      });
    } else {
      // Unclear response, ask again
      Speech.speak("I didn't understand. Please say yes to read another article, or no to finish.", {
        volume: 1.0,
        onDone: () => {
          // Give them another chance to respond
          setTimeout(() => {
            safeStartRecording("postArticle" as any);
            // Shorter timeout for retry
            timeoutRef.current = setTimeout(() => {
              console.log("⏰ No clear response, restarting...");
              resetAppState();
            }, 8000);
          }, 500);
        }
      });
    }
  };

  const processArticle = async (article) => {
    try {
      console.log("🔗 Processing article:", article);
      console.log("🔗 Article URL:", article.url);
      console.log("🔗 Article title:", article.title);
      console.log("🔗 Article description:", article.description);

      const res = await axios.get(article.url);
      const parsed = HTMLParser.parse(res.data);
      const decode = (str) => he.decode(str);

      // Improved article content extraction
      const extractArticleContent = () => {
        // Strategy 1: Look for common article content selectors
        const articleSelectors = [
          'article',
          '[role="main"]',
          '.article-content',
          '.story-content',
          '.post-content',
          '.entry-content',
          '.content',
          '.article-body',
          '.story-body',
          '#article-body',
          '#content',
          '.main-content'
        ];

        // Strategy 2: Look for JSON-LD structured data
        const jsonLdScripts = parsed.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
          try {
            const data = JSON.parse(script.innerHTML);
            if (data.articleBody || (data['@type'] === 'Article' && data.text)) {
              return data.articleBody || data.text;
            }
          } catch (e) {
            // Continue to next strategy
          }
        }

        // Strategy 3: Try specific selectors first
        for (const selector of articleSelectors) {
          const element = parsed.querySelector(selector);
          if (element) {
            const content = extractCleanText(element);
            if (content && content.length > 200) { // Minimum content length
              console.log(`📰 Found content using selector: ${selector}`);
              return content;
            }
          }
        }

        // Strategy 4: Fallback - find the largest text block
        const body = findBody(parsed.childNodes);
        if (body) {
          return findLargestTextBlock(body);
        }

        return null;
      };

      // Enhanced text extraction with filtering
      const extractCleanText = (node) => {
        if (!node) return '';

        // Skip common non-article elements
        const skipTags = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'menu'];
        const skipClasses = ['navigation', 'nav', 'menu', 'sidebar', 'footer', 'header', 'ad', 'advertisement'];

        if (node.tagName && skipTags.includes(node.tagName.toLowerCase())) {
          return '';
        }

        if (node.classList) {
          for (const className of skipClasses) {
            if (node.classList.contains(className)) {
              return '';
            }
          }
        }

        // Text node
        if (node.nodeType === 3) {
          return node.rawText?.trim() || '';
        }

        // Element node
        if (node.nodeType === 1 && node.childNodes?.length) {
          return node.childNodes
            .map(child => extractCleanText(child))
            .filter(text => text.length > 0)
            .join(' ');
        }

        return '';
      };

      // Find the text block with most content (fallback strategy)
      const findLargestTextBlock = (body) => {
        const textBlocks = [];

        const findTextBlocks = (node, depth = 0) => {
          if (!node || depth > 10) return; // Prevent infinite recursion

          if (node.nodeType === 1) { // Element node
            const text = extractCleanText(node);
            if (text && text.length > 100) {
              textBlocks.push({
                text: text,
                length: text.length,
                element: node.tagName
              });
            }

            if (node.childNodes) {
              node.childNodes.forEach(child => findTextBlocks(child, depth + 1));
            }
          }
        };

        findTextBlocks(body);

        // Sort by length and return the largest block
        textBlocks.sort((a, b) => b.length - a.length);
        console.log("📰 Found text blocks:", textBlocks.slice(0, 3).map(b => ({
          length: b.length,
          element: b.element,
          preview: b.text.slice(0, 100) + '...'
        })));

        return textBlocks[0]?.text || '';
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

      // Clean up the extracted content
      const cleanContent = (content) => {
        if (!content) return '';

        return content
          // Remove multiple whitespaces and newlines
          .replace(/\s+/g, ' ')
          // Remove common navigation text patterns
          .replace(/skip to content/gi, '')
          .replace(/subscribe to newsletter/gi, '')
          .replace(/sign up for our newsletter/gi, '')
          .replace(/follow us on/gi, '')
          .replace(/share this article/gi, '')
          .replace(/related articles?/gi, '')
          .replace(/advertisement/gi, '')
          // Remove standalone single characters or numbers
          .replace(/\b[a-zA-Z0-9]\b/g, '')
          // Clean up extra spaces
          .replace(/\s+/g, ' ')
          .trim();
      };

      // Extract article content
      let articleContent = extractArticleContent();

      if (!articleContent) {
        throw new Error("Could not extract meaningful content from article");
      }

      // Clean the content
      articleContent = decode(cleanContent(articleContent));
      // articleContent = "Hello";

      console.log("📰 Final content length:", articleContent.length);
      console.log("📰 Final content preview:", articleContent.slice(0, 300) + "...");

      if (!articleContent || articleContent.trim().length <= 100) {
        throw new Error("Could not extract meaningful content from article");
      }

      setContent(articleContent);

      // Split into sentences for more natural reading
      const splitIntoSentences = (text) => {
        // Enhanced sentence splitting that handles common abbreviations and edge cases
        return text
          // First, protect common abbreviations
          .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|Inc|Corp|Ltd|etc|vs|i\.e|e\.g|a\.m|p\.m|U\.S|U\.K)\./g, '$1<PERIOD>')
          // Split on sentence-ending punctuation followed by whitespace and capital letter
          .split(/[.!?]+\s+(?=[A-Z])|[.!?]+$/)
          // Restore the protected periods
          .map(sentence => sentence.replace(/<PERIOD>/g, '.').trim())
          // Filter out empty sentences and very short ones (likely artifacts)
          .filter(sentence => sentence.length > 10);
      };

      const sentences = splitIntoSentences(articleContent);
      console.log(`📖 Starting to read ${sentences.length} sentences`);

      isSpeakingRef.current = true;
      setIsSpeaking(true);

      let wasStoppedByUser = false; // Add this flag

      // Read sentence by sentence
      for (let i = 0; i < sentences.length; i++) {
        // Check if we should stop (user pressed stop button)
        if (!isSpeakingRef.current) {
          console.log("📖 Reading stopped by user");
          wasStoppedByUser = true; // Set the flag
          break;
        }

        const sentence = sentences[i];
        const cleanSentence = sentence.replace(/["""'']/g, "").trim();

        console.log(`📖 Reading sentence ${i + 1}/${sentences.length}: "${cleanSentence}"`);

        await new Promise<void>((resolve) => {
          Speech.speak(cleanSentence, {
            rate: 0.85,
            pitch: 1.0,
            volume: 1.0,
            onDone: () => {
              console.log(`✅ Finished speaking sentence ${i + 1}`);
              resolve();
            },
            onError: (error) => {
              console.error("❌ Speech error for sentence:", cleanSentence, error);
              resolve();
            },
          });
        });

        // Add natural pause between sentences
        if (isSpeakingRef.current && i < sentences.length - 1) {
          if (sentence.match(/[!?]$/)) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } else {
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
        }

        // Progress update every 5 sentences
        if ((i + 1) % 5 === 0) {
          const progress = Math.round(((i + 1) / sentences.length) * 100);
          console.log(`📖 Progress: ${i + 1}/${sentences.length} sentences (${progress}%)`);
        }
      }

      isSpeakingRef.current = false;
      setIsSpeaking(false);

      // Announce completion if NOT stopped by user
      if (!wasStoppedByUser) { // Use the flag instead
        Speech.speak("Article reading completed. Would you like to read another article? Say yes to continue or wait to automatically restart.", {
          volume: 1.0,
          onDone: () => {
            console.log("📖 Article reading finished successfully");
            // Start recording for user response
            setTimeout(() => {
              safeStartRecording("postArticle" as any);
              // Auto-reset after 10 seconds if no response
              timeoutRef.current = setTimeout(() => {
                console.log("⏰ No response received, auto-restarting...");
                resetAppState();
              }, 10000);
            }, 1000);
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
        volume: 1.0,
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