import { Text, View, StyleSheet, useColorScheme, Dimensions } from "react-native";
import {SafeAreaView, SafeAreaProvider} from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react'; 

export default function Index() {
  const colorScheme = useColorScheme();

  const themeTextStyle = colorScheme === 'light' ? styles.lightThemeText : styles.darkThemeText;
  const themeContainerStyle =
    colorScheme === 'light' ? styles.lightContainer : styles.darkContainer;

    // useEffect(() => {

    //   const API_KEY = process.env.NEWS_API_KEY;
    
    //   const url = `https://newsapi.org/v2/top-headlines?country=us&apiKey=${API_KEY}`;
    
    //   fetch(url)
    //     .then(res => res.json())
    //     .then(data => setArticles(data.articles))
    // }, [])
    

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, themeContainerStyle]}>
        <Text style={[themeTextStyle, styles.titleText]} >News Reader</Text>
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
  }
});
