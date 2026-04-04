import { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  Upload, Play, Download, User, Plus, CheckCircle, Spinner,
  VideoCamera, SpeakerHigh, Waveform,
  GenderMale, GenderFemale, ArrowLeft, Subtitles, FilmStrip,
  Record, Stop, Eye, ShareNetwork, Link, Copy, Globe,
  MusicNote, FileText, MagnifyingGlass, Scissors,
  ArrowsMerge, PencilSimple, Package, FloppyDisk, ArrowsClockwise
} from "@phosphor-icons/react";
import { useAuth, ThemeToggle } from "./AuthContext";
import { API, GENERATE_TIMEOUT_MS, AUTO_PROCESS_TIMEOUT_MS, PROGRESS_POLL_MS, OUTPUT_LANGUAGES } from "./constants";
import { StepProgress, ProcessingOverlay } from "./EditorWidgets";
import VoicePickerModal from "./VoicePickerModal";

const useProjectId = () => {
  const location = useLocation();
  const parts = location.pathname.split('/');
  return { projectId: parts[parts.length - 1] };
};

const Editor = () => {
  const { token, isDark } = useAuth();
  const d = isDark;
  const navigate = useNavigate();
  const { projectId } = useProjectId();
  const [project, setProject] = useState(null);
  const [segments, setSegments] = useState([]);
  const [actors, setActors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingMsg, setProcessingMsg] = useState(null);
  const [progressInfo, setProgressInfo] = useState(null);
  const progressPollRef = useRef(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [burnSubs, setBurnSubs] = useState(false);
  const [bgVolume, setBgVolume] = useState(100);
  const [extractingBg, setExtractingBg] = useState(false);
  const [bgAudioUrl, setBgAudioUrl] = useState(null);
  const [ttsSpeed, setTtsSpeed] = useState(2);
  const [previewingIdx, setPreviewingIdx] = useState(null);
  const [originalVideoUrl, setOriginalVideoUrl] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [recordingIdx, setRecordingIdx] = useState(null);
  const [recordingActorId, setRecordingActorId] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [shareToken, setShareToken] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState(null);
  const [saveStatus, setSaveStatus] = useState("saved");
  const [selectedSegments, setSelectedSegments] = useState(new Set());
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("km");
  const [ytUrl, setYtUrl] = useState("");
  const [ytLoading, setYtLoading] = useState(null);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [voicePickerActorId, setVoicePickerActorId] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const originalVideoRef = useRef(null);

  const currentLangVoices = OUTPUT_LANGUAGES[targetLanguage] || OUTPUT_LANGUAGES.km;
  const femaleVoices = currentLangVoices.female;
  const maleVoices = currentLangVoices.male;

  const getCurrentStep = () => {
    if (!project) return 0;
    if (videoUrl) return 5;
    if (audioUrl) return 4;
    if (segments.some(s => s.translated)) return 3;
    if (segments.length > 0) return 2;
    if (project.original_file_path) return 1;
    return 0;
  };

  const loadFile = useCallback(async (path, type) => {
    try {
      const r = await axios.get(`${API}/files/${path}`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      if (type === 'audio') setAudioUrl(url);
      else if (type === 'video') setVideoUrl(url);
      else if (type === 'original') setOriginalVideoUrl(url);
    } catch (e) { console.warn(`Load ${type} failed:`, e.message); }
  }, [token]);

  const fetchProject = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
      setProject(r.data);
      if (r.data.segments) setSegments(r.data.segments);
      if (r.data.actors) setActors(r.data.actors);
      if (r.data.target_language) setTargetLanguage(r.data.target_language);
      if (r.data.dubbed_audio_path) loadFile(r.data.dubbed_audio_path, 'audio');
      if (r.data.dubbed_video_path) loadFile(r.data.dubbed_video_path, 'video');
      if (r.data.original_file_path && r.data.file_type === 'video') loadFile(r.data.original_file_path, 'original');
      if (r.data.share_token) setShareToken(r.data.share_token);
    } catch { toast.error("Failed to load project"); navigate("/dashboard"); }
    finally { setLoading(false); }
  }, [projectId, token, navigate, loadFile]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setProcessingMsg("Uploading video...");
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await axios.post(`${API}/projects/${projectId}/upload`, fd, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } });
      setProject(r.data); toast.success("Video uploaded!");
    } catch { toast.error("Upload failed"); }
    finally { setProcessingMsg(null); }
  };

  const transcribe = async () => {
    setProcessingMsg("Detecting speakers & extracting text...");
    try {
      const r = await axios.post(`${API}/projects/${projectId}/transcribe-segments`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 900000 });
      setProject(r.data); setSegments(r.data.segments || []); setActors(r.data.actors || []);
      toast.success("Speakers detected!");
      sendNotification("VoxiDub", "Speaker detection complete!");
    } catch (e) { toast.error(e.response?.data?.detail || "Detection failed"); }
    finally { setProcessingMsg(null); }
  };

  const translate = async () => {
    const langName = OUTPUT_LANGUAGES[targetLanguage]?.name || "Khmer";
    setProcessingMsg(`Translating to ${langName}...`);
    startProgressPoll();
    try {
      const r = await axios.post(`${API}/projects/${projectId}/translate-segments?target_language=${targetLanguage}`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 900000 });
      setProject(r.data); setSegments(r.data.segments || []);
      toast.success(`Translation to ${langName} complete!`);
      sendNotification("VoxiDub", `Translation to ${langName} complete!`);
    } catch { toast.error("Translation failed"); }
    finally { setProcessingMsg(null); stopProgressPoll(); }
  };

  const extractBackground = async () => {
    setExtractingBg(true);
    startProgressPoll();
    try {
      const r = await axios.post(`${API}/projects/${projectId}/extract-background`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
      });
      // Check if response is JSON (async processing) or blob (direct file)
      if (r.data?.status === "processing") {
        toast.info("Removing human voice with AI... Please wait.");
        setProcessingMsg("Extracting background audio (removing voice)...");
        // Poll until bg_audio is ready
        for (let i = 0; i < 300; i++) {
          await new Promise(res => setTimeout(res, 3000));
          try {
            const proj = await axios.get(`${API}/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (proj.data.bg_audio_path) {
              // Download the bg audio
              const bgResp = await axios.get(`${API}/projects/${projectId}/bg-audio`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob',
              });
              const url = URL.createObjectURL(bgResp.data);
              setBgAudioUrl(url);
              toast.success("Background audio extracted! Voice removed.");
              break;
            }
            // Check queue status for error
            const qs = await axios.get(`${API}/projects/${projectId}/queue-status`, { headers: { Authorization: `Bearer ${token}` } });
            setProgressInfo(qs.data);
            if (qs.data?.queue_status === "error") {
              toast.error("Extraction failed");
              break;
            }
          } catch (err) { console.warn("Poll error:", err.message); }
        }
        setProcessingMsg(null);
      } else if (r.data instanceof Blob || r.headers?.['content-type']?.includes('audio')) {
        const url = URL.createObjectURL(r.data);
        setBgAudioUrl(url);
        toast.success("Background audio extracted! Voice removed.");
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Extraction failed"); }
    finally { setExtractingBg(false); stopProgressPoll(); }
  };

  const generateAudio = async () => {
    setProcessingMsg("Generating voices...");
    startProgressPoll();
    try {
      const r = await axios.post(`${API}/projects/${projectId}/generate-audio-segments?speed=${ttsSpeed}&bg_volume=${bgVolume}`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 900000 });
      if (r.data.status === "processing") {
        // Long video - background processing, poll until done
        toast.info(r.data.message || "Processing in background...");
        const pollUntilDone = async () => {
          for (let i = 0; i < 600; i++) {
            await new Promise(res => setTimeout(res, 3000));
            try {
              const status = await axios.get(`${API}/projects/${projectId}/queue-status`, { headers: { Authorization: `Bearer ${token}` } });
              setProgressInfo(status.data);
              if (status.data?.queue_status === "done" || status.data?.queue_status === "error") {
                // Fetch final project state
                const proj = await axios.get(`${API}/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
                setProject(proj.data);
                if (proj.data.segments) setSegments(proj.data.segments);
                if (proj.data.actors) setActors(proj.data.actors);
                if (proj.data.dubbed_audio_path) loadFile(proj.data.dubbed_audio_path, 'audio');
                if (proj.data.status === "audio_ready" || proj.data.status === "completed") {
                  toast.success("Audio generated!");
                  sendNotification("VoxiDub", "Audio generation complete!");
                } else {
                  toast.error("Audio generation failed");
                }
                break;
              }
              // Also check project status directly
              if (i % 5 === 4) {
                const proj = await axios.get(`${API}/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
                if (proj.data.status === "audio_ready" || proj.data.status === "completed") {
                  setProject(proj.data);
                  if (proj.data.segments) setSegments(proj.data.segments);
                  if (proj.data.actors) setActors(proj.data.actors);
                  if (proj.data.dubbed_audio_path) loadFile(proj.data.dubbed_audio_path, 'audio');
                  toast.success("Audio generated!");
                  sendNotification("VoxiDub", "Audio generation complete!");
                  break;
                }
              }
            } catch (err) { console.warn("Poll error:", err.message); }
          }
          setProcessingMsg(null); stopProgressPoll();
        };
        await pollUntilDone();
        return;
      }
      setProject(r.data);
      if (r.data.dubbed_audio_path) loadFile(r.data.dubbed_audio_path, 'audio');
      toast.success("Audio generated!");
      sendNotification("VoxiDub", "Khmer audio generation complete!");
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || "";
      if (msg.includes("timeout") || e.code === "ECONNABORTED") {
        toast.info("Still processing... Check back in a minute.");
      } else {
        toast.error("Audio generation failed: " + msg);
      }
    }
    finally { setProcessingMsg(null); stopProgressPoll(); }
  };

  const generateVideo = async () => {
    setProcessingMsg(burnSubs ? "Generating video with Khmer subtitles..." : "Generating dubbed video...");
    try {
      const r = await axios.post(`${API}/projects/${projectId}/generate-video?burn_subtitles=${burnSubs}`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 900000 });
      setProject(r.data);
      if (r.data.dubbed_video_path) loadFile(r.data.dubbed_video_path, 'video');
      toast.success("Video ready!");
      sendNotification("VoxiDub", "Your dubbed video is ready!");
    } catch { toast.error("Video generation failed"); }
    finally { setProcessingMsg(null); }
  };

  const updateActor = async (actorId, field, value) => {
    let updated = actors.map(a => a.id === actorId ? { ...a, [field]: value } : a);
    let updatedSegs = segments;
    if (field === 'gender') {
      const newVoice = value === 'male' ? 'dara' : 'sophea';
      updated = updated.map(a => a.id === actorId ? { ...a, voice: newVoice } : a);
      updatedSegs = segments.map(s => s.speaker === actorId ? { ...s, gender: value, voice: newVoice } : s);
    } else if (field === 'voice') {
      updatedSegs = segments.map(s => s.speaker === actorId ? { ...s, voice: value } : s);
    }
    setActors(updated); setSegments(updatedSegs);
    try { await axios.patch(`${API}/projects/${projectId}`, { actors: updated, segments: updatedSegs }, { headers: { Authorization: `Bearer ${token}` } }); } catch (err) { console.warn("Actor update save failed:", err.message); }
  };

  const uploadActorVoice = async (actorId, file) => {
    const fd = new FormData(); fd.append('file', file); fd.append('actor_id', actorId);
    try {
      const r = await axios.post(`${API}/projects/${projectId}/upload-actor-voice`, fd, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } });
      setActors(actors.map(a => a.id === actorId ? { ...a, custom_voice: r.data.voice_path } : a));
      setSegments(segments.map(s => s.speaker === actorId ? { ...s, custom_audio: r.data.voice_path } : s));
      toast.success("Voice uploaded!");
    } catch { toast.error("Upload failed"); }
  };

  const removeActorVoice = (actorId) => {
    const updated = actors.map(a => a.id === actorId ? { ...a, custom_voice: null } : a);
    const updatedSegs = segments.map(s => s.speaker === actorId ? { ...s, custom_audio: null } : s);
    setActors(updated); setSegments(updatedSegs);
    axios.patch(`${API}/projects/${projectId}`, { actors: updated, segments: updatedSegs }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  };

  const extractYoutubeVoice = async (actorId) => {
    if (!ytUrl.trim()) { toast.error("Paste YouTube URL first"); return; }
    setYtLoading(actorId);
    try {
      const r = await axios.post(`${API}/projects/${projectId}/youtube-voice`,
        { url: ytUrl.trim(), actor_id: actorId },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 120000 });
      setActors(actors.map(a => a.id === actorId ? { ...a, custom_voice: r.data.path } : a));
      toast.success(`Voice from "${r.data.title}" added!`);
      setYtUrl("");
    } catch (e) { toast.error(e.response?.data?.detail || "YouTube download failed"); }
    finally { setYtLoading(null); }
  };

  const openVoicePicker = (actorId) => {
    setVoicePickerActorId(actorId);
    setVoicePickerOpen(true);
  };

  const handleVoiceSelect = async (voiceData) => {
    setVoicePickerOpen(false);
    const actorId = voicePickerActorId;
    if (!actorId) return;
    if (voiceData.provider === "edge" || voiceData.provider === "mms" || voiceData.provider === "klea") {
      const updated = actors.map(a => a.id === actorId ? { ...a, voice: voiceData.voiceId, tts_provider: "edge", gcloud_voice: null, gcloud_language: null, gemini_voice: null } : a);
      setActors(updated);
      try { await axios.patch(`${API}/projects/${projectId}`, { actors: updated }, { headers: { Authorization: `Bearer ${token}` } }); } catch (err) { console.warn("Save failed:", err.message); }
      toast.success(`Voice: ${voiceData.voiceName}`);
    } else if (voiceData.provider === "gcloud") {
      const updated = actors.map(a => a.id === actorId ? { ...a, tts_provider: "gcloud", gcloud_voice: voiceData.voiceName, gcloud_language: voiceData.languageCode, gemini_voice: null } : a);
      setActors(updated);
      try { await axios.patch(`${API}/projects/${projectId}`, { actors: updated }, { headers: { Authorization: `Bearer ${token}` } }); } catch (err) { console.warn("Save failed:", err.message); }
      toast.success(`Google Voice: ${voiceData.voiceName}`);
    } else if (voiceData.provider === "gemini") {
      const updated = actors.map(a => a.id === actorId ? { ...a, tts_provider: "gemini", gemini_voice: voiceData.voiceName, gcloud_voice: null, gcloud_language: null } : a);
      setActors(updated);
      try { await axios.patch(`${API}/projects/${projectId}`, { actors: updated }, { headers: { Authorization: `Bearer ${token}` } }); } catch (err) { console.warn("Save failed:", err.message); }
      toast.success(`Gemini Voice: ${voiceData.voiceLabel}`);
    }
  };

  const startRecording = async (segIdx, actorId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordTimerRef.current);
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
        
        if (actorId) {
          await uploadActorVoice(actorId, file);
          setRecordingActorId(null);
        } else if (segIdx !== null) {
          const fd = new FormData(); fd.append('file', file); fd.append('segment_id', String(segIdx));
          try {
            const r = await axios.post(`${API}/projects/${projectId}/upload-segment-audio`, fd,
              { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } });
            const updated = [...segments]; updated[segIdx].custom_audio = r.data.audio_path; setSegments(updated);
            toast.success("Recording saved!");
          } catch { toast.error("Save failed"); }
          setRecordingIdx(null);
        }
        setRecordingTime(0);
      };

      mediaRecorder.start();
      if (actorId) setRecordingActorId(actorId); else setRecordingIdx(segIdx);
      setRecordingTime(0);
      recordTimerRef.current = setInterval(() => setRecordingTime(t => t + 0.1), 100);
    } catch { toast.error("Microphone access denied"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const updateSegment = async (idx, field, value) => {
    const updated = segments.map((seg, i) => i === idx ? { ...seg, [field]: value } : seg);
    setSegments(updated);
    setSaveStatus("saving");
    try {
      await axios.patch(`${API}/projects/${projectId}`, { segments: updated }, { headers: { Authorization: `Bearer ${token}` } });
      setSaveStatus("saved");
    } catch { setSaveStatus("error"); }
  };

  const fmt = (s) => { const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

  const saveTitle = async () => {
    if (!titleInput.trim() || titleInput === project?.title) { setEditingTitle(false); return; }
    setSaveStatus("saving");
    try {
      await axios.patch(`${API}/projects/${projectId}`, { title: titleInput.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      setProject({ ...project, title: titleInput.trim() });
      setSaveStatus("saved");
    } catch { setSaveStatus("error"); }
    setEditingTitle(false);
  };

  const mergeSelected = async () => {
    if (selectedSegments.size < 2) { toast.error("Select 2+ segments to merge"); return; }
    try {
      const r = await axios.post(`${API}/projects/${projectId}/merge-segments`,
        { segment_ids: [...selectedSegments] },
        { headers: { Authorization: `Bearer ${token}` } });
      setSegments(r.data.segments || []);
      setSelectedSegments(new Set());
      toast.success("Segments merged!");
    } catch (e) { toast.error(e.response?.data?.detail || "Merge failed"); }
  };

  const splitSegment = async (idx) => {
    try {
      const r = await axios.post(`${API}/projects/${projectId}/split-segment`,
        { segment_id: idx },
        { headers: { Authorization: `Bearer ${token}` } });
      setSegments(r.data.segments || []);
      toast.success("Segment split!");
    } catch (e) { toast.error(e.response?.data?.detail || "Split failed"); }
  };

  const [regenIdx, setRegenIdx] = useState(null);
  const regenerateSegment = async (idx) => {
    setRegenIdx(idx);
    try {
      const r = await axios.post(`${API}/projects/${projectId}/regenerate-segment/${idx}`,
        null,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
      // Play the regenerated audio
      const url = URL.createObjectURL(r.data);
      const audio = new Audio(url);
      audio.play();
      toast.success("Audio regenerated!");
    } catch (e) { toast.error("Regenerate failed"); }
    finally { setRegenIdx(null); }
  };

  const toggleSelect = (idx) => {
    const next = new Set(selectedSegments);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelectedSegments(next);
  };

  const batchExport = async () => {
    toast.info("Starting batch export...");
    const downloads = [];
    if (audioUrl) downloads.push({ url: audioUrl, name: `${project?.title || 'dubbed'}_khmer.wav` });
    if (videoUrl) downloads.push({ url: videoUrl, name: `${project?.title || 'dubbed'}_khmer.mp4` });
    try {
      const r = await axios.get(`${API}/projects/${projectId}/download-mp3`, {
        headers: { Authorization: `Bearer ${token}` }, responseType: 'blob', timeout: 60000
      });
      const url = URL.createObjectURL(r.data);
      downloads.push({ url, name: `${project?.title || 'dubbed'}_khmer.mp3` });
    } catch (err) { console.warn("MP3 batch download failed:", err.message); }
    if (segments.some(s => s.translated)) {
      try {
        const r = await axios.get(`${API}/projects/${projectId}/download-srt`, {
          headers: { Authorization: `Bearer ${token}` }, responseType: 'blob'
        });
        const url = URL.createObjectURL(r.data);
        downloads.push({ url, name: `${project?.title || 'subtitles'}_khmer.srt` });
      } catch (err) { console.warn("SRT batch download failed:", err.message); }
    }
    downloads.forEach((dl, i) => {
      setTimeout(() => {
        const a = document.createElement('a'); a.href = dl.url; a.download = dl.name; a.click();
      }, i * 500);
    });
    toast.success(`Downloading ${downloads.length} files!`);
  };

  const sendNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  const startProgressPoll = () => {
    stopProgressPoll();
    progressPollRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`${API}/projects/${projectId}/queue-status`, { headers: { Authorization: `Bearer ${token}` } });
        setProgressInfo(r.data);
      } catch (err) { console.warn("Progress poll error:", err.message); }
    }, PROGRESS_POLL_MS);
  };
  const stopProgressPoll = useCallback(() => {
    if (progressPollRef.current) { clearInterval(progressPollRef.current); progressPollRef.current = null; }
    setProgressInfo(null);
  }, []);
  useEffect(() => { return () => stopProgressPoll(); }, [stopProgressPoll]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const filteredSegments = segments.map((seg, idx) => ({ ...seg, _origIdx: idx })).filter(seg => {
    if (speakerFilter && seg.speaker !== speakerFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(seg.original || '').toLowerCase().includes(q) && !(seg.translated || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const autoProcess = async () => {
    setProcessingMsg("Auto-processing: Detect → Translate → Audio...");
    startProgressPoll();
    try {
      const r = await axios.post(`${API}/projects/${projectId}/auto-process?speed=${ttsSpeed}&target_language=${targetLanguage}&bg_volume=${bgVolume}`, {}, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 30000
      });
      if (r.data.status === "processing") {
        toast.info(r.data.message || "Processing in background...");
        // Poll until done
        for (let i = 0; i < 200; i++) {
          await new Promise(res => setTimeout(res, 3000));
          try {
            const proj = await axios.get(`${API}/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (proj.data.status === "audio_ready" || proj.data.status === "completed" || proj.data.status === "error") {
              setProject(proj.data);
              if (proj.data.segments) setSegments(proj.data.segments);
              if (proj.data.actors) setActors(proj.data.actors);
              if (proj.data.dubbed_audio_path) loadFile(proj.data.dubbed_audio_path, 'audio');
              if (proj.data.status === "error") { toast.error("Audio generation failed"); }
              else { toast.success("Auto-process complete!"); sendNotification("VoxiDub", "Auto-process complete!"); }
              break;
            }
          } catch (err) { console.warn("Poll error:", err.message); }
        }
      } else {
        setProject(r.data);
        if (r.data.segments) setSegments(r.data.segments);
        if (r.data.actors) setActors(r.data.actors);
        if (r.data.dubbed_audio_path) loadFile(r.data.dubbed_audio_path, 'audio');
        toast.success("Auto-process complete!");
        sendNotification("VoxiDub", "Auto-process complete!");
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Auto-process failed"); }
    finally { setProcessingMsg(null); stopProgressPoll(); }
  };

  const createShareLink = async () => {
    try {
      const r = await axios.post(`${API}/projects/${projectId}/share`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setShareToken(r.data.share_token);
      setShowShareModal(true);
    } catch { toast.error("Failed to create share link"); }
  };

  const removeShareLink = async () => {
    try {
      await axios.delete(`${API}/projects/${projectId}/share`, { headers: { Authorization: `Bearer ${token}` } });
      setShareToken(null);
      setShowShareModal(false);
      toast.success("Share link removed");
    } catch { toast.error("Failed to remove share link"); }
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/shared/${shareToken}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
    toast.success("Link copied!");
  };

  const downloadSrt = async () => {
    try {
      const r = await axios.get(`${API}/projects/${projectId}/download-srt`, {
        headers: { Authorization: `Bearer ${token}` }, responseType: 'blob'
      });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = `${project?.title || 'subtitles'}_khmer.srt`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Failed to download SRT"); }
  };

  const downloadMp3 = async () => {
    try {
      toast.info("Converting to MP3...");
      const r = await axios.get(`${API}/projects/${projectId}/download-mp3`, {
        headers: { Authorization: `Bearer ${token}` }, responseType: 'blob', timeout: 60000
      });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = `${project?.title || 'dubbed'}_khmer.mp3`; a.click();
      URL.revokeObjectURL(url);
      toast.success("MP3 downloaded!");
    } catch { toast.error("Failed to download MP3"); }
  };

  const previewLine = async (idx) => {
    const seg = segments[idx];
    const text = seg?.translated || seg?.original;
    if (!text) { toast.error("No text to preview"); return; }
    setPreviewingIdx(idx);
    try {
      const r = await axios.post(`${API}/projects/${projectId}/preview-tts`, 
        { text, gender: seg.gender || 'female', speed: ttsSpeed },
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob', timeout: 30000 }
      );
      const url = URL.createObjectURL(r.data);
      const audio = new Audio(url);
      audio.onended = () => { setPreviewingIdx(null); URL.revokeObjectURL(url); };
      audio.play();
    } catch { toast.error("Preview failed"); setPreviewingIdx(null); }
  };

  const speakerColors = ['cyan', 'pink', 'amber', 'emerald', 'purple', 'rose'];
  const getSpeakerColorIdx = (speakerId) => {
    const idx = actors.findIndex(a => a.id === speakerId);
    return idx >= 0 ? idx % speakerColors.length : 0;
  };

  if (loading) return <div className={`min-h-screen flex items-center justify-center ${d?'bg-zinc-950':'bg-zinc-50'}`}><Spinner className="w-12 h-12 text-zinc-400 animate-spin" /></div>;

  const step = getCurrentStep();

  return (
    <div className={`min-h-screen flex flex-col ${d?'bg-zinc-950':'bg-zinc-50'}`} data-testid="editor-page" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <ProcessingOverlay message={processingMsg} isDark={d} progressInfo={progressInfo} />

      {/* Header */}
      <header className={`px-4 py-2.5 flex items-center justify-between shadow-sm border-b ${d?'bg-zinc-900 border-zinc-800':'bg-white border-black/10'}`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className={`transition-colors p-1 ${d?'text-zinc-500 hover:text-white':'text-zinc-400 hover:text-zinc-950'}`} data-testid="back-btn">
            <ArrowLeft className="w-5 h-5" />
          </button>
          {editingTitle ? (
            <input type="text" value={titleInput} onChange={(e) => setTitleInput(e.target.value)}
              onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
              autoFocus data-testid="title-input"
              className={`font-semibold text-sm px-2 py-1 rounded-sm border outline-none ${d?'bg-zinc-800 text-white border-zinc-600 focus:border-zinc-400':'bg-zinc-50 text-zinc-950 border-zinc-300 focus:border-zinc-950'}`} style={{ fontFamily: "'Outfit', sans-serif" }} />
          ) : (
            <span className={`font-semibold text-sm cursor-pointer transition-colors flex items-center gap-1 ${d?'text-white hover:text-zinc-300':'text-zinc-950 hover:text-zinc-600'}`}
              onClick={() => { setEditingTitle(true); setTitleInput(project?.title || ""); }}
              data-testid="project-title" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {project?.title} <PencilSimple className={`w-3 h-3 ${d?'text-zinc-500':'text-zinc-400'}`} />
            </span>
          )}
          {project?.detected_language && (
            <span className={`text-[10px] px-2 py-0.5 rounded-sm flex items-center gap-1 font-bold uppercase tracking-wider ${d?'text-zinc-400 bg-zinc-800 border border-zinc-700':'text-zinc-600 bg-zinc-100'}`} data-testid="detected-language">
              <Globe className="w-3 h-3" /> {project.detected_language?.toUpperCase()}
            </span>
          )}
          <span data-testid="save-status" className={`text-[10px] font-medium flex items-center gap-1 ${
            saveStatus === 'saving' ? 'text-amber-600' : saveStatus === 'error' ? 'text-red-600' : (d?'text-zinc-500':'text-zinc-400')
          }`}>
            <FloppyDisk className="w-3 h-3" />
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Save error' : 'Saved'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StepProgress currentStep={step} steps={["Upload", "Detect", "Translate", "Audio", "Video"]} isDark={d} />
          <ThemeToggle />
          {(audioUrl || videoUrl) && (
            <button onClick={createShareLink} data-testid="share-btn"
              className={`ml-2 px-3 py-1.5 text-[11px] font-bold rounded-sm flex items-center gap-1.5 border transition-all ${d?'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500':'bg-zinc-100 border-black/10 text-zinc-700 hover:text-zinc-950 hover:border-zinc-400'}`}>
              <ShareNetwork className="w-3.5 h-3.5" /> Share
            </button>
          )}
        </div>
      </header>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && shareToken && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setShowShareModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className={`border rounded-sm p-6 max-w-md w-full mx-4 shadow-xl ${d?'bg-zinc-900 border-zinc-700':'bg-white border-black/10'}`}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-4">
                <ShareNetwork className={`w-5 h-5 ${d?'text-white':'text-zinc-950'}`} />
                <h3 className={`font-semibold ${d?'text-white':'text-zinc-950'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>Share Project</h3>
              </div>
              <p className="text-zinc-500 text-xs mb-4">Anyone with this link can view and download the dubbed video.</p>
              <div className={`flex items-center gap-2 border rounded-sm p-2 ${d?'bg-zinc-800 border-zinc-700':'bg-zinc-50 border-black/10'}`}>
                <Link className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <input type="text" readOnly value={`${window.location.origin}/shared/${shareToken}`}
                  className={`flex-1 bg-transparent text-xs outline-none font-mono ${d?'text-zinc-200':'text-zinc-950'}`} />
                <button onClick={copyShareLink} data-testid="copy-share-link"
                  className={`px-3 py-1.5 rounded-sm text-[11px] font-bold transition-all flex items-center gap-1 ${
                    shareCopied ? 'bg-emerald-50 text-emerald-700' : (d?'bg-white text-zinc-950 hover:bg-zinc-200':'bg-zinc-950 text-white hover:bg-zinc-800')
                  }`}>
                  {shareCopied ? <><CheckCircle className="w-3 h-3" weight="fill" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
              <div className="flex justify-between mt-4">
                <button onClick={removeShareLink} className="text-red-500 text-[11px] hover:text-red-700 transition-colors font-medium">
                  Remove link
                </button>
                <button onClick={() => setShowShareModal(false)} className={`px-4 py-1.5 text-[11px] font-bold rounded-sm transition-colors ${d?'bg-zinc-800 text-white hover:bg-zinc-700':'bg-zinc-100 text-zinc-950 hover:bg-zinc-200'}`}>
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className={`w-72 min-w-[288px] border-r flex flex-col overflow-y-auto ${d?'bg-zinc-900 border-zinc-800':'bg-white border-black/10'}`}>
          <div className="p-4 space-y-3 flex-1">
            {/* Upload */}
            <div>
              <label className={`text-[10px] uppercase font-semibold tracking-wider mb-1.5 block ${d?'text-zinc-500':'text-zinc-500'}`}>Upload</label>
              <input ref={fileInputRef} type="file" accept="video/*,audio/*" onChange={handleUpload} className="hidden" />
              {project?.original_filename ? (
                <div className={`border rounded-sm p-3 ${d?'bg-zinc-800 border-zinc-700':'bg-zinc-50 border-black/10'}`}>
                  <p className={`text-xs truncate font-medium ${d?'text-white':'text-zinc-950'}`}>{project.original_filename}</p>
                  <p className={`text-[10px] mt-0.5 uppercase ${d?'text-zinc-500':'text-zinc-400'}`}>{project.file_type}</p>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} disabled={!!processingMsg} data-testid="upload-btn"
                  className={`w-full py-4 border border-dashed rounded-sm text-xs transition-all ${d?'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300':'border-black/10 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700'}`}>
                  <Upload className="w-5 h-5 mx-auto mb-1" /> Click to upload video
                  <p className={`text-[9px] mt-1 ${d?'text-zinc-600':'text-zinc-400'}`}>Max 10 minutes, 500MB</p>
                </button>
              )}
            </div>

            {project?.original_filename && !audioUrl && (
              <button onClick={autoProcess} disabled={!!processingMsg} data-testid="auto-process-btn"
                className="w-full py-3 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 border border-zinc-950/20 text-zinc-700 text-xs font-semibold rounded-sm hover:from-cyan-500/25 hover:to-blue-500/25 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                <Spinner className={`w-3.5 h-3.5 ${processingMsg ? 'animate-spin' : ''}`} />
                {processingMsg ? 'Processing...' : 'Auto Process (Detect → Translate → Audio)'}
              </button>
            )}

            {originalVideoUrl && (
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block">Original Video</label>
                <video ref={originalVideoRef} src={originalVideoUrl} controls className="w-full rounded-sm bg-black" style={{ maxHeight: '200px' }} data-testid="original-video-preview" />
              </div>
            )}

            {project?.original_file_path && (
              <button onClick={transcribe} disabled={!!processingMsg} data-testid="transcribe-btn"
                className={`w-full py-2.5 border text-xs font-medium rounded-sm transition-all disabled:opacity-40 ${d?'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700':'bg-zinc-100 border-black/10 text-zinc-950 hover:bg-zinc-100'}`}>
                Detect Speakers & Text
              </button>
            )}

            {segments.length > 0 && (
              <div>
                <label className={`text-[10px] uppercase font-semibold tracking-wider mb-1.5 block ${d?'text-zinc-500':'text-zinc-500'}`}>Output Language</label>
                <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}
                  data-testid="target-language-select"
                  className={`w-full text-xs px-3 py-2 border rounded-sm outline-none font-medium ${d?'bg-zinc-800 border-zinc-700 text-white':'bg-white border-black/10 text-zinc-950'}`}>
                  {Object.entries(OUTPUT_LANGUAGES).map(([code, lang]) => (
                    <option key={code} value={code}>{lang.name}</option>
                  ))}
                </select>
              </div>
            )}

            {segments.length > 0 && (
              <button onClick={translate} disabled={!!processingMsg} data-testid="translate-btn"
                className={`w-full py-2.5 border text-xs font-semibold rounded-sm transition-all disabled:opacity-40 ${d?'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700':'bg-zinc-950/5 border-zinc-950/15 text-zinc-700 hover:bg-zinc-100'}`}>
                Translate to {OUTPUT_LANGUAGES[targetLanguage]?.name || "Khmer"}
              </button>
            )}

            {segments.some(s => s.translated || s.custom_audio) && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={`text-[10px] uppercase font-semibold tracking-wider ${d?'text-zinc-500':'text-zinc-500'}`}>Speed</label>
                  <span className={`text-xs font-bold ${d?'text-zinc-300':'text-zinc-700'}`}>{ttsSpeed >= 0 ? '+' : ''}{ttsSpeed}%</span>
                </div>
                <input type="range" min={-10} max={15} value={ttsSpeed} onChange={(e) => setTtsSpeed(Number(e.target.value))}
                  data-testid="tts-speed-slider"
                  className="w-full h-1 bg-zinc-200 rounded-sm appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-sm" />
                <div className="flex justify-between text-[9px] text-zinc-400 mt-0.5">
                  <span>Slow</span><span>Normal</span><span>Fast</span>
                </div>
              </div>
            )}

            {segments.some(s => s.translated || s.custom_audio) && project?.file_type === 'video' && (
              <div className={`rounded-sm p-3 border ${d?'bg-zinc-800 border-zinc-700':'bg-zinc-50 border-zinc-200'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${d?'text-zinc-400':'text-zinc-500'}`}>Original Audio</span>
                  <span className={`text-[10px] font-bold ${bgVolume === 0 ? (d?'text-red-400':'text-red-500') : (d?'text-emerald-400':'text-emerald-600')}`}>
                    {bgVolume === 0 ? 'OFF' : `${bgVolume}%`}
                  </span>
                </div>
                <input type="range" min={0} max={100} step={5} value={bgVolume}
                  onChange={e => setBgVolume(Number(e.target.value))}
                  data-testid="bg-volume-slider"
                  className="w-full h-1 bg-zinc-200 rounded-sm appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:rounded-sm" />
                <div className="flex justify-between text-[9px] text-zinc-400 mt-0.5">
                  <span>Off</span><span>Low</span><span>Full</span>
                </div>
                <p className={`text-[9px] mt-1 ${d?'text-zinc-600':'text-zinc-400'}`}>
                  {bgVolume === 0 ? 'No original audio - only dubbed voice' : 'Keeps background music + sound effects'}
                </p>
              </div>
            )}

            {segments.some(s => s.translated || s.custom_audio) && (
              <button onClick={generateAudio} disabled={!!processingMsg} data-testid="generate-audio-btn"
                className="w-full py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-sm hover:bg-emerald-100 transition-all disabled:opacity-40">
                <SpeakerHigh className="w-3.5 h-3.5 inline mr-1" /> Generate Khmer Audio
              </button>
            )}

            {audioUrl && project?.file_type === 'video' && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer" data-testid="burn-subs-toggle">
                  <input type="checkbox" checked={burnSubs} onChange={(e) => setBurnSubs(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-black/10 bg-white/5 text-cyan-500 focus:ring-cyan-500/30" />
                  <span className="text-[10px] text-zinc-500">Burn Khmer subtitles into video</span>
                </label>
                <button onClick={generateVideo} disabled={!!processingMsg} data-testid="generate-video-btn"
                  className="w-full py-2.5 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold rounded-sm hover:bg-violet-100 transition-all disabled:opacity-40">
                  <FilmStrip className="w-3.5 h-3.5 inline mr-1" /> Generate Video
                </button>
              </div>
            )}
          </div>

          {/* Preview & Download */}
          {(audioUrl || videoUrl) && (
            <div className={`border-t p-4 space-y-3 ${d?'border-zinc-800':'border-black/10'}`}>
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider block">Output</label>
                {videoUrl && originalVideoUrl && (
                  <button onClick={() => setCompareMode(!compareMode)} data-testid="compare-btn"
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm transition-all ${
                      compareMode ? 'bg-zinc-100 text-zinc-700' : 'text-zinc-500 hover:text-zinc-950'
                    }`}>
                    <Eye className="w-3 h-3 inline mr-0.5" /> Compare
                  </button>
                )}
              </div>
              {compareMode && originalVideoUrl && videoUrl ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-[9px] text-zinc-400 uppercase mb-1">Original</p>
                    <video src={originalVideoUrl} controls className="w-full rounded-sm bg-black" style={{ maxHeight: '180px' }} />
                  </div>
                  <div>
                    <p className="text-[9px] text-cyan-500 uppercase mb-1">Dubbed</p>
                    <video src={videoUrl} controls className="w-full rounded-sm bg-black" style={{ maxHeight: '180px' }} />
                  </div>
                </div>
              ) : (
                <>
                  {videoUrl && (
                    <video src={videoUrl} controls className="w-full rounded-sm bg-black" style={{ maxHeight: '240px' }} data-testid="video-preview" />
                  )}
                </>
              )}
              <div className="flex gap-2">
                {audioUrl && (
                  <a href={audioUrl} download={`${project?.title || 'dubbed'}_khmer.wav`} data-testid="download-audio-btn"
                    className="flex-1 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-center text-[11px] font-semibold rounded-sm hover:bg-emerald-100 flex items-center justify-center gap-1">
                    <Download className="w-3 h-3" /> WAV
                  </a>
                )}
                {audioUrl && (
                  <button onClick={downloadMp3} data-testid="download-mp3-btn"
                    className="flex-1 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-center text-[11px] font-semibold rounded-sm hover:bg-emerald-100 flex items-center justify-center gap-1">
                    <MusicNote className="w-3 h-3" /> MP3
                  </button>
                )}
                {videoUrl && (
                  <a href={videoUrl} download={`${project?.title || 'dubbed'}_khmer.mp4`} data-testid="download-video-btn"
                    className="flex-1 py-2 bg-zinc-950/5 border border-zinc-950/15 text-zinc-700 text-center text-[11px] font-semibold rounded-sm hover:bg-zinc-100 flex items-center justify-center gap-1">
                    <Download className="w-3 h-3" /> MP4
                  </a>
                )}
              </div>
              {segments.some(s => s.translated) && (
                <button onClick={downloadSrt} data-testid="download-srt-btn"
                  className="w-full py-2 bg-violet-50 border border-violet-200 text-violet-700 text-[11px] font-semibold rounded-sm hover:bg-violet-100 flex items-center justify-center gap-1">
                  <Subtitles className="w-3 h-3" /> Download SRT Subtitle
                </button>
              )}
              <button onClick={batchExport} data-testid="batch-export-btn"
                className="w-full py-2 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold rounded-sm hover:bg-amber-100 flex items-center justify-center gap-1">
                <Package className="w-3 h-3" /> Export All (MP3+MP4+SRT)
              </button>
              {project?.file_type === 'video' && (
                <div className="mt-1 space-y-1.5">
                  <button onClick={extractBackground} disabled={extractingBg} data-testid="extract-bg-btn"
                    className="w-full py-2 bg-pink-50 border border-pink-200 text-pink-700 text-[11px] font-semibold rounded-sm hover:bg-pink-100 disabled:opacity-50 flex items-center justify-center gap-1">
                    {extractingBg ? <><Spinner className="w-3 h-3 animate-spin" /> Removing voice...</> : <><MusicNote className="w-3 h-3" /> Extract Background Audio</>}
                  </button>
                  {bgAudioUrl && (
                    <a href={bgAudioUrl} download={`${project?.title || 'background'}_music.wav`} data-testid="download-bg-audio-btn"
                      className="w-full py-2 bg-pink-100 border border-pink-300 text-pink-800 text-center text-[11px] font-bold rounded-sm hover:bg-pink-200 flex items-center justify-center gap-1">
                      <Download className="w-3 h-3" /> Download Background Music
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Extract Background Audio - always visible for videos */}
          {project?.file_type === 'video' && !(audioUrl || videoUrl) && (
            <div className={`border-t p-4 space-y-1.5 ${d?'border-zinc-800':'border-black/10'}`}>
              <button onClick={extractBackground} disabled={extractingBg} data-testid="extract-bg-btn-standalone"
                className="w-full py-2 bg-pink-50 border border-pink-200 text-pink-700 text-[11px] font-semibold rounded-sm hover:bg-pink-100 disabled:opacity-50 flex items-center justify-center gap-1">
                {extractingBg ? <><Spinner className="w-3 h-3 animate-spin" /> Removing voice...</> : <><MusicNote className="w-3 h-3" /> Extract Background Audio</>}
              </button>
              {bgAudioUrl && (
                <a href={bgAudioUrl} download={`${project?.title || 'background'}_music.wav`} data-testid="download-bg-audio-btn-standalone"
                  className="w-full py-2 bg-pink-100 border border-pink-300 text-pink-800 text-center text-[11px] font-bold rounded-sm hover:bg-pink-200 flex items-center justify-center gap-1">
                  <Download className="w-3 h-3" /> Download Background Music
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Actors Panel */}
          {actors.length > 0 && (
            <div className={`border-b p-4 ${d?'bg-zinc-900/50 border-zinc-800':'bg-white/50 border-black/10'}`}>
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                <h3 className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Actors
                </h3>
                {actors.map((actor) => {
                  const isMale = actor.gender === 'male';
                  const actorTotal = segments.filter(s => s.speaker === actor.id).reduce((sum, s) => sum + ((s.end || 0) - (s.start || 0)), 0);
                  const mins = Math.floor(actorTotal / 60);
                  const secs = Math.round(actorTotal % 60);
                  return (
                    <div key={`summary-${actor.id}`} className={`flex items-center gap-1.5 px-3 py-1 rounded-sm text-[11px] font-bold border ${
                      isMale
                        ? (d ? 'bg-blue-900/30 text-blue-300 border-blue-700/40' : 'bg-blue-50 text-blue-700 border-blue-200')
                        : (d ? 'bg-pink-900/30 text-pink-300 border-pink-700/40' : 'bg-pink-50 text-pink-700 border-pink-200')
                    }`}>
                      {isMale ? <GenderMale className="w-3 h-3" weight="bold" /> : <GenderFemale className="w-3 h-3" weight="bold" />}
                      {actor.label}:
                      <span className={`font-bold ml-0.5 ${d?'text-white':'text-zinc-950'}`}>
                        {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
                      </span>
                    </div>
                  );
                })}
                <div className="ml-auto text-[10px] text-zinc-500">
                  Total: <span className={`font-semibold ${d?'text-white':'text-zinc-950'}`}>
                    {(() => {
                      const t = segments.reduce((sum, s) => sum + ((s.end || 0) - (s.start || 0)), 0);
                      const m = Math.floor(t / 60); const s = Math.round(t % 60);
                      return m > 0 ? `${m}m ${s}s` : `${s}s`;
                    })()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {actors.map((actor) => {
                  const isMale = actor.gender === 'male';
                  const actorSegs = segments.filter(s => s.speaker === actor.id);
                  const totalLen = actorSegs.reduce((sum, s) => sum + ((s.end || 0) - (s.start || 0)), 0);
                  const segCount = actorSegs.length;
                  return (
                    <div key={actor.id} data-testid={`actor-card-${actor.id}`}
                      className={`min-w-[185px] rounded-sm p-2.5 transition-all flex-shrink-0 border-l-4 border ${
                        isMale
                          ? (d ? 'bg-zinc-800 border-zinc-700 border-l-blue-500' : 'bg-white border-zinc-200 border-l-blue-500')
                          : (d ? 'bg-zinc-800 border-zinc-700 border-l-pink-500' : 'bg-white border-zinc-200 border-l-pink-500')
                      }`}>
                      <div className={`flex items-center gap-1.5 mb-2 pb-2 border-b ${d ? 'border-zinc-700' : 'border-zinc-200'}`}>
                        <div className={`w-7 h-7 rounded-sm flex items-center justify-center ${isMale ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-pink-100 dark:bg-pink-900/40'}`}>
                          {isMale ? <GenderMale className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" weight="bold" /> : <GenderFemale className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400" weight="bold" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-[11px] truncate ${d?'text-white':'text-zinc-900'}`}>{actor.label || actor.id}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <select data-testid={`actor-gender-${actor.id}`} value={actor.gender || 'female'}
                              onChange={(e) => updateActor(actor.id, 'gender', e.target.value)}
                              className={`text-[9px] font-bold border-none outline-none cursor-pointer rounded px-1 py-0.5 ${
                                isMale ? (d ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700') : (d ? 'bg-pink-900/50 text-pink-300' : 'bg-pink-100 text-pink-700')
                              }`}>
                              <option value="female">Girl</option>
                              <option value="male">Boy</option>
                            </select>
                            {actor.role && (
                              <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${d?'bg-cyan-900/30 text-cyan-300':'bg-cyan-50 text-cyan-700'}`} data-testid={`actor-role-${actor.id}`}>
                                {actor.role}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className={`rounded-sm px-2 py-1.5 mb-2 border cursor-pointer transition-all ${
                        speakerFilter === actor.id
                          ? (d ? 'bg-emerald-900/30 border-emerald-600 ring-1 ring-emerald-500' : 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400')
                          : isMale ? (d ? 'bg-blue-900/20 border-blue-800/30 hover:border-blue-600' : 'bg-blue-50 border-blue-200 hover:border-blue-400') : (d ? 'bg-pink-900/20 border-pink-800/30 hover:border-pink-600' : 'bg-pink-50 border-pink-200 hover:border-pink-400')
                      }`} onClick={() => setSpeakerFilter(speakerFilter === actor.id ? null : actor.id)}
                        data-testid={`actor-filter-lines-${actor.id}`}
                        title={speakerFilter === actor.id ? "Click to show all lines" : `Click to show only ${actor.label || actor.id} lines`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-[9px] font-semibold ${
                            speakerFilter === actor.id ? (d ? 'text-emerald-300' : 'text-emerald-600') : isMale ? (d?'text-blue-300':'text-blue-600') : (d?'text-pink-300':'text-pink-600')
                          }`}>
                            {speakerFilter === actor.id ? '✓ ' : ''}{segCount} {segCount === 1 ? 'line' : 'lines'}
                          </span>
                          <span className={`text-[10px] font-bold ${isMale ? (d?'text-blue-200':'text-blue-700') : (d?'text-pink-200':'text-pink-700')}`}>
                            {totalLen < 60 ? `${totalLen.toFixed(1)}s` : `${Math.floor(totalLen / 60)}m ${Math.round(totalLen % 60)}s`}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {!actor.custom_voice && (
                          <div className="flex items-center gap-1">
                            <div className={`flex-1 text-[10px] px-1.5 py-1 border rounded-md truncate ${d?'bg-zinc-700 text-zinc-200 border-zinc-600':'bg-zinc-50 text-zinc-700 border-zinc-300'}`}>
                              <span className="flex items-center gap-1">
                                <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${d?'bg-zinc-600 text-zinc-300':'bg-zinc-200 text-zinc-600'}`}>Edge</span>
                                {(isMale ? maleVoices : femaleVoices).find(v => v.id === actor.voice)?.name || actor.voice || 'Select voice'}
                              </span>
                            </div>
                            <button onClick={() => openVoicePicker(actor.id)} data-testid={`actor-browse-voices-${actor.id}`}
                              className={`px-2 py-1 text-[9px] font-bold rounded-md border transition-colors ${d?'bg-cyan-900/30 border-cyan-700 text-cyan-300 hover:bg-cyan-900/50':'bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100'}`}>
                              Browse
                            </button>
                          </div>
                        )}
                        {actor.custom_voice ? (
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-md border ${d?'bg-emerald-900/20 border-emerald-700/30':'bg-emerald-50 border-emerald-200'}`}>
                            <CheckCircle className={`w-3 h-3 flex-shrink-0 ${d?'text-emerald-400':'text-emerald-600'}`} weight="fill" />
                            <span className={`text-[9px] font-semibold flex-1 ${d?'text-emerald-300':'text-emerald-700'}`}>Your Voice</span>
                            <button data-testid={`actor-remove-voice-${actor.id}`} onClick={() => removeActorVoice(actor.id)}
                              className="text-red-400 hover:text-red-600 text-[9px]">Remove</button>
                          </div>
                        ) : (
                          <div>
                            {recordingActorId === actor.id ? (
                              <button onClick={stopRecording} data-testid={`actor-stop-record-${actor.id}`}
                                className="w-full flex items-center justify-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-[9px] font-semibold rounded-md animate-pulse">
                                <Stop className="w-2.5 h-2.5" weight="fill" /> Stop ({recordingTime.toFixed(1)}s)
                              </button>
                            ) : (
                              <div className="flex gap-1">
                                <label data-testid={`actor-upload-voice-${actor.id}`}
                                  className={`cursor-pointer flex-1 flex items-center justify-center gap-1 px-1.5 py-1 border text-[9px] font-semibold transition-colors rounded-md ${d?'bg-zinc-700 border-zinc-600 text-zinc-200 hover:bg-zinc-600':'bg-zinc-50 border-zinc-300 text-zinc-700 hover:bg-zinc-100'}`}>
                                  <input type="file" accept="audio/*" className="hidden"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadActorVoice(actor.id, f); }} />
                                  <Upload className="w-2.5 h-2.5" /> Upload
                                </label>
                                <button onClick={() => startRecording(null, actor.id)} data-testid={`actor-record-voice-${actor.id}`}
                                  className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 border text-[9px] font-semibold transition-colors rounded-md ${d?'bg-red-900/30 border-red-700 text-red-400 hover:bg-red-900/50':'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'}`}>
                                  <Record className="w-2.5 h-2.5" weight="fill" /> Rec
                                </button>
                              </div>
                            )}
                            <div className="mt-1">
                              <div className="flex gap-1">
                                <input type="text" placeholder="YouTube URL..."
                                  value={ytLoading === actor.id ? "Downloading..." : ytUrl}
                                  onChange={(e) => setYtUrl(e.target.value)}
                                  disabled={ytLoading === actor.id}
                                  data-testid={`actor-yt-url-${actor.id}`}
                                  className={`flex-1 px-1.5 py-1 border rounded-md text-[9px] outline-none ${d?'bg-zinc-700 border-zinc-600 text-zinc-200 placeholder-zinc-500':'bg-zinc-50 border-zinc-300 text-zinc-700 placeholder-zinc-400'} ${ytLoading === actor.id ? 'opacity-50' : ''}`} />
                                <button onClick={() => extractYoutubeVoice(actor.id)}
                                  disabled={ytLoading === actor.id}
                                  data-testid={`actor-yt-extract-${actor.id}`}
                                  className={`px-1.5 py-1 border text-[9px] font-semibold rounded-md transition-colors ${ytLoading === actor.id ? 'opacity-50' : ''} ${d?'bg-red-900/30 border-red-700 text-red-400':'bg-red-50 border-red-200 text-red-600'}`}>
                                  YT
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {actorSegs.length > 0 && (
                          <button data-testid={`actor-download-script-${actor.id}`}
                            onClick={() => {
                              const LINES_PER_PAGE = 15;
                              const totalPages = Math.ceil(actorSegs.length / LINES_PER_PAGE);
                              const fmtTime = (s) => { const m = Math.floor(s / 60); const sec = Math.round(s % 60); return m > 0 ? `${m}:${String(sec).padStart(2,'0')}` : `0:${String(sec).padStart(2,'0')}`; };
                              const fmtDur = (t) => t < 60 ? `${t.toFixed(0)}s` : `${Math.floor(t / 60)}m ${Math.round(t % 60)}s`;
                              let output = `========================================\n  ${actor.label || actor.id} - Full Script\n  Total: ${segCount} lines, ${fmtDur(totalLen)}\n========================================\n\n`;
                              for (let page = 0; page < totalPages; page++) {
                                const start = page * LINES_PER_PAGE;
                                const end = Math.min(start + LINES_PER_PAGE, actorSegs.length);
                                const pageSegs = actorSegs.slice(start, end);
                                const pageTime = pageSegs.reduce((sum, s) => sum + ((s.end || 0) - (s.start || 0)), 0);
                                output += `--- Page ${page + 1} of ${totalPages} (${fmtDur(pageTime)}) ---\n\n`;
                                pageSegs.forEach((s) => {
                                  const text = s.translated || s.original || '(no text)';
                                  const dur = ((s.end || 0) - (s.start || 0)).toFixed(1);
                                  output += `${fmtTime(s.start || 0)} [${dur}s]  ${text}\n\n`;
                                });
                                output += `\n`;
                              }
                              const blob = new Blob([output], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a'); a.href = url; a.download = `${(actor.label || actor.id).replace(/\s/g, '_')}_script.txt`; a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className={`w-full flex items-center justify-center gap-1 px-1.5 py-0.5 text-[8px] border rounded-md transition-colors mt-1 ${d?'text-zinc-400 hover:text-white border-zinc-700 hover:border-zinc-500':'text-zinc-500 hover:text-zinc-900 border-zinc-200 hover:border-zinc-400'}`}>
                            <Download className="w-2 h-2" /> Script
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search & Tools Bar */}
          {segments.length > 0 && (
            <div className={`border-b px-4 py-2 flex items-center gap-3 ${d?'bg-zinc-900/50 border-zinc-800':'bg-white/50 border-black/10'}`}>
              <div className="relative flex-1 max-w-xs">
                <MagnifyingGlass className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search segments..." data-testid="search-segments"
                  className={`w-full border rounded-sm pl-8 pr-3 py-1.5 text-xs placeholder-zinc-400 outline-none ${d?'bg-zinc-800 border-zinc-700 text-white focus:border-zinc-500':'bg-zinc-50 border-black/10 text-zinc-950 focus:border-zinc-400'}`} />
              </div>
              {selectedSegments.size >= 2 && (
                <button onClick={mergeSelected} data-testid="merge-segments-btn"
                  className="px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[11px] font-semibold rounded-sm hover:bg-orange-500/20 flex items-center gap-1 transition-colors">
                  <ArrowsMerge className="w-3.5 h-3.5" /> Merge ({selectedSegments.size})
                </button>
              )}
              {selectedSegments.size > 0 && (
                <button onClick={() => setSelectedSegments(new Set())}
                  className="text-[10px] text-zinc-500 hover:text-zinc-950 transition-colors">
                  Clear selection
                </button>
              )}
              <span className="text-[10px] text-zinc-400 ml-auto">
                {speakerFilter
                  ? <span className="flex items-center gap-1.5">
                      <span className={`text-emerald-600 font-bold`}>{filteredSegments.length} of {segments.length} lines</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm cursor-pointer ${d ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
                        {actors.find(a => a.id === speakerFilter)?.label || speakerFilter}
                      </span>
                      <button onClick={() => setSpeakerFilter(null)} className="text-red-400 hover:text-red-600 text-[10px] font-bold" data-testid="clear-speaker-filter">✕ Clear</button>
                    </span>
                  : searchQuery ? `${filteredSegments.length} of ${segments.length}` : `${segments.length} segments`}
              </span>
            </div>
          )}

          {/* Subtitle Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs" data-testid="subtitle-table">
              <thead className={`sticky top-0 z-10 ${d?'bg-zinc-900':'bg-white'}`}>
                <tr className={`text-[10px] uppercase tracking-wider ${d?'text-zinc-500':'text-zinc-400'}`}>
                  <th className="px-1 py-2.5 text-center w-7"></th>
                  <th className="px-2 py-2.5 text-left w-7"></th>
                  <th className="px-2 py-2.5 text-left w-8">#</th>
                  <th className="px-2 py-2.5 text-left w-14">Start</th>
                  <th className="px-2 py-2.5 text-left w-14">End</th>
                  <th className="px-2 py-2.5 text-left w-14">Length</th>
                  <th className="px-2 py-2.5 text-left">Original</th>
                  <th className="px-2 py-2.5 text-left">Khmer (Translated)</th>
                  <th className="px-2 py-2.5 text-left w-24">Speaker</th>
                  <th className="px-2 py-2.5 text-left w-16">Voice</th>
                  <th className="px-2 py-2.5 text-center w-20">Speed</th>
                  <th className="px-2 py-2.5 text-left w-32">Add Voice</th>
                  <th className="px-2 py-2.5 text-center w-8"></th>
                </tr>
              </thead>
              <tbody>
                {segments.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-24 text-zinc-400">
                      <VideoCamera className={`w-10 h-10 mx-auto mb-3 ${d?'text-zinc-600':'text-zinc-300'}`} weight="duotone" />
                      <p className="text-sm">Upload a video and detect speakers to get started</p>
                    </td>
                  </tr>
                ) : (
                  filteredSegments.map((seg) => {
                    const idx = seg._origIdx;
                    const actor = actors.find(a => a.id === seg.speaker);
                    const hasCustom = actor?.custom_voice || seg.custom_audio;
                    const isSelected = selectedSegments.has(idx);
                    const speakerIdx = actors.findIndex(a => a.id === seg.speaker);
                    const rowColors = ['border-l-cyan-500/40', 'border-l-pink-500/40', 'border-l-amber-500/40', 'border-l-emerald-500/40', 'border-l-purple-500/40', 'border-l-rose-500/40'];
                    const rowColor = rowColors[speakerIdx >= 0 ? speakerIdx % rowColors.length : 0];
                    return (
                      <tr key={idx} className={`border-b transition-colors border-l-2 ${rowColor} ${isSelected ? 'bg-cyan-500/5' : ''} ${d?'border-b-zinc-800 hover:bg-zinc-800/50':'border-b-black/5 hover:bg-white'}`}
                        data-testid={`segment-row-${idx}`}>
                        <td className="px-1 py-2">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(idx)}
                            data-testid={`segment-select-${idx}`}
                            className="w-3 h-3 rounded border-black/10 bg-white/5 text-cyan-500 focus:ring-cyan-500/30 cursor-pointer" />
                        </td>
                        <td className="px-1 py-2">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => previewLine(idx)} disabled={previewingIdx !== null}
                              data-testid={`segment-play-${idx}`}
                              className={`w-6 h-6 rounded-sm flex items-center justify-center transition-all ${
                                previewingIdx === idx ? 'bg-zinc-100 text-zinc-700 animate-pulse' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50'
                              }`}>
                              <Play className="w-3 h-3" weight="fill" />
                            </button>
                            <button onClick={() => regenerateSegment(idx)} disabled={regenIdx !== null}
                              data-testid={`segment-regen-${idx}`}
                              title="Regenerate audio for this line"
                              className={`w-6 h-6 rounded-sm flex items-center justify-center transition-all ${
                                regenIdx === idx
                                  ? 'bg-emerald-100 text-emerald-600 animate-spin'
                                  : 'text-zinc-300 hover:text-emerald-600 hover:bg-emerald-50'
                              }`}>
                              <ArrowsClockwise className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2.5 text-zinc-500 font-mono">{fmt(seg.start || 0)}</td>
                        <td className="px-3 py-2.5 text-zinc-500 font-mono">{fmt(seg.end || 0)}</td>
                        <td className="px-3 py-2.5">
                          <span className="text-amber-700 font-mono font-semibold text-[11px]">
                            {((seg.end || 0) - (seg.start || 0)).toFixed(1)}s
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="text" value={seg.original || ""} onChange={(e) => updateSegment(idx, "original", e.target.value)}
                            className={`w-full bg-transparent border-b border-transparent hover:border-black/10 focus:border-zinc-400 outline-none py-0.5 text-xs ${d?'text-zinc-200':'text-zinc-950'}`} />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="text" value={seg.translated || ""} onChange={(e) => updateSegment(idx, "translated", e.target.value)}
                            className={`w-full bg-transparent border-b border-transparent hover:border-black/10 focus:border-zinc-400 outline-none py-0.5 text-xs ${d?'text-zinc-300':'text-zinc-700/90'}`} />
                        </td>
                        <td className="px-3 py-2.5">
                          <select value={seg.speaker || ''} data-testid={`segment-speaker-${idx}`}
                            onChange={(e) => {
                              const newSpeaker = e.target.value;
                              const newActor = actors.find(a => a.id === newSpeaker);
                              const newGender = newActor?.gender || 'female';
                              const newVoice = newActor?.voice || (newGender === 'male' ? 'dara' : 'sophea');
                              const updated = [...segments];
                              updated[idx] = { ...updated[idx], speaker: newSpeaker, gender: newGender, voice: newVoice };
                              setSegments(updated);
                              axios.patch(`${API}/projects/${projectId}`, { segments: updated }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
                            }}
                            className={`px-2 py-0.5 rounded-sm text-[10px] font-semibold border cursor-pointer outline-none ${
                              seg.gender === 'male'
                                ? (d ? 'bg-blue-900/30 text-blue-300 border-blue-700/40' : 'bg-blue-50 text-blue-700 border-blue-200')
                                : (d ? 'bg-pink-900/30 text-pink-300 border-pink-700/40' : 'bg-pink-50 text-pink-700 border-pink-200')
                            }`}>
                            {actors.map(a => (
                              <option key={a.id} value={a.id}>{a.label || a.id}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          {hasCustom ? (
                            <span className="text-emerald-700 text-[10px] font-semibold flex items-center gap-0.5">
                              <CheckCircle className="w-3 h-3" weight="fill" /> Custom
                            </span>
                          ) : (
                            <span className="text-zinc-500 text-[10px]">{actor?.voice || seg.voice}</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <select value={seg.speed || '1.0'} data-testid={`segment-speed-${idx}`}
                            onChange={(e) => updateSegment(idx, "speed", e.target.value)}
                            className={`text-[9px] px-1 py-0.5 border rounded outline-none cursor-pointer ${
                              seg.speed && seg.speed !== '1.0'
                                ? (d ? 'bg-amber-900/30 border-amber-700/40 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-700')
                                : (d ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-zinc-50 border-zinc-200 text-zinc-500')
                            }`}>
                            <option value="0.5">0.5x</option>
                            <option value="0.7">0.7x</option>
                            <option value="0.8">0.8x</option>
                            <option value="0.9">0.9x</option>
                            <option value="1.0">1.0x</option>
                            <option value="1.1">1.1x</option>
                            <option value="1.2">1.2x</option>
                            <option value="1.5">1.5x</option>
                            <option value="2.0">2.0x</option>
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          {seg.custom_audio ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-emerald-700 text-[10px] font-semibold flex items-center gap-0.5">
                                <CheckCircle className="w-3 h-3" weight="fill" /> Uploaded
                              </span>
                              <button onClick={() => updateSegment(idx, "custom_audio", null)}
                                data-testid={`segment-remove-voice-${idx}`}
                                className="text-red-400/50 hover:text-red-600 text-[10px]">
                                Remove
                              </button>
                            </div>
                          ) : (() => {
                            const len = (seg.end || 0) - (seg.start || 0);
                            const script = seg.translated || seg.original || '';
                            const isRecording = recordingIdx === idx;
                            return (
                              <div className="flex flex-col gap-1 max-w-[240px]">
                                {script && (
                                  <p className="text-zinc-400 text-[9px] leading-snug italic truncate" title={script}>
                                    Say: "{script}"
                                  </p>
                                )}
                                {isRecording ? (
                                  <button onClick={stopRecording} data-testid={`segment-stop-record-${idx}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-500/15 border border-red-500/25 text-red-400 text-[10px] font-semibold rounded-md animate-pulse">
                                    <Stop className="w-3 h-3" weight="fill" /> Stop ({recordingTime.toFixed(1)}s)
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <label data-testid={`segment-upload-voice-${idx}`}
                                      className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 bg-cyan-500/8 border border-cyan-500/15 text-zinc-700 text-[10px] font-semibold hover:bg-zinc-950/5 transition-colors rounded-md">
                                      <input type="file" accept="audio/*" className="hidden"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0]; if (!file) return;
                                          const fd = new FormData(); fd.append('file', file); fd.append('segment_id', String(idx));
                                          try {
                                            const r = await axios.post(`${API}/projects/${projectId}/upload-segment-audio`, fd,
                                              { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } });
                                            const updated = [...segments]; updated[idx].custom_audio = r.data.audio_path; setSegments(updated);
                                            toast.success("Voice uploaded!");
                                          } catch { toast.error("Upload failed"); }
                                        }} />
                                      <Upload className="w-3 h-3" />
                                    </label>
                                    <button onClick={() => startRecording(idx, null)} data-testid={`segment-record-voice-${idx}`}
                                      className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/8 border border-red-500/15 text-red-400 text-[10px] font-semibold hover:bg-red-500/15 transition-colors rounded-md">
                                      <Record className="w-3 h-3" weight="fill" /> Rec
                                    </button>
                                    <span className="text-amber-700/70 text-[9px] whitespace-nowrap">~{len.toFixed(1)}s</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-1 py-2 text-center">
                          <button onClick={() => splitSegment(idx)} data-testid={`segment-split-${idx}`}
                            title="Split segment"
                            className="w-6 h-6 rounded-sm flex items-center justify-center text-zinc-300 hover:text-amber-700 hover:bg-zinc-50 transition-all">
                            <Scissors className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {audioUrl && (
        <div className={`border-t px-4 py-2 flex items-center gap-3 ${d?'bg-zinc-900 border-zinc-800':'bg-white border-black/10'}`}>
          <SpeakerHigh className={`w-4 h-4 flex-shrink-0 ${d?'text-zinc-300':'text-zinc-700'}`} />
          <audio ref={audioRef} src={audioUrl} controls className="flex-1 h-7 opacity-80" />
        </div>
      )}

      <VoicePickerModal
        open={voicePickerOpen}
        onClose={() => setVoicePickerOpen(false)}
        onSelect={handleVoiceSelect}
        actorGender={actors.find(a => a.id === voicePickerActorId)?.gender || "female"}
        actorName={voicePickerActorId}
        targetLanguage={targetLanguage}
        isDark={d}
        token={token}
      />
    </div>
  );
};

export default Editor;
