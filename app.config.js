import 'dotenv/config';

export default {
  expo: {
    name: 'YourAppName',
    slug: 'your-app-slug',
    version: '1.0.0',
    "expo": {
      "name": "news-reader",
      "slug": "news-reader",
      "version": "1.0.0",
      "orientation": "portrait",
      "icon": "./assets/images/icon.png",
      "scheme": "myapp",
      "userInterfaceStyle": "automatic",
      "newArchEnabled": true,
      "ios": {
        "supportsTablet": true
      },
      "android": {
        "adaptiveIcon": {
          "foregroundImage": "./assets/images/adaptive-icon.png",
          "backgroundColor": "#ffffff"
        }
      },
      "web": {
        "bundler": "metro",
        "output": "static",
        "favicon": "./assets/images/favicon.png"
      },
      "plugins": [
        "expo-router",
        [
          "expo-splash-screen",
          {
            "image": "./assets/images/splash-icon.png",
            "imageWidth": 200,
            "resizeMode": "contain",
            "backgroundColor": "#ffffff"
          }
        ]
      ],
      "experiments": {
        "typedRoutes": true
      }
    },
    extra: {
      NEWS_API_KEY: process.env.NEWS_API_KEY,
    },
  },
};
