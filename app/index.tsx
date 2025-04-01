import { Text, View, StyleSheet, useColorScheme, Button, FlatList } from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { useState } from "react";

// ✅ Define NewsArticle interface
interface NewsArticle {
  source: string;
  title: string;
  description: string | null;
  content: string | null;
}

// ✅ Sample JSON data (replace with API response later)
const jsonData = {
  status: "ok",
  totalResults: 35,
  articles: [
    {
      source: { id: "espn", name: "ESPN" },
      title: "Braves' Profar gets 80-game ban for PED violation - ESPN",
      description: "Atlanta Braves outfielder Jurickson Profar was suspended for 80 games...",
      content: "LOS ANGELES -- Atlanta Braves outfielder...",
    },
    {
      source: { id: "cnn", name: "CNN" },
      title: "Bodies of three out of four US soldiers recovered - CNN",
      description: "The bodies of three of the four US soldiers have been recovered...",
      content: "Summary: The bodies of three US soldiers...",
    },
  ],
};

export default function Index() {
  const colorScheme = useColorScheme();
  const [articles, setArticles] = useState<NewsArticle[]>([]); // ❌ No articles initially
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);

  const themeTextStyle = colorScheme === "light" ? styles.lightThemeText : styles.darkThemeText;
  const themeContainerStyle = colorScheme === "light" ? styles.lightContainer : styles.darkContainer;

  // ✅ Function to fetch articles
  const fetchArticles = (): NewsArticle[] => {
    return jsonData.articles.map((article) => ({
      source: article.source.name,
      title: article.title,
      description: article.description,
      content: article.content,
    }));
  };

  // ✅ Select topic and load all articles (not filtering yet)
  const selectTopic = () => {
    setArticles(fetchArticles());
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, themeContainerStyle]}>
        <Text style={[themeTextStyle, styles.titleText]}>News Reader</Text>
        
        {/* ✅ Button now loads all articles */}
        <Button title="Pick a Topic" onPress={selectTopic} />

        {articles.length > 0 ? (
          <FlatList
            data={articles}
            keyExtractor={(item) => item.title}
            renderItem={({ item }) => (
              <Text style={themeTextStyle} onPress={() => setSelectedArticle(item)}>
                {item.title} ({item.source})
              </Text>
            )}
          />
        ) : (
          <Text style={themeTextStyle}>Press "Pick a Topic" to load articles.</Text> // ✅ Initial message
        )}

        {selectedArticle && (
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
  titleText: {
    paddingTop: 20,
    fontWeight: "bold",
    fontSize: 40,
  },
});
