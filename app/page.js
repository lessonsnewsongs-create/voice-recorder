"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Download, Play, Pause, FileText, Loader2, X, Save, Edit2 } from 'lucide-react';

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
            'authorization': 'd41f2097d45a4e8bafad51f986ecb7d9',
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

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-100 via-amber-50 to-stone-100 flex flex-col items-center justify-between p-4 sm:p-6 md:p-8 relative overflow-hidden">
      
      {/* Animated background circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 bg-stone-200/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 bg-amber-200/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1.5s'}}></div>
      </div>

      <div className="z-10 flex flex-col items-center w-full max-w-2xl space-y-16 sm:space-y-24 md:space-y-40">
        
        {/* Timer Display */}
        <div className="text-center">
          <div className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-stone-800 tracking-wider font-mono mb-3 sm:mb-4">
            {formatTime(recordingTime)}
          </div>

          {isRecording && (
            <div className="flex items-center justify-center gap-2 sm:gap-3 text-red-600 text-base sm:text-lg md:text-xl">
              <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded-full animate-pulse"></div>
              <span className="font-medium">Recording...</span>
            </div>
          )}
        </div>

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
        <div className="flex items-center gap-3 sm:gap-4 md:gap-6 pt-4 sm:pt-6 md:pt-8">
          {/* Transcription Button */}
          {audioURL && !isRecording && (
            <button
              onClick={getTranscription}
              className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center bg-stone-700 hover:bg-stone-800 transition-all shadow-lg transform hover:scale-105 cursor-pointer"
              title="Get Transcription"
            >
              <FileText size={20} className="text-stone-100 sm:w-6 sm:h-6 md:w-7 md:h-7" />
            </button>
          )}

          {/* Main Record/Stop/Play Button */}
          <button
            onClick={() => {
              if (isRecording) {
                stopRecording();
              } else if (audioURL && !isRecording && !isTranscribing) {
                togglePlayPause();
              } else if (!isTranscribing) {
                startRecording();
              }
            }}
            disabled={isTranscribing}
            className={`w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full flex items-center justify-center transition-all shadow-2xl transform hover:scale-105 cursor-pointer ${
              isTranscribing
                ? "bg-stone-600 cursor-wait"
                : isRecording
                ? "bg-red-600 hover:bg-red-700"
                : audioURL
                ? isPlaying
                  ? "bg-stone-600 hover:bg-stone-700"
                  : "bg-stone-700 hover:bg-stone-800"
                : "bg-stone-800 hover:bg-stone-900"
            }`}
          >
            {isTranscribing ? (
              <Loader2 size={36} className="text-stone-100 animate-spin sm:w-10 sm:h-10 md:w-12 md:h-12" />
            ) : isRecording ? (
              <Square size={36} className="text-stone-100 fill-stone-100 sm:w-10 sm:h-10 md:w-12 md:h-12" />
            ) : audioURL ? (
              isPlaying ? (
                <Pause size={36} className="text-stone-100 fill-stone-100 sm:w-10 sm:h-10 md:w-12 md:h-12" />
              ) : (
                <Play size={36} className="text-stone-100 fill-stone-100 ml-2 sm:w-10 sm:h-10 md:w-12 md:h-12" />
              )
            ) : (
              <Mic size={36} className="text-stone-100 sm:w-10 sm:h-10 md:w-12 md:h-12" />
            )}
          </button>

          {/* Download Button */}
          {audioURL && !isRecording && (
            <button
              onClick={downloadRecording}
              className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center bg-stone-700 hover:bg-stone-800 transition-all shadow-lg transform hover:scale-105 cursor-pointer"
              title="Download Recording"
            >
              <Download size={20} className="text-stone-100 sm:w-6 sm:h-6 md:w-7 md:h-7" />
            </button>
          )}
        </div>

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
      {showTranscriptModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-linear-to-br from-stone-50 to-amber-50 rounded-2xl sm:rounded-3xl shadow-2xl max-w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col border border-stone-200/50 animate-in slide-in-from-bottom-4 duration-300">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 md:p-8 border-b border-stone-200/70 bg-white/40 backdrop-blur-sm">
              <div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-stone-900 tracking-tight font-serif">Transcription</h2>
                <p className="text-xs sm:text-sm text-stone-600 mt-1 font-light tracking-wide">Edit and save your transcript</p>
              </div>
              <button
                onClick={() => setShowTranscriptModal(false)}
                className="p-2 sm:p-2.5 hover:bg-stone-200/60 rounded-xl transition-all hover:rotate-90 duration-200"
                title="Close"
              >
                <X size={20} className="text-stone-700 sm:w-6 sm:h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-5 md:space-y-6">
              {/* Name Input */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-stone-800 uppercase tracking-wider">
                  <Edit2 size={14} className="sm:w-4 sm:h-4" />
                  File Name
                </label>
                <input
                  type="text"
                  value={transcriptName}
                  onChange={(e) => setTranscriptName(e.target.value)}
                  className="w-full px-3 py-2 sm:px-4 sm:py-3 md:px-5 md:py-3.5 bg-white border-2 border-stone-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:ring-2 focus:ring-stone-400 focus:border-stone-400 outline-none text-stone-900 font-medium placeholder:text-stone-400 transition-all shadow-sm hover:border-stone-300"
                  placeholder="my-transcript"
                />
              </div>

              {/* Transcript Text */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-stone-800 uppercase tracking-wider">
                  <FileText size={14} className="sm:w-4 sm:h-4" />
                  Transcript Content
                </label>
                <textarea
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  className="w-full h-48 sm:h-56 md:h-64 lg:h-72 px-3 py-3 sm:px-4 sm:py-3.5 md:px-5 md:py-4 bg-white border-2 border-stone-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:ring-2 focus:ring-stone-400 focus:border-stone-400 outline-none resize-none text-stone-900 leading-relaxed placeholder:text-stone-400 transition-all shadow-sm hover:border-stone-300 font-sans"
                  placeholder="Your transcription will appear here..."
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                />
                <p className="text-xs text-stone-500 mt-2">{transcriptText.length} characters</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 p-4 sm:p-6 md:p-8 border-t border-stone-200/70 bg-white/40 backdrop-blur-sm">
              <button
                onClick={() => setShowTranscriptModal(false)}
                className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-lg sm:rounded-xl border-2 border-stone-300 text-stone-700 text-sm sm:text-base font-semibold hover:bg-stone-100 hover:border-stone-400 transition-all shadow-sm order-2 sm:order-1"
              >
                Cancel
              </button>
              <button
                onClick={downloadTranscript}
                className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-lg sm:rounded-xl bg-linear-to-r from-stone-800 to-stone-900 hover:from-stone-900 hover:to-black text-white text-sm sm:text-base font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center gap-2 sm:gap-2.5 order-1 sm:order-2"
              >
                <Save size={18} className="sm:w-5 sm:h-5" />
                Save & Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}