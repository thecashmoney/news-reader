import { Text, View } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Index() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        paddingTop: insets.top,
      }}
    >
      <Text>News Reader</Text>
    </View>
  );
}
