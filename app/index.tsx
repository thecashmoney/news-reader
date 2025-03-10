import { Text, View, StyleSheet, useColorScheme } from "react-native";
import {SafeAreaView, SafeAreaProvider} from 'react-native-safe-area-context';

export default function Index() {
  const colorScheme = useColorScheme();

  const themeTextStyle = colorScheme === 'light' ? styles.lightThemeText : styles.darkThemeText;
  const themeContainerStyle =
    colorScheme === 'light' ? styles.lightContainer : styles.darkContainer;

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
    backgroundColor: '#A1CEDC',
  },
  darkContainer: {
    backgroundColor: '#1D3D47',
  },
  lightThemeText: {
    color: 'black',
  },
  darkThemeText: {
    color: 'white',
  },
  titleText: {
    paddingTop: 20,
    fontWeight: 'bold',
    fontSize: 40,
  }
});
