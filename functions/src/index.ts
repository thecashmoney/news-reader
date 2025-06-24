/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest} from "firebase-functions/v2/https";
// import {CallableRequest} from "firebase-functions/v2/https";
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
const assemblyaiKey = defineSecret("ASSEMBLYAI_API_KEY");

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

// Receive: audio recording
// return: pollingdata
exports.transcribe = onRequest({secrets: [assemblyaiKey]}, async (req, res) => {
  console.log("called");
  try {
    const recording = req.body;
    // upload audio file to assemblyAI
    const uploadRecording = await axios.post("https://api.assemblyai.com/v2/upload", recording, {
      headers: {
        "Authorization": assemblyaiKey.value(),
        "Content-Type": "application/octet-stream",
      },
    });
    const uploadURL = uploadRecording.data.upload_url;
    console.log("Step 1 passed");

    // receive transcription ID
    const transcriptResponse = await axios.post("https://api.assemblyai.com/v2/transcript", {
      audio_url: uploadURL,
    }, {
      headers: {
        "Authorization": assemblyaiKey.value(),
        "Content-Type": "application/json",
      },
    });
    const transcriptId = transcriptResponse.data.id;
    console.log("Step 2 passed");

    // await polling status
    const pollingEndpoint = "https://api.assemblyai.com/v2/transcript/" + transcriptId;
    const start = Date.now();

    let transcriptData;
    while (Date.now() - start < 60000) {
      const statusResponse = await axios.get(pollingEndpoint, {
        headers: {
          "Authorization": assemblyaiKey.value(),
        },
      });

      const status = statusResponse.data.status;

      if (status === "completed") {
        transcriptData = statusResponse.data.text.replace(/[.。！？!?]+$/, "");
        break;
      } else if (status === "error") {
        throw new Error("Transcription failed:" + statusResponse.data.error);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    res.status(200).json(transcriptData);
  } catch (err) {
    console.error("Error handling binary upload:", err);
    res.status(500).send({error: "Failed to process binary data"});
  }
});
