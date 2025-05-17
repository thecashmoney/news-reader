import { Text, View, StyleSheet, useColorScheme, Button, FlatList, TextInput, Alert } from "react-native";
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useState } from "react";

// Define the NewsArticle type
type NewsArticle = {
  source: { name: string };
  title: string;
  description: string;
  content: string;
};

export default function Index() {
  const colorScheme = useColorScheme();
  const [source, setSource] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [showFullArticle, setShowFullArticle] = useState<boolean>(false);

  const themeTextStyle = colorScheme === 'light' ? styles.lightThemeText : styles.darkThemeText;
  const themeContainerStyle = colorScheme === 'light' ? styles.lightContainer : styles.darkContainer;

  const fetchArticles = () => {
    const sampleData: NewsArticle[] = [
      {
        source: { name: "CNN" },
        title: "Breaking News: AI Advances",
        description: "New AI technology is changing the world.",
        content: "Full article content about AI technology and its impacts...",
      },
      {
        source: { name: "BBC" },
        title: "SpaceX's Latest Launch",
        description: "SpaceX successfully launches another rocket.",
        content: "Full article content about SpaceX's recent launch and mission details...",
      }
    ];
    
    const filteredArticles = sampleData.filter(article => 
      (source ? article.source.name.toLowerCase().includes(source.toLowerCase()) : true) &&
      (query ? article.title.toLowerCase().includes(query.toLowerCase()) : true)
    );
    
    setArticles(filteredArticles);
  };

  const handleReadMore = (article: NewsArticle) => {
    setSelectedArticle(article);
    Alert.alert(
      "Read More?",
      "Do you want to read the full article?",
      [
        { text: "No", onPress: () => setShowFullArticle(false) },
        { text: "Yes", onPress: () => setShowFullArticle(true) }
      ]
    );
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
        />

        <Text style={themeTextStyle}>Search by Query:</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter search term"
          onChangeText={setQuery}
          value={query}
        />

        <Button title="Search" onPress={fetchArticles} />
        
        {articles.length > 0 ? (
          <FlatList
            data={articles}
            keyExtractor={(item) => item.title}
            renderItem={({ item }) => (
              <View>
                <Text style={themeTextStyle} onPress={() => handleReadMore(item)}>
                  {item.title} ({item.source.name})
                </Text>
                <Text style={themeTextStyle}>{item.description}</Text>
              </View>
            )}
          />
        ) : (
          <Text style={themeTextStyle}>No articles found</Text>
        )}

        {selectedArticle && showFullArticle && (
          <View>
            <Text style={themeTextStyle}>{selectedArticle.content}</Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
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
    margin: 10,
    padding: 5,
    width: '80%',
  }
});