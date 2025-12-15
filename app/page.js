"use client";
// Load environment variables in development
if (typeof window === "undefined") {
  require('dotenv').config();
}
import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { marked } from 'marked';
import BackgroundAnimation from '@/components/BackgroundAnimation';
import TimerDisplay from '@/components/TimerDisplay';
import ControlButtons from '@/components/ControlButtons';
import TranscriptModal from '@/components/TranscriptModal';

export default function AudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorderState, setMediaRecorderState] = useState('none');
  const [hasStream, setHasStream] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptName, setTranscriptName] = useState('');
  const [audioBlobRef, setAudioBlobRef] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [markdownSummary, setMarkdownSummary] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState([]);
  const [emailInputValue, setEmailInputValue] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSentSuccess, setEmailSentSuccess] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [driveUploadSuccess, setDriveUploadSuccess] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream);
      setMediaRecorderState(mediaRecorderRef.current.state);
      setHasStream(true);
      mediaRecorderRef.current.ignoreMutedMedia = true;

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
        setAudioBlobRef(audioBlob);

        // Stop mic tracks AFTER Blob creation
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => {
            track.stop();
          });
          streamRef.current = null;
          setHasStream(false);
        }

        setMediaRecorderState('inactive');
      };

      // Start recording with timeslice to collect data continuously
      // Using 10 second chunks to avoid browser limitations
      mediaRecorderRef.current.start(10000);
      setMediaRecorderState(mediaRecorderRef.current.state);
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Mic error:', err);
      alert('Please allow microphone permissions.');
    }
  };

  const stopRecording = () => {
    // mark UI as not recording FIRST
    setIsRecording(false);

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop the MediaRecorder if present
    if (mediaRecorderRef.current) {
      const state = mediaRecorderRef.current.state;

      if (state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (err) {
          console.error('Error stopping MediaRecorder:', err);
        }
      }
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const downloadRecording = () => {
    if (audioURL) {
      const a = document.createElement("a");
      a.href = audioURL;
      a.download = `recording-${Date.now()}.wav`;
      a.click();
    }
  };

  const togglePlayPause = () => {
    if (!audioPlayerRef.current) return;

    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const startNewRecording = () => {
    // Stop current playback if playing
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    }
    
    // Reset all recording-related states to show mic button
    setAudioURL(null);
    setAudioBlobRef(null);
    setRecordingTime(0);
    setTranscriptText('');
    setTranscriptName('');
    setShowTranscriptModal(false);
    setShowSummary(false);
    setSummaryText('');
    setMarkdownSummary('');
    // User can now click the mic button to start recording when ready
  };

  const handleUploadAudio = () => {
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      // Create URL for the uploaded audio
      const url = URL.createObjectURL(file);
      setAudioURL(url);
      setAudioBlobRef(file);
      
      // Automatically start transcription
      setIsTranscribing(true);
      
      try {
        // Upload to AssemblyAI
        const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
          method: 'POST',
          headers: {
            'authorization': 'afc9f57b9e0c42169ecfaa74a4047811',
          },
          body: file
        });

        const { upload_url } = await uploadResponse.json();

        // Request transcription
        const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
          method: 'POST',
          headers: {
            'authorization': 'afc9f57b9e0c42169ecfaa74a4047811',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            audio_url: upload_url
          })
        });

        const { id } = await transcriptResponse.json();

        // Poll for completion
        let transcript = null;
        while (true) {
          const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
            headers: {
              'authorization': 'afc9f57b9e0c42169ecfaa74a4047811',
            }
          });

          transcript = await pollingResponse.json();

          if (transcript.status === 'completed') {
            setTranscriptText(transcript.text);
            setTranscriptName(`uploaded-${Date.now()}`);
            setShowTranscriptModal(true);
            break;
          } else if (transcript.status === 'error') {
            throw new Error('Transcription failed');
          }

          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        console.log('Transcription error:', error);
        alert('Failed to transcribe audio. Please try again.');
      } finally {
        setIsTranscribing(false);
      }
    };
    
    input.click();
  };

  const getTranscription = async () => {
    if (!audioBlobRef) {
      alert('No audio recording found');
      return;
    }

    setIsTranscribing(true);

    try {
      // Step 1: Upload audio to AssemblyAI
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': 'afc9f57b9e0c42169ecfaa74a4047811',
        },
        body: audioBlobRef
      });

      const { upload_url } = await uploadResponse.json();

      // Step 2: Request transcription
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': 'afc9f57b9e0c42169ecfaa74a4047811',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: upload_url
        })
      });

      const { id } = await transcriptResponse.json();

      // Step 3: Poll for transcription completion
      let transcript = null;
      while (true) {
        const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
          headers: {
            'authorization': 'afc9f57b9e0c42169ecfaa74a4047811',
          }
        });

        transcript = await pollingResponse.json();

        if (transcript.status === 'completed') {
          setTranscriptText(transcript.text);
          setTranscriptName(`transcript-${Date.now()}`);
          setShowTranscriptModal(true);
          break;
        } else if (transcript.status === 'error') {
          throw new Error('Transcription failed');
        }

        // Wait 3 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      console.log('Transcription error:', error);
      alert('Failed to transcribe audio. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const downloadTranscript = () => {
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcriptName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowTranscriptModal(false);
  };

  const uploadTranscriptToDrive = async () => {
    const response = await fetch('/api/upload-transcript', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcriptText,
        transcriptName: transcriptName || `transcript-${Date.now()}`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to save transcript to Google Drive');
    }

    return data.fileId;
  };

  const summarizeTranscript = async () => {
    if (!transcriptText) {
      alert('No transcript text to summarize');
      return;
    }

    // First, upload to Google Drive
    setIsUploadingToDrive(true);
    setDriveUploadSuccess(false);

    try {
      await uploadTranscriptToDrive();
      
      // Show success message briefly
      setDriveUploadSuccess(true);
      setIsUploadingToDrive(false);
      
      // Wait 1.5 seconds to show the success message
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Now start summarizing
      setDriveUploadSuccess(false);
      setIsSummarizing(true);

     const prompt = `
        You are a professional music-lesson summary assistant.

        Your job is to create a **friendly, parent-facing summary** of the class transcript I will provide.

        ### STYLE & TONE
        - Warm, encouraging, and easy for parents to understand  
        - No technical music jargon unless explained simply  
        - No markdown headings  
        - Keep sentences simple and natural  
        - Write as if the teacher is talking directly to the parent  
        - Start with a friendly greeting like: 
          "Hello! Your child had a great lesson today, and we made wonderful progress."

        ### CONTENT RULES
        - Extract only meaningful teaching moments from the transcript  
        - Highlight what the child practiced and what they learned  
        - Create a clear "Assignments and Practice" section  
          including each exercise/piece and what to focus on  
        - Provide simple "Practice Reminders" at the end  
        - Do NOT add anything not mentioned in the transcript  
        - Do NOT include filler, small talk, greetings between teacher/students  
        - Keep it clean, clear, and parent-friendly  

        ### OUTPUT FORMAT
        Follow this structure exactly:

        1. **Friendly Intro**  
          A warm, positive 1–2 line greeting.

        2. **Assignments and Practice**  
          List each song/exercise and what the child should focus on.

        3. **Today’s Lesson Summary**  
          A short explanation of what concepts were taught today 
          (notes, rhythms, hand placement, coordination, etc.).

        4. **Practice Reminders**  
          Simple bullet points to help parents guide practice at home.

        ---

        ### TRANSCRIPT:
        ${transcriptText}
        `;
      const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      const data = await response.json();

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        const markdownText = data.candidates[0].content.parts[0].text;
        const htmlSummary = marked(markdownText);
        setMarkdownSummary(markdownText);
        setSummaryText(htmlSummary);
        setShowSummary(true);
        setEmailSubject(transcriptName);
        // Set default email recipient
        if (!emailRecipients.includes('lessons.newsongs@gmail.com')) {
          setEmailRecipients(['lessons.newsongs@gmail.com']);
        }
      } else {
        throw new Error('Invalid response from Gemini API');
      }
    } catch (error) {
      console.error('Summarization error:', error);
      alert(error.message || 'Failed to process transcript. Please try again.');
    } finally {
      setIsSummarizing(false);
      setIsUploadingToDrive(false);
      setDriveUploadSuccess(false);
    }
  };

  const sendEmail = async () => {
    if (emailRecipients.length === 0) {
      alert('Please enter at least one email recipient');
      return;
    }
    if (!emailSubject) {
      alert('Please enter an email subject');
      return;
    }
    if (!summaryText) {
      alert('No summary to send');
      return;
    }

    setIsSendingEmail(true);
    setEmailSentSuccess(false);

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipients: emailRecipients,
          subject: emailSubject,
          htmlContent: summaryText
        })
      });

      const data = await response.json();

      if (response.ok) {
        setEmailSentSuccess(true);
        // Show success message for 2 seconds
        setTimeout(() => {
          setShowTranscriptModal(false);
          setEmailSentSuccess(false);
          // Reset email fields
          setEmailRecipients([]);
          setEmailInputValue('');
          setEmailSubject('');
        }, 2000);
      } else {
        throw new Error(data.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('Email sending error:', error);
      alert(`Failed to send email: ${error.message}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter' && emailInputValue.trim()) {
      e.preventDefault();
      const email = emailInputValue.trim();
      // Basic email validation
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (!emailRecipients.includes(email)) {
          setEmailRecipients([...emailRecipients, email]);
          setEmailInputValue('');
        }
      } else {
        alert('Please enter a valid email address');
      }
    }
  };

  const removeEmailRecipient = (emailToRemove) => {
    setEmailRecipients(emailRecipients.filter(email => email !== emailToRemove));
  };

  const handleBackToTranscript = () => {
    setShowSummary(false);
    setSummaryText('');
    setMarkdownSummary('');
    setEmailRecipients([]);
    setEmailInputValue('');
    setEmailSubject('');
  };

 return (
    <div className="min-h-screen bg-linear-to-br from-stone-100 via-amber-50 to-stone-100 flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8 relative overflow-hidden">

      {/* Animated background circles */}
      <BackgroundAnimation />

      {/* Logo and Title - Top Left Corner */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 md:top-8 md:left-8 z-20 flex items-center gap-2 sm:gap-3">
        <div className="relative h-12 sm:w-12 sm:h-12 md:w-14 md:h-14">
          <Image 
            src="/logo.png" 
            alt="Lesson Assistant Logo" 
            fill
            className="object-contain drop-shadow-md"
            priority
          />
        </div>
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-stone-800 tracking-tight">
          Lesson Assistant
        </h1>
      </div>

      <div className="z-10 flex flex-col items-center justify-center w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-2xl space-y-6 sm:space-y-8 md:space-y-12 lg:space-y-14">

        {/* Timer Display */}
        <div className="w-full flex justify-center">
          <TimerDisplay recordingTime={recordingTime} isRecording={isRecording} />
        </div>

        {/* Audio Player */}
        {audioURL && !isRecording && (
          <div className="w-full m">
            <audio
              ref={audioPlayerRef}
              src={audioURL}
              className="hidden"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
          </div>
        )}

        {/* Control Buttons */}
        <div className="w-full flex justify-center px-2 sm:px-4">
          <ControlButtons
            isRecording={isRecording}
            audioURL={audioURL}
            isTranscribing={isTranscribing}
            isPlaying={isPlaying}
            onRecord={startRecording}
            onStop={stopRecording}
            onPlayPause={togglePlayPause}
            onTranscribe={getTranscription}
            onDownload={downloadRecording}
            onNewRecording={startNewRecording}
            onUpload={handleUploadAudio}
          />
        </div>

        {/* Status hint text */}
        {!isRecording && audioURL && (
          <p className="text-stone-600 text-[10px] sm:text-xs md:text-sm text-center px-4 sm:px-6 max-w-md">
            Click center button to play • Use side buttons for transcription or download
          </p>
        )}
        {!isRecording && !audioURL && (
          <p className="text-stone-600 text-[10px] sm:text-xs md:text-sm text-center px-4 sm:px-6 max-w-md">
            Click the button to start recording
          </p>
        )}
      </div>

      {/* Transcription Modal */}
      <TranscriptModal
        showModal={showTranscriptModal}
        transcriptText={transcriptText}
        transcriptName={transcriptName}
        onClose={() => setShowTranscriptModal(false)}
        onTranscriptTextChange={(e) => setTranscriptText(e.target.value)}
        onTranscriptNameChange={(e) => setTranscriptName(e.target.value)}
        onDownload={downloadTranscript}
        isSummarizing={isSummarizing}
        showSummary={showSummary}
        summaryText={summaryText}
        setSummaryText={setSummaryText}
        onSummarize={summarizeTranscript}
        isEditingEmail={isEditingEmail}
        setIsEditingEmail={setIsEditingEmail}
        emailRecipients={emailRecipients}
        emailInputValue={emailInputValue}
        setEmailInputValue={setEmailInputValue}
        handleEmailKeyDown={handleEmailKeyDown}
        removeEmailRecipient={removeEmailRecipient}
        emailSubject={emailSubject}
        setEmailSubject={setEmailSubject}
        onSendEmail={sendEmail}
        onBackToTranscript={handleBackToTranscript}
        isSendingEmail={isSendingEmail}
        emailSentSuccess={emailSentSuccess}
        isUploadingToDrive={isUploadingToDrive}
        driveUploadSuccess={driveUploadSuccess}
      />
    </div>
  );
}