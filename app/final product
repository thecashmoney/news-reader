<template>
  <div class="page-container" @click="activateAudio">
    <!-- Initial Prompt (first activation required) -->
    <div v-if="!activated" class="initial-prompt">
      <p>Welcome to AI News Reader.<br>
      Please tap anywhere on the screen to enable microphone and audio interaction.</p>
    </div>

    <!-- Main Content (appears after activation) -->
    <div v-if="activated">
      <h2>AI News Reader is Active</h2>

      <!-- Display the News Headlines -->
      <div v-if="articles.length">
        <h3>Top 5 Headlines</h3>
        <ul>
          <li v-for="(article, index) in articles" :key="index">
            {{ index + 1 }}. {{ article.title }}
          </li>
        </ul>
      </div>

      <!-- Display GPT Summary -->
      <div v-if="chatGPTResponse">
        <h3>Article Summary</h3>
        <p>{{ chatGPTResponse }}</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
	  activated: false,
      isListening: false,
      transcription: "",
      chatGPTResponse: "",
      recognition: null,
      articles: [],
      openAIKey: "Bearer key",
      newsAPIKey: "key",
	  speechToTextURL: "https://speech-recognition-service-60979898157.us-central1.run.app",
	  textToSpeechURL: "https://text-to-speech-service-60979898157.us-central1.run.app",
	 };
  },
 
   methods: {
    activateAudio() {
      if(this.activated) return;
      this.activated = true;

      const recorderManager = uni.getRecorderManager();
      recorderManager.onStart(() => setTimeout(() => recorderManager.stop(), 3000));

      recorderManager.onStop(res => {
        uni.getFileSystemManager().readFile({
          filePath: res.tempFilePath,
          encoding: 'base64',
          success: (file) => this.uploadAudio(file.data),
          fail: () => uni.showToast({ title: 'Failed to read audio', icon: 'none' })
        });
      });

      recorderManager.onError(() => uni.showModal({ title: 'Error', content: 'Please enable microphone permissions.' }));

      recorderManager.start();
    },

    uploadAudio(base64data) {
      uni.request({
        url: this.speechToTextURL,
        method: "POST",
        header: { "Content-Type": "application/json" },
        data: { audio: base64data },
        success: res => this.queryChatGPT(res.data.transcript),
        fail: () => this.speak('Speech recognition failed.')
      });
    },
	
	speak(text, callback) {
	  uni.request({
		url: this.textToSpeechURL,
		method: 'POST',
		responseType: 'arraybuffer',
		data: { text },
		success: res => {
		  const fs = uni.getFileSystemManager();
		  const audioPath = `${wx.env.USER_DATA_PATH}/tts_audio.mp3`;
		  fs.writeFile({ filePath: audioPath, data: res.data, encoding: 'binary', success: () => {
			const player = uni.createInnerAudioContext();
			player.src = audioPath;
			player.autoplay = true;
			player.onEnded(() => { player.destroy(); if (callback) callback(); });
		  }});
		}
	  });
	},
	
	 

	queryChatGPT(userInput) {
	  this.speak(`Searching news about ${userInput}.`);

	  uni.request({
		url: `https://newsapi.org/v2/everything?q=${encodeURIComponent(userInput)}&language=en&apiKey=${this.newsAPIKey}`,
		success: res => {
		  if (res.data.articles.length) {
			this.articles = res.data.articles.slice(0, 5);
			const headlines = this.articles.map((a, i) => `${i + 1}. ${a.title}`).join("\n");
			this.originalPrompt = `Top 5 headlines:\n${headlines}`;
			this.askGPT_HeadlinePicker(this.originalPrompt);
		  } else {
			this.speak('No news found.');
		  }
		},
		fail: () => this.speak("Failed to fetch news.")
	  });
	}, 
 
   

     askGPT_HeadlinePicker(prompt) {
       uni.request({
         url: "https://api.openai.com/v1/chat/completions",
         method: "POST",
         header: { Authorization: this.openAIKey, "Content-Type": "application/json" },
         data: {
           model: "gpt-4",
           messages: [{ role: "system", content: "Summarize headlines for blind users." }, { role: "user", content: prompt }]
         },
         success: res => {
           this.chatGPTResponse = res.data.choices[0].message.content;
           this.speak(this.chatGPTResponse, () => this.speak("Which number to summarize?", this.startRecognitionForNumber));
         }
       });
     },
 
     startRecognitionForNumber() {
       const recorder = uni.getRecorderManager();
       recorder.onStart(() => setTimeout(() => recorder.stop(), 3000));
       recorder.onStop(res => {
         uni.getFileSystemManager().readFile({
           filePath: res.tempFilePath,
           encoding: 'base64',
           success: (file) => {
             uni.request({
               url: this.speechToTextURL,
               method: "POST",
               data: { audio: file.data },
               success: response => {
                 const match = response.data.transcript.match(/\d+/);
                 if (match) {
                   const index = parseInt(match[0]) - 1;
                   if (this.articles[index]) {
                     const article = this.articles[index];
                     const prompt = `Summarize:\n${article.title}\n${article.description || ""}`;
                     this.askGPT_Summarize(prompt);
                   } else {
                     this.speak("Invalid number.");
                   }
                 } else {
                   this.speak("Didn't hear clearly. Try again.");
                 }
               }
             });
           }
         });
       });
       recorder.start();
     },
 
     askGPT_Summarize(prompt) {
       uni.request({
         url: "https://api.openai.com/v1/chat/completions",
         method: "POST",
         header: { Authorization: this.openAIKey, "Content-Type": "application/json" },
         data: { model: "gpt-4", messages: [{ role: "user", content: prompt }] },
         success: res => {
           const summary = res.data.choices[0].message.content;
           this.chatGPTResponse = summary;
           this.speak(summary);
         }
       });
     },
	 
 
     
     startRecognitionForSummaryOrFull(summaryReply, originalPrompt) {
       if (this.recognition) this.recognition.abort();
       this.recognition = new webkitSpeechRecognition();
       this.recognition.lang = "en-US";
       this.recognition.continuous = false;
     
       this.recognition.onresult = event => {
         const answer = event.results[0][0].transcript.trim().toLowerCase();
         console.log("User answered:", answer);
         if (answer.includes("summary")) {
           this.speak(summaryReply, this.askNewTopic);
         } else if (answer.includes("full")) {
           const index = this.articles.findIndex(article => originalPrompt.includes(article.title));
           if (index !== -1) {
             const fullContent = this.articles[index].content || this.articles[index].description;
             this.speak(fullContent, this.askNewTopic);
           } else {
             this.speak("Unable to find the full content. Let's move on.", this.askNewTopic);
           }
         } else {
           this.speak("I didn't understand. Let's try again.", () => {
             setTimeout(() => this.startRecognitionForSummaryOrFull(summaryReply, originalPrompt), 1000);
           });
         }
       };
     
       this.recognition.start();
     },
    askNewTopic() {
       this.speak("Would you like to continue? Say yes or no.", () => {
         setTimeout(this.startRecognitionForContinue, 1000);
       });
     },
 
     startRecognitionForContinue() {
	   if (this.recognition) this.recognition.abort();	 
       this.recognition = new webkitSpeechRecognition();
       this.recognition.lang = "en-US";
       this.recognition.continuous = false;
 
       this.recognition.onresult = event => {
         const answer = event.results[0][0].transcript.trim().toLowerCase();
		 console.log("User answered:", answer);  // 打印识别结果
         if (["yes.", "yeah.", "sure."].includes(answer)) {
           this.speak("What topic?", this.listenForQuery);
         } else {
           this.speak("Goodbye.");
         }
       };
 
       this.recognition.start();
     }
   },
   startRecognitionForContinue() {
     if (this.recognition) this.recognition.abort();	 
     this.recognition = new webkitSpeechRecognition();
     this.recognition.lang = "en-US";
     this.recognition.continuous = false;
    
     this.recognition.onresult = event => {
       const answer = event.results[0][0].transcript.trim().toLowerCase();
   		 console.log("User answered:", answer);  // 打印识别结果
       if (["yes.", "yeah.", "sure."].includes(answer)) {
         this.speak("What topic?", this.listenForQuery);
       } else {
         this.speak("Goodbye.");
       }
     };
    
     this.recognition.start();
   }
 }; 



</script>


<style scoped>
.page-container {
  background-image: url('/static/news-background.png');
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  height: 100vh;
  width: 100vw;
  overflow-y: auto;
  padding: 20px;
  color: Blue;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.initial-prompt {
  font-size: 22px;
  padding: 15px;
}

.headline {
  font-size: 22px;
  font-weight: bold;
  margin-bottom: 15px;
}

.summary {
  font-size: 18px;
  margin-bottom: 20px;
  white-space: pre-wrap;
}

.overlay {
  background-color: rgba(0, 0, 0, 0.5);
  padding: 15px;
  border-radius: 10px;
  margin-bottom: 20px;
  color: white;
}
</style>
