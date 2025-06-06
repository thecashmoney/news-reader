import React, { useState, useEffect } from 'react';
import { View, ScrollView, Text, StyleSheet, useColorScheme, Button, FlatList, TextInput, Keyboard } from 'react-native';
import axios from 'axios';
import HTMLParser from 'html-parse-stringify';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';

// Define the NewsArticle type
type NewsArticle = {
  source: { name: string };
  title: string;
  description: string;
  content: string;
};
import he from 'he';

export default function Index() {
  const [jsonResponse, setJsonResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [articleIndex, setArticleIndex] = useState(5);
  const colorScheme = useColorScheme();
  const [source, setSource] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [showFullArticle, setShowFullArticle] = useState<boolean>(false);

  const themeTextStyle = colorScheme === 'light' ? styles.lightThemeText : styles.darkThemeText;
  const themeContainerStyle = colorScheme === 'light' ? styles.lightContainer : styles.darkContainer;
  const fetchArticles = async () => {
    const url = `https://getnews-px5bnsfj3q-uc.a.run.app` +
      (!source && !query ? "" : "?") +
      (source ? `source=${source.toLowerCase().replace(/\s+/g, '-')}` : "") +
      (source && query ? "&" : "") +
      (query ? `q=${query}` : "");
    console.log(url);
    try {
      const response = await axios.get(url);

      if (
        response.data &&
        response.data.articles
      ) {
        setJsonResponse(response.data.articles); // Save all articles
        console.log(jsonResponse);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching articles:', error);
    }
  };



  const processArticle = async (article) => {
    try {
      const articleResponse = await axios.get(article.url);
      const parsedHTML = HTMLParser.parse(articleResponse.data);
      console.log(JSON.stringify(parsedHTML));

      const decodeHtmlEntities = (str) => he.decode(str);

      const isShareElement = (text) => {
        const shareKeywords = [
          'share',
          'facebook',
          'copy link',
          'copied',
          'print',
          'email',
          'linkedin',
          'bluesky',
          'flipboard',
          'pinterest',
          'reddit',
        ];
        const trimmed = text.trim().toLowerCase();
        return shareKeywords.some(
          (keyword) => trimmed === keyword || trimmed.startsWith(keyword)
        );
      };

      const extractVisibleText = (root) => {
        const blacklistTags = new Set([
          'script',
          'style',
          'nav',
          'footer',
          'aside',
          'noscript',
          'form',
          'button',
        ]);

        const blacklistClassFragments = [
          'metadata',
          'timestamp',
          'author',
          'related',
          'btn',
          'footer',
          'header',
          'byline',
          'caption',
          'promo',
          'ad',
          'nav',
          'share',
          'social',
        ];

        const hasBlacklistedClass = (attrs = {}) => {
          const classAttr = attrs.class || '';
          return blacklistClassFragments.some((cls) =>
            classAttr.toLowerCase().split(/\s+/).some((c) => c.includes(cls))
          );
        };

        const metaContent = [];

        const walk = (node) => {
          if (!node) return [];

          if (Array.isArray(node)) return node.flatMap(walk);

          if (node.type === 'text') {
            const text = node.content?.trim();
            if (text && text.length > 1 && !isShareElement(text)) {
              return [text];
            }
            return [];
          }

          if (node.type === 'tag') {
            const tagName = node.name?.toLowerCase?.();
            console.log(`📦 TAG <${tagName}> [class="${node.attrs?.class || ''}"]`);

            if (blacklistTags.has(tagName)) {
              console.log(`⛔ Skipping tag <${tagName}> (blacklisted tag)`);
              return [];
            }

            if (hasBlacklistedClass(node.attrs)) {
              console.log(
                `⛔ Skipping tag <${tagName}> (blacklisted class: ${node.attrs?.class})`
              );
              return [];
            }

            if (
              tagName === 'meta' &&
              node.attrs?.name?.toLowerCase() === 'description' &&
              node.attrs?.content
            ) {
              console.log(`✨ META Description: ${node.attrs.content}`);
              metaContent.push(node.attrs.content.trim());
            }

            const childText = (node.children || []).flatMap(walk);

            if (['p', 'section', 'article', 'div'].includes(tagName)) {
              const preview = childText.join(' ').slice(0, 100);
              console.log(`🧾 ${tagName.toUpperCase()} Preview:`, preview);
            }

            const isParagraph = ['p', 'h1', 'h2', 'h3', 'li', 'blockquote', 'article', 'section'].includes(tagName);
            return isParagraph
              ? ['\n' + childText.join(' ').trim()]
              : childText;
          }

          return [];
        };

        const textParts = walk(root);
        const combined = [...metaContent, ...textParts];
        const rawText = combined.join('\n').replace(/\n{2,}/g, '\n\n').trim();
        return decodeHtmlEntities(rawText);
      };

      const findBodyTag = (nodes) => {
        for (const node of nodes) {
          if (node.type === 'tag' && node.name === 'body') return node;
          if (node.children && node.children.length > 0) {
            const found = findBodyTag(node.children);
            if (found) return found;
          }
        }
        return null;
      };

      const bodyNode = findBodyTag(parsedHTML);

      if (bodyNode) {
        const articleText = extractVisibleText(bodyNode);
        console.log('✅ Cleaned Article:\n', articleText);
        setContent(articleText);
      } else {
        console.warn('⚠️ <body> tag not found!');
        setContent('Could not find article content.');
      }

      setLoading(false);
    } catch (error) {
      console.error('Error processing article:', error);
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, themeContainerStyle]}>
        <Text style={[themeTextStyle, styles.titleText]}>News Reader</Text>

        <Text style={themeTextStyle}>Search by Source:</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter source name"
          onChangeText={setSource}
          value={source}
          onSubmitEditing={Keyboard.dismiss}
          returnKeyType="done"
        />

        <Text style={themeTextStyle}>Search by Query:</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter search term"
          onChangeText={setQuery}
          value={query}
          onSubmitEditing={Keyboard.dismiss}
          returnKeyType="done"
        />

        <Button title="Search" onPress={fetchArticles} />

        {jsonResponse && jsonResponse.length === 0 && (
          <Text style={themeTextStyle}>
            There are no articles on this topic from today's headlines.
          </Text>
        )}

        {jsonResponse?.length > 0 && (
          <>
            <Text style={themeTextStyle}>{jsonResponse.length} articles found:</Text>
            <FlatList
              data={jsonResponse}
              keyExtractor={(item, index) => item.title + index}
              renderItem={({ item, index }) => (
                <View style={{ marginVertical: 10 }}>
                  <Text style={[themeTextStyle, { fontWeight: 'bold' }]}>
                    [{index}] {item.title} ({item.source.name})
                  </Text>
                  {item.description && (
                    <Text style={themeTextStyle}>{item.description}</Text>
                  )}
                </View>
              )}
            />
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="Enter article index to load"
              value={articleIndex.toString()}
              onChangeText={(text) => setArticleIndex(Number(text))}
              onSubmitEditing={Keyboard.dismiss}
              returnKeyType="done"
            />

            <Button
              title="Load Article"
              onPress={() => {
                if (!jsonResponse) {
                  setError('Articles not loaded yet.');
                  return;
                }

                if (
                  articleIndex < 0 ||
                  articleIndex >= jsonResponse.length
                ) {
                  setError(`Article index ${articleIndex} out of range.`);
                  return;
                }

                setError(null);
                setLoading(true);
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
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  lightContainer: {
    backgroundColor: '#D0D0D0',
  },
  darkContainer: {
    backgroundColor: '#353636',
  },
  lightThemeText: {
    color: '#353636',
  },
  darkThemeText: {
    color: '#D0D0D0',
  },
  titleText: {
    paddingTop: 20,
    fontWeight: 'bold',
    fontSize: 40,
  },
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