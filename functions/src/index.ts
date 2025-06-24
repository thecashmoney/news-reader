/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest, onCall, HttpsError} from "firebase-functions/v2/https";
import {CallableRequest, Request, Response} from "firebase-functions/v2/https";
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

interface UploadAudioData {
  audioBase64: string;
}

interface StartTranscriptionData {
  audioUrl: string;
}

interface GetTranscriptionData {
  transcriptId: string;
}

interface TranscribeAudioData {
  audioBase64: string;
}

interface TranscribeAudioHTTPBody {
  audioBase64: string;
}

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

// Upload audio file to AssemblyAI
exports.uploadAudio = onCall({
  secrets: [assemblyaiKey],
  cors: true
}, async (request: CallableRequest<UploadAudioData>) => {
  try {
    // Validate that user is authenticated (optional but recommended)
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    const { audioBase64 } = request.data;
    
    if (!audioBase64) {
      throw new HttpsError("invalid-argument", "Audio data is required");
    }
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, "base64");    
    // Upload to AssemblyAI
    const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        "authorization": assemblyaiKey.value(),
      },
      body: audioBuffer
    });
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("AssemblyAI upload failed:", errorText);
      throw new HttpsError("internal", "Failed to upload audio");
    }
    const uploadData = await uploadResponse.json() as { upload_url: string };
    return {
      success: true,
      upload_url: uploadData.upload_url
    };
  } catch (error: any) {
    console.error("Upload error:", error);
    if (error.code) {
      throw error; // Re-throw HttpsError
    }
    throw new HttpsError("internal", "Upload failed", error.message);
  }
});

// Start transcription
exports.startTranscription = onCall({
  secrets: [assemblyaiKey],
  cors: true
}, async (request: CallableRequest<StartTranscriptionData>) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { audioUrl } = request.data;
    
    if (!audioUrl) {
      throw new HttpsError("invalid-argument", "Audio URL is required");
    }

    const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        "authorization": assemblyaiKey.value(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        audio_url: audioUrl,
        punctuate: true,
        format_text: true
      })
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      console.error("AssemblyAI transcription start failed:", errorText);
      throw new HttpsError("internal", "Failed to start transcription");
    }

    const transcriptData = await transcriptResponse.json() as { id: string; status: string };
    
    return {
      success: true,
      transcript_id: transcriptData.id,
      status: transcriptData.status
    };

  } catch (error: any) {
    console.error("Transcription start error:", error);
    if (error.code) {
      throw error; // Re-throw HttpsError
    }
    throw new HttpsError("internal", "Failed to start transcription", error.message);
  }
});

// Get transcription status and result
exports.getTranscription = onCall({
  secrets: [assemblyaiKey],
  cors: true
}, async (request: CallableRequest<GetTranscriptionData>) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { transcriptId } = request.data;
    
    if (!transcriptId) {
      throw new HttpsError("invalid-argument", "Transcript ID is required");
    }

    const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { 
        "authorization": assemblyaiKey.value()
      }
    });

    if (!pollingResponse.ok) {
      const errorText = await pollingResponse.text();
      console.error("AssemblyAI polling failed:", errorText);
      throw new HttpsError("internal", "Failed to get transcription status");
    }

    const pollingData = await pollingResponse.json() as { 
      status: string; 
      text?: string; 
      error?: string; 
    };
    
    return {
      success: true,
      status: pollingData.status,
      text: pollingData.text,
      error: pollingData.error
    };

  } catch (error: any) {
    console.error("Transcription polling error:", error);
    if (error.code) {
      throw error; // Re-throw HttpsError
    }
    throw new HttpsError("internal", "Failed to get transcription", error.message);
  }
});

// Combined function that handles the full transcription process
exports.transcribeAudio = onCall({
  secrets: [assemblyaiKey],
  cors: true,
  timeoutSeconds: 300 // 5 minutes timeout for long transcriptions
}, async (request: CallableRequest<TranscribeAudioData>) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { audioBase64 } = request.data;
    
    if (!audioBase64) {
      throw new HttpsError("invalid-argument", "Audio data is required");
    }

    // Step 1: Upload audio
    const audioBuffer = Buffer.from(audioBase64, "base64");
    
    const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        "authorization": assemblyaiKey.value(),
      },
      body: audioBuffer
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("AssemblyAI upload failed:", errorText);
      throw new HttpsError("internal", "Failed to upload audio");
    }

    const uploadData = await uploadResponse.json() as { upload_url: string };

    // Step 2: Start transcription
    const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        "authorization": assemblyaiKey.value(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        audio_url: uploadData.upload_url,
        punctuate: true,
        format_text: true
      })
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      console.error("AssemblyAI transcription start failed:", errorText);
      throw new HttpsError("internal", "Failed to start transcription");
    }

    const transcriptData = await transcriptResponse.json() as { id: string; status: string };

    // Step 3: Poll for completion (with timeout)
    const maxAttempts = 90; // 3 minutes max wait time (2 second intervals)
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptData.id}`, {
        headers: { 
          "authorization": assemblyaiKey.value()
        }
      });

      if (!pollingResponse.ok) {
        const errorText = await pollingResponse.text();
        console.error("AssemblyAI polling failed:", errorText);
        throw new HttpsError("internal", "Failed to poll transcription status");
      }

      const pollingData = await pollingResponse.json() as { 
        status: string; 
        text?: string; 
        error?: string; 
      };

      if (pollingData.status === "completed") {
        return {
          success: true,
          text: pollingData.text,
          transcript_id: transcriptData.id
        };
      } else if (pollingData.status === "error") {
        console.error("AssemblyAI transcription error:", pollingData.error);
        throw new HttpsError("internal", "Transcription failed", 
          pollingData.error);
      }

      attempts++;
    }

    // If we get here, transcription timed out
    throw new HttpsError("deadline-exceeded", "Transcription timed out");

  } catch (error: any) {
    console.error("Full transcription error:", error);
    if (error.code) {
      throw error; // Re-throw HttpsError
    }
    throw new HttpsError("internal", "Transcription failed", error.message);
  }
});

// Alternative: HTTP endpoint version if you prefer REST API approach
exports.transcribeAudioHTTP = onRequest({
  secrets: [assemblyaiKey],
  cors: true
}, async (req: Request, res: Response) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Basic auth check (you might want to implement JWT verification)
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "Authorization required" });
      return;
    }

    const body = req.body as TranscribeAudioHTTPBody;
    const { audioBase64 } = body;
    
    if (!audioBase64) {
      res.status(400).json({ error: "Audio data is required" });
      return;
    }

    // Same transcription logic as above...
    const audioBuffer = Buffer.from(audioBase64, "base64");
    
    const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        "authorization": assemblyaiKey.value(),
      },
      body: audioBuffer
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload audio");
    }

    const uploadData = await uploadResponse.json() as { upload_url: string };

    const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        "authorization": assemblyaiKey.value(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        audio_url: uploadData.upload_url,
        punctuate: true,
        format_text: true
      })
    });

    if (!transcriptResponse.ok) {
      throw new Error("Failed to start transcription");
    }

    const transcriptData = await transcriptResponse.json() as { id: string; status: string };

    // Return transcript ID for client-side polling, or do full polling here
    res.json({
      success: true,
      transcript_id: transcriptData.id,
      status: "processing"
    });

  } catch (error: any) {
    console.error("HTTP transcription error:", error);
    res.status(500).json({ 
      error: "Transcription failed", 
      message: error.message 
    });
  }
});