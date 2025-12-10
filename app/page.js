"use client";
import React, { useState, useRef, useEffect } from 'react';
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

      mediaRecorderRef.current.start();
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
          'authorization': 'd41f2097d45a4e8bafad51f986ecb7d9',
        },
        body: audioBlobRef
      });

      const { upload_url } = await uploadResponse.json();

      // Step 2: Request transcription
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': 'd41f2097d45a4e8bafad51f986ecb7d9',
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
      console.error('Transcription error:', error);
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

  const summarizeTranscript = async () => {
    if (!transcriptText) {
      alert('No transcript text to summarize');
      return;
    }

    setIsSummarizing(true);

    try {
      const prompt = `
          You are a professional summarization assistant.

          Your job is to create a **clean, organized, Markdown-formatted summary** of the transcript I will provide.

          ### SUMMARY RULES
          - Use clear Markdown headings (##, ###, ####)
          - Use bullet points (-) for lists
          - Keep only important and meaningful information
          - Remove filler words, repetitions, greetings, and irrelevant small talk
          - Preserve the full meaning and key points
          - Keep the summary in chronological order
          - Clearly highlight:
            - Key insights
            - Decisions made
            - Tasks and action items
            - Important outcomes and conclusions
          - Only add sections that are relevant to this transcript
          - Do NOT invent or assume information

          ### OUTPUT FORMAT
          Your summary must be structured like this (only include sections that apply):

          ## Overview  
          - Brief overview of what the transcript is about

          ## Key Points / Discussion Summary  
          - Main topics discussed  
          - Important explanations, clarifications, or ideas  

          ## Decisions Made  
          - List of decisions (if any)

          ## Action Items / Tasks  
          - Who needs to do what (if mentioned)

          ## Conclusion  
          - Final thoughts or outcomes

          ---

          ### TRANSCRIPT:
          ${transcriptText}
          `;


      const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=AIzaSyC8y-1n9Nua2YJT0jdhY9PqTwVPXYErT20', {
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
        setEmailSubject(`Summary: ${transcriptName}`);
      } else {
        throw new Error('Invalid response from Gemini API');
      }
    } catch (error) {
      console.error('Summarization error:', error);
      alert('Failed to summarize transcript. Please try again.');
    } finally {
      setIsSummarizing(false);
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
    <div className="min-h-screen bg-linear-to-br from-stone-100 via-amber-50 to-stone-100 flex flex-col items-center justify-between p-4 sm:p-6 md:p-8 relative overflow-hidden">

      {/* Animated background circles */}
      <BackgroundAnimation />

      <div className="z-10 flex flex-col items-center w-full max-w-2xl space-y-16 sm:space-y-24 md:space-y-40">

        {/* Timer Display */}
        <TimerDisplay recordingTime={recordingTime} isRecording={isRecording} />

        {/* Audio Player */}
        {audioURL && !isRecording && (
          <div className="w-full">
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
        />

        {/* Status hint text */}
        {!isRecording && audioURL && (
          <p className="text-stone-600 text-xs sm:text-sm text-center px-4">
            Click center button to play • Use side buttons for transcription or download
          </p>
        )}
        {!isRecording && !audioURL && (
          <p className="text-stone-600 text-xs sm:text-sm text-center px-4">
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
      />
    </div>
  );
}