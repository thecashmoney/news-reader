import { Text, View, StyleSheet, useColorScheme, Button, FlatList, TextInput } from "react-native";
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useState } from "react";

interface NewsArticle {
  source: string;
  title: string;
  description: string;
  content: string;
}

export default function Index() {
  const colorScheme = useColorScheme();
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [source, setSource] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  
  const themeTextStyle = colorScheme === 'light' ? styles.lightThemeText : styles.darkThemeText;
  const themeContainerStyle = colorScheme === 'light' ? styles.lightContainer : styles.darkContainer;

  const sampleJsonData = {
    articles: [
      {
        source: "ESPN",
        title: "Braves' Profar gets 80-game ban for PED violation - ESPN",
        description: "Atlanta Braves outfielder Jurickson Profar was suspended for 80 games by Major League Baseball.",
        content: "LOS ANGELES -- Atlanta Braves outfielder Jurickson Profar has tested positive for a banned substance..."
      },
      {
        source: "ESPN",
        title: "Soldiers",
        description: "Atlanta Braves outfielder Jurickson Profar was suspended for 80 games by Major League Baseball.",
        content: "LOS ANGELES -- Atlanta Braves outfielder Jurickson Profar has tested positive for a banned substance..."
      },
      {
        source: "CNN",
        title: "Bodies of three out of four US soldiers recovered - CNN",
        description: "The bodies of three of the four US soldiers who were reported missing have been recovered.",
        content: "The vehicle has also been recovered, and search operations continue for the fourth soldier."
      }
    ]
  };

  const fetchArticles = () => {
    if (!query && !source) {
      setArticles([]);
      return;
    }
    
    const filteredArticles = sampleJsonData.articles.filter(article => {
      return (
        (source && article.source.toLowerCase().includes(source.toLowerCase())) ||
        (query && article.title.toLowerCase().includes(query.toLowerCase()))
      );
    });
    
    setArticles(filteredArticles);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, themeContainerStyle]}> 
        <Text style={[themeTextStyle, styles.titleText]}>News Reader</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Enter news source"
          value={source}
          onChangeText={setSource}
        />
        
        <TextInput
          style={styles.input}
          placeholder="Enter search query"
          value={query}
          onChangeText={setQuery}
        />
        
        <Button title="Fetch News" onPress={fetchArticles} />
        
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
          <Text style={themeTextStyle}>No articles found</Text>
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
    padding: 20,
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
    fontSize: 30,
  },
  input: {
    width: '90%',
    padding: 10,
    margin: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    backgroundColor: '#fff'
  }
});