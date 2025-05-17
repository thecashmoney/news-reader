/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest} from "firebase-functions/v2/https";
// import * as logger from "firebase-functions/logger";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
import axios from "axios";
import {defineSecret} from "firebase-functions/params";

const newsAPIKey = defineSecret("NEWS_API_KEY");

exports.getNews = onRequest({secrets: [newsAPIKey]}, async (req, res) => {
  const source = req.query.source;
  const query = req.query.q;

  const url = "https://newsapi.org/v2/top-headlines?language=en&" +
    (source ? ("sources=" + source + "&") : "") +
    (query ? ("q=" + query + "&") : "") +
    (!source && !query ? "country=us&" : "") +
    "apiKey=" + newsAPIKey.value();

  try {
    const response = await axios.get(url);
    res.status(200).json(response.data);
  } catch (error) {
    console.error("Error fetching news");
    res.status(500).send("Failed to fetch news");
  }
});
