import { useRef, useEffect, useState, createContext, useContext, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Play, Download, User, SignOut, Plus, CheckCircle, Spinner,
  MicrophoneStage, VideoCamera, SpeakerHigh, CaretRight, Waveform,
  GenderMale, GenderFemale, Trash, ArrowLeft, Subtitles, FilmStrip
} from "@phosphor-icons/react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem("session_token"));

  const checkAuth = useCallback(async () => {
    if (window.location.hash?.includes('session_id=')) { setLoading(false); return; }
    const savedToken = localStorage.getItem("session_token");
    if (!savedToken) { setLoading(false); return; }
    try {
      const response = await axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } });
      setUser(response.data);
      setToken(savedToken);
    } catch {
      localStorage.removeItem("session_token");
      setToken(null);
      setUser(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = (userData, sessionToken) => {
    setUser(userData); setToken(sessionToken);
    localStorage.setItem("session_token", sessionToken);
  };

  const logout = async () => {
    try { await axios.post(`${API}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } }); } catch {}
    localStorage.removeItem("session_token"); setUser(null); setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => useContext(AuthContext);

// Auth Callback
const AuthCallback = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const hasProcessed = useRef(false);
  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const processAuth = async () => {
      const params = new URLSearchParams(window.location.hash.replace("#", ""));
      const sessionId = params.get("session_id");
      if (!sessionId) { navigate("/"); return; }
      try {
        const response = await axios.post(`${API}/auth/session`, {}, { headers: { "X-Session-ID": sessionId } });
        login(response.data.user, response.data.session_token);
        toast.success("Welcome to Khmer Dubbing!");
        navigate("/dashboard");
      } catch { toast.error("Authentication failed"); navigate("/"); }
    };
    processAuth();
  }, [navigate, login]);
  return <div className="min-h-screen bg-[#080c14] flex items-center justify-center"><Spinner className="w-12 h-12 text-cyan-400 animate-spin" weight="bold" /></div>;
};

// Landing Page
const LandingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (user) navigate("/dashboard"); }, [user, navigate]);

  const handleLogin = () => {
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(window.location.origin + '/dashboard')}`;
  };

  return (
    <div className="min-h-screen bg-[#080c14] relative overflow-hidden">
      {/* Animated bg grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#0ff 1px, transparent 1px), linear-gradient(90deg, #0ff 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      <header className="fixed top-0 left-0 right-0 z-50 bg-[#080c14]/90 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center">
              <MicrophoneStage className="w-5 h-5 text-cyan-400" weight="fill" />
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">KhmerDub</span>
          </div>
          <button data-testid="google-login-button" onClick={handleLogin}
            className="px-5 py-2 bg-white text-[#080c14] text-sm font-semibold rounded-full hover:bg-cyan-50 transition-all hover:shadow-lg hover:shadow-cyan-500/10">
            Sign In
          </button>
        </div>
      </header>

      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 pt-20">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-cyan-500/10 border border-cyan-500/15 rounded-full text-cyan-400 text-xs font-medium mb-8">
            <Waveform className="w-3.5 h-3.5" /> AI-Powered Video Dubbing
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
            Chinese to Khmer<br />
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Video Dubbing</span>
          </h1>
          <p className="text-base text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Auto-detect speakers, assign Boy/Girl voices, upload your own voice, and export dubbed videos with Khmer subtitles.
          </p>
          <button onClick={handleLogin}
            className="px-8 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-full hover:shadow-xl hover:shadow-cyan-500/20 transition-all text-sm">
            Get Started Free
          </button>
        </motion.div>

        {/* Feature cards */}
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mt-20 w-full">
          {[
            { icon: <VideoCamera className="w-5 h-5" weight="duotone" />, title: "Speaker Detection", desc: "Auto-detect Boy & Girl speakers in video" },
            { icon: <MicrophoneStage className="w-5 h-5" weight="duotone" />, title: "Custom Voice", desc: "Upload your own voice for each actor" },
            { icon: <Subtitles className="w-5 h-5" weight="duotone" />, title: "Burn Subtitles", desc: "Khmer subtitles burned into the video" },
          ].map((f, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 hover:bg-white/[0.05] transition-colors">
              <div className="w-9 h-9 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400 mb-3">{f.icon}</div>
              <h3 className="text-white font-semibold text-sm mb-1">{f.title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
};

// Dashboard
const Dashboard = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchProjects(); }, []);
  const fetchProjects = async () => {
    try { const r = await axios.get(`${API}/projects`, { headers: { Authorization: `Bearer ${token}` } }); setProjects(r.data); }
    catch { toast.error("Failed to load projects"); }
    finally { setLoading(false); }
  };

  const createProject = async () => {
    try {
      const r = await axios.post(`${API}/projects`, { title: `Project ${projects.length + 1}` }, { headers: { Authorization: `Bearer ${token}` } });
      navigate(`/editor/${r.data.project_id}`);
    } catch { toast.error("Failed to create project"); }
  };

  const deleteProject = async (e, pid) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/projects/${pid}`, { headers: { Authorization: `Bearer ${token}` } });
      setProjects(projects.filter(p => p.project_id !== pid));
      toast.success("Project deleted");
    } catch { toast.error("Delete failed"); }
  };

  const statusColor = (s) => {
    const map = { created: 'text-slate-500', uploaded: 'text-yellow-500', transcribed: 'text-orange-400', translated: 'text-blue-400', audio_ready: 'text-green-400', completed: 'text-cyan-400', error: 'text-red-400' };
    return map[s] || 'text-slate-500';
  };

  return (
    <div className="min-h-screen bg-[#080c14]">
      <header className="bg-[#080c14]/90 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center">
              <MicrophoneStage className="w-5 h-5 text-cyan-400" weight="fill" />
            </div>
            <span className="text-lg font-semibold text-white">KhmerDub</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{user?.name}</span>
            <button onClick={logout} className="text-slate-500 hover:text-white transition-colors"><SignOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Your Projects</h1>
          <button onClick={createProject} data-testid="new-project-btn"
            className="px-5 py-2.5 bg-cyan-500 text-white text-sm font-semibold rounded-full hover:bg-cyan-400 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" weight="bold" /> New Project
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner className="w-10 h-10 text-cyan-400 animate-spin" /></div>
        ) : projects.length === 0 ? (
          <div onClick={createProject} className="border border-dashed border-white/10 rounded-2xl p-20 text-center cursor-pointer hover:border-cyan-500/30 transition-colors group">
            <VideoCamera className="w-14 h-14 text-slate-700 mx-auto mb-4 group-hover:text-cyan-500/50 transition-colors" weight="duotone" />
            <p className="text-slate-500 text-sm">Create your first dubbing project</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <motion.div key={p.project_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => navigate(`/editor/${p.project_id}`)}
                className="group bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 cursor-pointer hover:border-cyan-500/20 hover:bg-white/[0.04] transition-all">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-white font-semibold text-sm">{p.title}</h3>
                  <button onClick={(e) => deleteProject(e, p.project_id)}
                    className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium capitalize ${statusColor(p.status)}`}>{p.status?.replace('_', ' ')}</span>
                  {p.file_type === 'video' && <FilmStrip className="w-3.5 h-3.5 text-slate-600" />}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

// Step Progress Component
const StepProgress = ({ currentStep, steps }) => (
  <div className="flex items-center gap-1" data-testid="step-progress">
    {steps.map((step, i) => {
      const isActive = i === currentStep;
      const isDone = i < currentStep;
      return (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
            isDone ? 'bg-cyan-500/15 text-cyan-400' : isActive ? 'bg-white/10 text-white' : 'text-slate-600'
          }`}>
            {isDone ? <CheckCircle className="w-3.5 h-3.5" weight="fill" /> : <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px]">{i + 1}</span>}
            <span className="hidden sm:inline">{step}</span>
          </div>
          {i < steps.length - 1 && <CaretRight className="w-3 h-3 text-slate-700" />}
        </div>
      );
    })}
  </div>
);

// Processing Overlay
const ProcessingOverlay = ({ message }) => (
  <AnimatePresence>
    {message && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-[#0d1220] border border-white/10 rounded-2xl p-8 text-center max-w-sm">
          <div className="relative w-16 h-16 mx-auto mb-5">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
            <div className="absolute inset-2 rounded-full bg-cyan-500/5 flex items-center justify-center">
              <Waveform className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
          <p className="text-white font-medium text-sm mb-1">Processing</p>
          <p className="text-slate-400 text-xs">{message}</p>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Editor
const Editor = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useProjectId();
  const [project, setProject] = useState(null);
  const [segments, setSegments] = useState([]);
  const [actors, setActors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingMsg, setProcessingMsg] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [burnSubs, setBurnSubs] = useState(false);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);

  const femaleVoices = [
    { id: "sophea", name: "Sophea" }, { id: "chanthy", name: "Chanthy" },
    { id: "bopha", name: "Bopha" }, { id: "srey", name: "Srey" }
  ];
  const maleVoices = [
    { id: "dara", name: "Dara" }, { id: "virak", name: "Virak" },
    { id: "sokha", name: "Sokha" }, { id: "pich", name: "Pich" }
  ];

  const getCurrentStep = () => {
    if (!project) return 0;
    if (videoUrl) return 5;
    if (audioUrl) return 4;
    if (segments.some(s => s.translated)) return 3;
    if (segments.length > 0) return 2;
    if (project.original_file_path) return 1;
    return 0;
  };

  useEffect(() => { fetchProject(); }, [projectId]);

  const fetchProject = async () => {
    try {
      const r = await axios.get(`${API}/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
      setProject(r.data);
      if (r.data.segments) setSegments(r.data.segments);
      if (r.data.actors) setActors(r.data.actors);
      if (r.data.dubbed_audio_path) loadFile(r.data.dubbed_audio_path, 'audio');
      if (r.data.dubbed_video_path) loadFile(r.data.dubbed_video_path, 'video');
    } catch { toast.error("Failed to load project"); navigate("/dashboard"); }
    finally { setLoading(false); }
  };

  const loadFile = async (path, type) => {
    try {
      const r = await axios.get(`${API}/files/${path}`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      if (type === 'audio') setAudioUrl(url); else setVideoUrl(url);
    } catch (e) { console.error(`Load ${type} failed`, e); }
  };

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
      const r = await axios.post(`${API}/projects/${projectId}/transcribe-segments`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setProject(r.data); setSegments(r.data.segments || []); setActors(r.data.actors || []);
      toast.success("Speakers detected!");
    } catch (e) { toast.error(e.response?.data?.detail || "Detection failed"); }
    finally { setProcessingMsg(null); }
  };

  const translate = async () => {
    setProcessingMsg("Translating to Khmer...");
    try {
      const r = await axios.post(`${API}/projects/${projectId}/translate-segments`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setProject(r.data); setSegments(r.data.segments || []);
      toast.success("Translation complete!");
    } catch { toast.error("Translation failed"); }
    finally { setProcessingMsg(null); }
  };

  const generateAudio = async () => {
    setProcessingMsg("Generating Khmer voices (this may take a minute)...");
    try {
      const r = await axios.post(`${API}/projects/${projectId}/generate-audio-segments`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 300000 });
      setProject(r.data);
      if (r.data.dubbed_audio_path) loadFile(r.data.dubbed_audio_path, 'audio');
      toast.success("Audio generated!");
    } catch { toast.error("Audio generation failed"); }
    finally { setProcessingMsg(null); }
  };

  const generateVideo = async () => {
    setProcessingMsg(burnSubs ? "Generating video with Khmer subtitles..." : "Generating dubbed video...");
    try {
      const r = await axios.post(`${API}/projects/${projectId}/generate-video?burn_subtitles=${burnSubs}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setProject(r.data);
      if (r.data.dubbed_video_path) loadFile(r.data.dubbed_video_path, 'video');
      toast.success("Video ready!");
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
    try { await axios.patch(`${API}/projects/${projectId}`, { actors: updated, segments: updatedSegs }, { headers: { Authorization: `Bearer ${token}` } }); } catch {}
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

  const updateSegment = async (idx, field, value) => {
    const updated = [...segments]; updated[idx][field] = value; setSegments(updated);
    try { await axios.patch(`${API}/projects/${projectId}`, { segments: updated }, { headers: { Authorization: `Bearer ${token}` } }); } catch {}
  };

  const fmt = (s) => { const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

  // Speaker colors
  const speakerColors = ['cyan', 'pink', 'amber', 'emerald', 'purple', 'rose'];
  const getSpeakerColor = (speakerId) => {
    const idx = actors.findIndex(a => a.id === speakerId);
    return speakerColors[idx >= 0 ? idx % speakerColors.length : 0];
  };

  if (loading) return <div className="min-h-screen bg-[#080c14] flex items-center justify-center"><Spinner className="w-12 h-12 text-cyan-400 animate-spin" /></div>;

  const step = getCurrentStep();

  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col" data-testid="editor-page">
      <ProcessingOverlay message={processingMsg} />

      {/* Header */}
      <header className="bg-[#0a0e18] border-b border-white/5 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="text-slate-500 hover:text-white transition-colors p-1" data-testid="back-btn">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-semibold text-sm">{project?.title}</span>
        </div>
        <StepProgress currentStep={step} steps={["Upload", "Detect", "Translate", "Audio", "Video"]} />
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-72 min-w-[288px] bg-[#0a0e18] border-r border-white/5 flex flex-col overflow-y-auto">
          <div className="p-4 space-y-3 flex-1">
            {/* Upload */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1.5 block">Upload</label>
              <input ref={fileInputRef} type="file" accept="video/*,audio/*" onChange={handleUpload} className="hidden" />
              {project?.original_filename ? (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                  <p className="text-white text-xs truncate font-medium">{project.original_filename}</p>
                  <p className="text-slate-600 text-[10px] mt-0.5 uppercase">{project.file_type}</p>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} disabled={!!processingMsg} data-testid="upload-btn"
                  className="w-full py-4 border border-dashed border-white/10 rounded-lg text-slate-500 text-xs hover:border-cyan-500/30 hover:text-cyan-400 transition-all">
                  <Upload className="w-5 h-5 mx-auto mb-1" /> Click to upload video
                </button>
              )}
            </div>

            {/* Action buttons */}
            {project?.original_file_path && (
              <button onClick={transcribe} disabled={!!processingMsg} data-testid="transcribe-btn"
                className="w-full py-2.5 bg-white/[0.05] border border-white/[0.08] text-white text-xs font-medium rounded-lg hover:bg-white/[0.08] transition-all disabled:opacity-40">
                Detect Speakers & Text
              </button>
            )}

            {segments.length > 0 && (
              <button onClick={translate} disabled={!!processingMsg} data-testid="translate-btn"
                className="w-full py-2.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold rounded-lg hover:bg-cyan-500/20 transition-all disabled:opacity-40">
                Translate to Khmer
              </button>
            )}

            {segments.some(s => s.translated || s.custom_audio) && (
              <button onClick={generateAudio} disabled={!!processingMsg} data-testid="generate-audio-btn"
                className="w-full py-2.5 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold rounded-lg hover:bg-green-500/20 transition-all disabled:opacity-40">
                <SpeakerHigh className="w-3.5 h-3.5 inline mr-1" /> Generate Khmer Audio
              </button>
            )}

            {audioUrl && project?.file_type === 'video' && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer" data-testid="burn-subs-toggle">
                  <input type="checkbox" checked={burnSubs} onChange={(e) => setBurnSubs(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500/30" />
                  <span className="text-[10px] text-slate-400">Burn Khmer subtitles into video</span>
                </label>
                <button onClick={generateVideo} disabled={!!processingMsg} data-testid="generate-video-btn"
                  className="w-full py-2.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold rounded-lg hover:bg-purple-500/20 transition-all disabled:opacity-40">
                  <FilmStrip className="w-3.5 h-3.5 inline mr-1" /> Generate Video
                </button>
              </div>
            )}
          </div>

          {/* Preview & Download */}
          {(audioUrl || videoUrl) && (
            <div className="border-t border-white/5 p-4 space-y-3">
              <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider block">Output</label>
              {videoUrl && (
                <video src={videoUrl} controls className="w-full rounded-lg bg-black" style={{ maxHeight: '180px' }} data-testid="video-preview" />
              )}
              <div className="flex gap-2">
                {audioUrl && (
                  <a href={audioUrl} download={`${project?.title || 'dubbed'}_khmer.wav`} data-testid="download-audio-btn"
                    className="flex-1 py-2 bg-green-500/10 border border-green-500/20 text-green-400 text-center text-[11px] font-semibold rounded-lg hover:bg-green-500/20 flex items-center justify-center gap-1">
                    <Download className="w-3 h-3" /> Audio
                  </a>
                )}
                {videoUrl && (
                  <a href={videoUrl} download={`${project?.title || 'dubbed'}_khmer.mp4`} data-testid="download-video-btn"
                    className="flex-1 py-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-center text-[11px] font-semibold rounded-lg hover:bg-cyan-500/20 flex items-center justify-center gap-1">
                    <Download className="w-3 h-3" /> Video
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Actors Panel */}
          {actors.length > 0 && (
            <div className="bg-[#0a0e18]/50 border-b border-white/5 p-4">
              {/* Auto-calculated speaking time summary */}
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                <h3 className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Actors
                </h3>
                {actors.map((actor) => {
                  const isMale = actor.gender === 'male';
                  const actorTotal = segments.filter(s => s.speaker === actor.id).reduce((sum, s) => sum + ((s.end || 0) - (s.start || 0)), 0);
                  const mins = Math.floor(actorTotal / 60);
                  const secs = Math.round(actorTotal % 60);
                  return (
                    <div key={`summary-${actor.id}`} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold ${
                      isMale ? 'bg-blue-500/10 text-blue-400 border border-blue-500/15' : 'bg-pink-500/10 text-pink-400 border border-pink-500/15'
                    }`}>
                      {isMale ? <GenderMale className="w-3 h-3" weight="bold" /> : <GenderFemale className="w-3 h-3" weight="bold" />}
                      {actor.label}:
                      <span className="text-white font-bold ml-0.5">
                        {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
                      </span>
                    </div>
                  );
                })}
                <div className="ml-auto text-[10px] text-slate-500">
                  Total: <span className="text-white font-semibold">
                    {(() => {
                      const t = segments.reduce((sum, s) => sum + ((s.end || 0) - (s.start || 0)), 0);
                      const m = Math.floor(t / 60); const s = Math.round(t % 60);
                      return m > 0 ? `${m}m ${s}s` : `${s}s`;
                    })()}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1">
                {actors.map((actor) => {
                  const isMale = actor.gender === 'male';
                  const actorSegs = segments.filter(s => s.speaker === actor.id);
                  const totalLen = actorSegs.reduce((sum, s) => sum + ((s.end || 0) - (s.start || 0)), 0);
                  const segCount = actorSegs.length;
                  return (
                    <div key={actor.id} data-testid={`actor-card-${actor.id}`}
                      className="min-w-[220px] bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5 hover:border-cyan-500/15 transition-all flex-shrink-0">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${
                          isMale ? 'bg-blue-500/10 border-blue-500/20' : 'bg-pink-500/10 border-pink-500/20'
                        }`}>
                          {isMale ? <GenderMale className="w-4 h-4 text-blue-400" weight="bold" /> : <GenderFemale className="w-4 h-4 text-pink-400" weight="bold" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-xs truncate">{actor.label || actor.id}</p>
                          <select data-testid={`actor-gender-${actor.id}`} value={actor.gender || 'female'}
                            onChange={(e) => updateActor(actor.id, 'gender', e.target.value)}
                            className={`bg-transparent text-[10px] font-semibold border-none outline-none cursor-pointer ${isMale ? 'text-blue-400' : 'text-pink-400'}`}>
                            <option value="female">Girl</option>
                            <option value="male">Boy</option>
                          </select>
                        </div>
                      </div>

                      {/* Speaking info */}
                      <div className="bg-amber-500/8 border border-amber-500/15 rounded-md px-2.5 py-1.5 mb-2 flex items-center justify-between">
                        <span className="text-amber-400 text-[10px] font-semibold">
                          {segCount} {segCount === 1 ? 'line' : 'lines'}
                        </span>
                        <span className="text-amber-300 text-[11px] font-bold">
                          {totalLen < 60 ? `${totalLen.toFixed(1)}s` : `${Math.floor(totalLen / 60)}m ${Math.round(totalLen % 60)}s`}
                        </span>
                      </div>

                      {/* Voice */}
                      <div className="space-y-2">
                        {!actor.custom_voice && (
                          <select data-testid={`actor-voice-${actor.id}`}
                            value={actor.voice || (isMale ? 'dara' : 'sophea')}
                            onChange={(e) => updateActor(actor.id, 'voice', e.target.value)}
                            className="w-full bg-white/[0.03] text-slate-300 text-[11px] px-2 py-1.5 border border-white/[0.06] rounded-md outline-none">
                            {(isMale ? maleVoices : femaleVoices).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        )}
                        {actor.custom_voice ? (
                          <div className="flex items-center gap-1.5 bg-green-500/8 border border-green-500/15 px-2.5 py-1.5 rounded-md">
                            <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" weight="fill" />
                            <span className="text-green-400 text-[10px] font-semibold flex-1">Your Voice</span>
                            <button data-testid={`actor-remove-voice-${actor.id}`} onClick={() => removeActorVoice(actor.id)}
                              className="text-red-400/60 hover:text-red-400 text-[10px]">Remove</button>
                          </div>
                        ) : (
                          <div>
                            <label data-testid={`actor-upload-voice-${actor.id}`}
                              className="cursor-pointer flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-cyan-500/8 border border-cyan-500/15 text-cyan-400 text-[10px] font-semibold hover:bg-cyan-500/15 transition-colors rounded-md">
                              <input type="file" accept="audio/*" className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadActorVoice(actor.id, f); }} />
                              <Upload className="w-3 h-3" /> Upload Voice
                            </label>
                            <p className="text-amber-400/60 text-[9px] mt-1 text-center">
                              Record {totalLen < 60 ? `~${totalLen.toFixed(0)}s` : `~${Math.floor(totalLen / 60)}m ${Math.round(totalLen % 60)}s`} total
                            </p>
                          </div>
                        )}

                        {/* Download Script TXT */}
                        {actorSegs.length > 0 && (
                          <button data-testid={`actor-download-script-${actor.id}`}
                            onClick={() => {
                              const lines = actorSegs.map((s, i) => {
                                const len = ((s.end || 0) - (s.start || 0)).toFixed(1);
                                const text = s.translated || s.original || '(no text)';
                                return `Line ${i + 1} [${len}s]:\n${text}\n`;
                              });
                              const header = `=== ${actor.label || actor.id} Script ===\nTotal: ${segCount} lines, ${totalLen < 60 ? totalLen.toFixed(1) + 's' : Math.floor(totalLen / 60) + 'm ' + Math.round(totalLen % 60) + 's'}\n\n`;
                              const blob = new Blob([header + lines.join('\n')], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a'); a.href = url; a.download = `${(actor.label || actor.id).replace(/\s/g, '_')}_script.txt`; a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="w-full flex items-center justify-center gap-1 px-2 py-1 text-[9px] text-slate-400 hover:text-white border border-white/[0.04] hover:border-white/10 rounded-md transition-colors mt-1">
                            <Download className="w-2.5 h-2.5" /> Download Script (.txt)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subtitle Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs" data-testid="subtitle-table">
              <thead className="bg-[#0a0e18] sticky top-0 z-10">
                <tr className="text-slate-600 text-[10px] uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left w-10">#</th>
                  <th className="px-3 py-2.5 text-left w-16">Start</th>
                  <th className="px-3 py-2.5 text-left w-16">End</th>
                  <th className="px-3 py-2.5 text-left w-16">Length</th>
                  <th className="px-3 py-2.5 text-left">Chinese (Original)</th>
                  <th className="px-3 py-2.5 text-left">Khmer (Translated)</th>
                  <th className="px-3 py-2.5 text-left w-28">Speaker</th>
                  <th className="px-3 py-2.5 text-left w-20">Voice</th>
                  <th className="px-3 py-2.5 text-left w-36">Add Voice</th>
                </tr>
              </thead>
              <tbody>
                {segments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-24 text-slate-600">
                      <VideoCamera className="w-10 h-10 mx-auto mb-3 text-slate-700" weight="duotone" />
                      <p className="text-sm">Upload a video and detect speakers to get started</p>
                    </td>
                  </tr>
                ) : (
                  segments.map((seg, idx) => {
                    const actor = actors.find(a => a.id === seg.speaker);
                    const hasCustom = actor?.custom_voice || seg.custom_audio;
                    const color = getSpeakerColor(seg.speaker);
                    return (
                      <tr key={idx} className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors`}
                        data-testid={`segment-row-${idx}`}>
                        <td className="px-3 py-2.5 text-slate-600 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono">{fmt(seg.start || 0)}</td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono">{fmt(seg.end || 0)}</td>
                        <td className="px-3 py-2.5">
                          <span className="text-amber-400 font-mono font-semibold text-[11px]">
                            {((seg.end || 0) - (seg.start || 0)).toFixed(1)}s
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="text" value={seg.original || ""} onChange={(e) => updateSegment(idx, "original", e.target.value)}
                            className="w-full bg-transparent text-white/80 border-b border-transparent hover:border-white/10 focus:border-cyan-500/50 outline-none py-0.5 text-xs" />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="text" value={seg.translated || ""} onChange={(e) => updateSegment(idx, "translated", e.target.value)}
                            className="w-full bg-transparent text-cyan-300/90 border-b border-transparent hover:border-white/10 focus:border-cyan-500/50 outline-none py-0.5 text-xs" />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            seg.gender === 'male'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/15'
                              : 'bg-pink-500/10 text-pink-400 border border-pink-500/15'
                          }`}>
                            {seg.gender === 'male' ? <GenderMale className="w-2.5 h-2.5" weight="bold" /> : <GenderFemale className="w-2.5 h-2.5" weight="bold" />}
                            {actor?.label || seg.speaker}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {hasCustom ? (
                            <span className="text-green-400 text-[10px] font-semibold flex items-center gap-0.5">
                              <CheckCircle className="w-3 h-3" weight="fill" /> Custom
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[10px]">{actor?.voice || seg.voice}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {seg.custom_audio ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-green-400 text-[10px] font-semibold flex items-center gap-0.5">
                                <CheckCircle className="w-3 h-3" weight="fill" /> Uploaded
                              </span>
                              <button onClick={() => updateSegment(idx, "custom_audio", null)}
                                data-testid={`segment-remove-voice-${idx}`}
                                className="text-red-400/50 hover:text-red-400 text-[10px]">
                                Remove
                              </button>
                            </div>
                          ) : (() => {
                            const len = (seg.end || 0) - (seg.start || 0);
                            const script = seg.translated || seg.original || '';
                            return (
                              <div className="flex flex-col gap-1 max-w-[220px]">
                                {script && (
                                  <p className="text-white/50 text-[9px] leading-snug italic truncate" title={script}>
                                    Say: "{script}"
                                  </p>
                                )}
                                <div className="flex items-center gap-2">
                                  <label data-testid={`segment-upload-voice-${idx}`}
                                    className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 bg-cyan-500/8 border border-cyan-500/15 text-cyan-400 text-[10px] font-semibold hover:bg-cyan-500/15 transition-colors rounded-md">
                                    <input type="file" accept="audio/*" className="hidden"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0]; if (!file) return;
                                        const fd = new FormData(); fd.append('file', file); fd.append('segment_id', String(idx));
                                        try {
                                          const r = await axios.post(`${API}/projects/${projectId}/upload-segment-audio`, fd,
                                            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } });
                                          const updated = [...segments]; updated[idx].custom_audio = r.data.audio_path; setSegments(updated);
                                          toast.success("Voice uploaded for this segment!");
                                        } catch { toast.error("Upload failed"); }
                                      }} />
                                    <Upload className="w-3 h-3" /> Add Voice
                                  </label>
                                  <span className="text-amber-400/70 text-[9px] whitespace-nowrap">~{len.toFixed(1)}s</span>
                                </div>
                              </div>
                            );
                          })()}
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

      {/* Bottom Audio Player */}
      {audioUrl && (
        <div className="bg-[#0a0e18] border-t border-white/5 px-4 py-2 flex items-center gap-3">
          <SpeakerHigh className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <audio ref={audioRef} src={audioUrl} controls className="flex-1 h-7 opacity-80" />
        </div>
      )}
    </div>
  );
};

// Helpers
const useProjectId = () => {
  const location = useLocation();
  const parts = location.pathname.split('/');
  return { projectId: parts[parts.length - 1] };
};

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-[#080c14] flex items-center justify-center"><Spinner className="w-12 h-12 text-cyan-400 animate-spin" /></div>;
  if (!user) return <Navigate to="/" replace />;
  return children;
};

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes('session_id=')) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/editor/:projectId" element={<ProtectedRoute><Editor /></ProtectedRoute>} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="bottom-right" theme="dark" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
