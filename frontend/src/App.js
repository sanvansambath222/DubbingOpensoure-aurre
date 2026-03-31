import { useRef, useEffect, useState, createContext, useContext, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  SignIn, 
  Upload, 
  Play, 
  Pause, 
  Download, 
  Translate, 
  Waveform,
  User,
  SignOut,
  Plus,
  Trash,
  Clock,
  CheckCircle,
  XCircle,
  Spinner,
  CaretRight,
  MicrophoneStage,
  VideoCamera,
  FileAudio,
  SpeakerHigh,
  FilmStrip,
  Table,
  PencilSimple
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
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    
    const savedToken = localStorage.getItem("session_token");
    if (!savedToken) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` }
      });
      setUser(response.data);
      setToken(savedToken);
    } catch (error) {
      localStorage.removeItem("session_token");
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = (userData, sessionToken) => {
    setUser(userData);
    setToken(sessionToken);
    localStorage.setItem("session_token", sessionToken);
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      console.error("Logout error", e);
    }
    localStorage.removeItem("session_token");
    setUser(null);
    setToken(null);
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
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.replace("#", ""));
      const sessionId = params.get("session_id");

      if (!sessionId) {
        navigate("/");
        return;
      }

      try {
        const response = await axios.post(`${API}/auth/session`, {}, {
          headers: { "X-Session-ID": sessionId }
        });
        
        login(response.data.user, response.data.session_token);
        toast.success("Welcome to Khmer Dubbing!");
        navigate("/dashboard");
      } catch (error) {
        toast.error("Authentication failed");
        navigate("/");
      }
    };

    processAuth();
  }, [navigate, login]);

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
      <Spinner className="w-12 h-12 text-[#00d4ff] animate-spin" weight="bold" />
    </div>
  );
};

// Landing Page
const LandingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  const handleGoogleLogin = () => {
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f1a] via-[#0d1520] to-[#0a0f1a]" />
      
      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0f1a]/80 backdrop-blur-xl border-b border-[#1e293b]">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MicrophoneStage className="w-8 h-8 text-[#00d4ff]" weight="duotone" />
              <span className="font-mono text-xl font-bold text-white">KHMER DUBBING</span>
            </div>
            <button
              data-testid="google-login-button"
              onClick={handleGoogleLogin}
              className="px-6 py-2.5 bg-[#00d4ff] text-[#0a0f1a] font-bold text-sm hover:bg-[#00b8e6] transition-colors"
            >
              Sign In
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 pt-20">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl text-center"
          >
            <h1 className="font-mono text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
              Chinese to Khmer<br />
              <span className="text-[#00d4ff]">AI Video Dubbing</span>
            </h1>
            <p className="text-lg text-[#94a3b8] max-w-2xl mx-auto mb-10">
              Professional subtitle editor with auto speaker detection, 
              real Khmer voice, and timeline-based dubbing.
            </p>
            <button
              onClick={handleGoogleLogin}
              className="px-10 py-4 bg-[#00d4ff] text-[#0a0f1a] font-bold text-lg hover:bg-[#00b8e6] transition-colors"
            >
              Get Started Free
            </button>
          </motion.div>
        </main>
      </div>
    </div>
  );
};

// Dashboard
const Dashboard = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await axios.get(`${API}/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(response.data);
    } catch (error) {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    try {
      const response = await axios.post(`${API}/projects`, 
        { title: `Project ${projects.length + 1}` },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      navigate(`/editor/${response.data.project_id}`);
    } catch (error) {
      toast.error("Failed to create project");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <header className="bg-[#0a0f1a]/80 backdrop-blur-xl border-b border-[#1e293b] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MicrophoneStage className="w-8 h-8 text-[#00d4ff]" weight="duotone" />
            <span className="font-mono text-xl font-bold text-white">KHMER DUBBING</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#94a3b8]">{user?.name}</span>
            <button onClick={logout} className="text-[#94a3b8] hover:text-white">
              <SignOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <button
            onClick={createProject}
            className="px-6 py-2.5 bg-[#00d4ff] text-[#0a0f1a] font-bold text-sm hover:bg-[#00b8e6] transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner className="w-10 h-10 text-[#00d4ff] animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div 
            onClick={createProject}
            className="border-2 border-dashed border-[#1e293b] p-20 text-center cursor-pointer hover:border-[#00d4ff]/50 transition-colors"
          >
            <VideoCamera className="w-16 h-16 text-[#1e293b] mx-auto mb-4" />
            <p className="text-[#94a3b8]">Create your first dubbing project</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.project_id}
                onClick={() => navigate(`/editor/${project.project_id}`)}
                className="bg-[#0d1520] border border-[#1e293b] p-6 cursor-pointer hover:border-[#00d4ff]/50 transition-colors"
              >
                <h3 className="text-white font-bold mb-2">{project.title}</h3>
                <p className="text-xs text-[#64748b] uppercase">{project.status}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

// Subtitle Editor Page
const Editor = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useProjectId();
  const [project, setProject] = useState(null);
  const [segments, setSegments] = useState([]);
  const [actors, setActors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);

  const femaleVoices = [
    { id: "sophea", name: "Sophea - សោភា" },
    { id: "chanthy", name: "Chanthy - ចន្ធី" },
    { id: "bopha", name: "Bopha - បុប្ផា" },
    { id: "srey", name: "Srey - ស្រី" }
  ];

  const maleVoices = [
    { id: "dara", name: "Dara - តារា" },
    { id: "virak", name: "Virak - វីរៈ" },
    { id: "sokha", name: "Sokha - សុខា" },
    { id: "pich", name: "Pich - ពេជ្រ" }
  ];

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const response = await axios.get(`${API}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(response.data);
      
      // Load segments if available
      if (response.data.segments) {
        setSegments(response.data.segments);
      }
      
      // Load actors if available
      if (response.data.actors) {
        setActors(response.data.actors);
      }
      
      // Load audio/video if available
      if (response.data.dubbed_audio_path) {
        loadFile(response.data.dubbed_audio_path, 'audio');
      }
      if (response.data.dubbed_video_path) {
        loadFile(response.data.dubbed_video_path, 'video');
      }
    } catch (error) {
      toast.error("Failed to load project");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const loadFile = async (path, type) => {
    try {
      const response = await axios.get(`${API}/files/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      if (type === 'audio') setAudioUrl(url);
      else if (type === 'video') setVideoUrl(url);
    } catch (error) {
      console.error(`Failed to load ${type}`, error);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/projects/${projectId}/upload`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setProject(response.data);
      toast.success("File uploaded!");
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setProcessing(false);
    }
  };

  const transcribeAndDetect = async () => {
    setProcessing(true);
    try {
      const response = await axios.post(`${API}/projects/${projectId}/transcribe-segments`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(response.data);
      setSegments(response.data.segments || []);
      setActors(response.data.actors || []);
      toast.success("Detected speakers and text!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Transcription failed");
    } finally {
      setProcessing(false);
    }
  };

  const updateActor = async (actorId, field, value) => {
    const updatedActors = actors.map(a => 
      a.id === actorId ? { ...a, [field]: value } : a
    );
    setActors(updatedActors);
    
    // Update segments that belong to this actor
    const actor = updatedActors.find(a => a.id === actorId);
    let updatedSegments = segments;
    if (actor) {
      if (field === 'voice') {
        updatedSegments = segments.map(s => 
          s.speaker === actorId ? { ...s, voice: value } : s
        );
      } else if (field === 'gender') {
        // When gender changes, also update voice and segment gender
        const newVoice = value === 'male' ? 'dara' : 'sophea';
        updatedSegments = segments.map(s => 
          s.speaker === actorId ? { ...s, gender: value, voice: newVoice } : s
        );
        // Also update actor voice
        updatedActors.forEach(a => {
          if (a.id === actorId) a.voice = newVoice;
        });
        setActors([...updatedActors]);
      }
      setSegments(updatedSegments);
    }
    
    // Save to backend
    try {
      await axios.patch(`${API}/projects/${projectId}`, 
        { actors: updatedActors, segments: updatedSegments },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error("Failed to save actor");
    }
  };

  const uploadActorVoice = async (actorId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('actor_id', actorId);
    
    try {
      const response = await axios.post(
        `${API}/projects/${projectId}/upload-actor-voice`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      
      // Update actor with voice path
      const updatedActors = actors.map(a => 
        a.id === actorId ? { ...a, custom_voice: response.data.voice_path } : a
      );
      setActors(updatedActors);
      
      // Update all segments for this actor
      const updatedSegments = segments.map(s => 
        s.speaker === actorId ? { ...s, custom_audio: response.data.voice_path } : s
      );
      setSegments(updatedSegments);
      
      toast.success("Voice uploaded for actor!");
    } catch (err) {
      toast.error("Upload failed");
    }
  };

  const translateSegments = async () => {
    setProcessing(true);
    try {
      const response = await axios.post(`${API}/projects/${projectId}/translate-segments`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(response.data);
      setSegments(response.data.segments || []);
      toast.success("Translation complete!");
    } catch (error) {
      toast.error("Translation failed");
    } finally {
      setProcessing(false);
    }
  };

  const updateSegment = async (index, field, value) => {
    const updatedSegments = [...segments];
    updatedSegments[index][field] = value;
    setSegments(updatedSegments);
    
    // Save to backend
    try {
      await axios.patch(`${API}/projects/${projectId}`, 
        { segments: updatedSegments },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error("Failed to save segment");
    }
  };

  const generateAudio = async () => {
    setProcessing(true);
    try {
      const response = await axios.post(`${API}/projects/${projectId}/generate-audio-segments`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 300000
      });
      setProject(response.data);
      if (response.data.dubbed_audio_path) {
        loadFile(response.data.dubbed_audio_path, 'audio');
      }
      toast.success("Audio generated with multiple voices!");
    } catch (error) {
      toast.error("Audio generation failed");
    } finally {
      setProcessing(false);
    }
  };

  const generateVideo = async () => {
    setProcessing(true);
    try {
      const response = await axios.post(`${API}/projects/${projectId}/generate-video`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(response.data);
      if (response.data.dubbed_video_path) {
        loadFile(response.data.dubbed_video_path, 'video');
      }
      toast.success("Dubbed video generated!");
    } catch (error) {
      toast.error("Video generation failed");
    } finally {
      setProcessing(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return `${mins}:${secs.padStart(6, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <Spinner className="w-12 h-12 text-[#00d4ff] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex flex-col">
      {/* Header */}
      <header className="bg-[#0d1520] border-b border-[#1e293b] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-[#94a3b8] hover:text-white">
            ← Back
          </button>
          <span className="text-white font-bold">{project?.title}</span>
        </div>
        <div className="flex items-center gap-3">
          {processing && <Spinner className="w-5 h-5 text-[#00d4ff] animate-spin" />}
          <span className="text-xs text-[#64748b] uppercase">{project?.status}</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar - Controls + Actors */}
        <div className="flex">
          {/* Left Panel - Controls */}
          <div className="w-80 min-w-[320px] bg-[#0d1520] border-r border-[#1e293b] p-4 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 52px)' }}>
          {/* Upload */}
          <div>
            <label className="text-xs text-[#64748b] uppercase mb-2 block">1. Upload Video</label>
            <input ref={fileInputRef} type="file" accept="video/*,audio/*" onChange={handleFileUpload} className="hidden" />
            {project?.original_filename ? (
              <div className="bg-[#1e293b] p-3 text-sm">
                <p className="text-white truncate">{project.original_filename}</p>
                <p className="text-[#64748b] text-xs">{project.file_type}</p>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={processing}
                className="w-full py-3 border border-dashed border-[#1e293b] text-[#94a3b8] hover:border-[#00d4ff] transition-colors"
              >
                Click to upload
              </button>
            )}
          </div>

          {/* Transcribe */}
          {project?.original_file_path && (
            <div>
              <label className="text-xs text-[#64748b] uppercase mb-2 block">2. Get Text Segments</label>
              <button
                onClick={transcribeAndDetect}
                disabled={processing}
                className="w-full py-3 bg-[#1e293b] text-white hover:bg-[#2d3748] transition-colors disabled:opacity-50"
              >
                {processing ? "Processing..." : "Extract Text & Timestamps"}
              </button>
            </div>
          )}

          {/* Translate */}
          {segments.length > 0 && (
            <div>
              <label className="text-xs text-[#64748b] uppercase mb-2 block">3. Translate to Khmer</label>
              <button
                onClick={translateSegments}
                disabled={processing}
                className="w-full py-3 bg-[#00d4ff] text-[#0a0f1a] font-bold hover:bg-[#00b8e6] transition-colors disabled:opacity-50"
              >
                {processing ? "Translating..." : "Translate All"}
              </button>
            </div>
          )}

          {/* Generate Audio */}
          {segments.some(s => s.translated || s.custom_audio) && (
            <div>
              <label className="text-xs text-[#64748b] uppercase mb-2 block">4. Generate Audio</label>
              <button
                onClick={generateAudio}
                disabled={processing}
                className="w-full py-3 bg-[#22c55e] text-white font-bold hover:bg-[#16a34a] transition-colors disabled:opacity-50"
              >
                {processing ? "Generating..." : "Combine All Audio"}
              </button>
              <p className="text-xs text-[#64748b] mt-1">Uses YOUR voice where uploaded, AI voice for others</p>
            </div>
          )}

          {/* Generate Video */}
          {audioUrl && project?.file_type === 'video' && (
            <div>
              <label className="text-xs text-[#64748b] uppercase mb-2 block">5. Generate Dubbed Video</label>
              <button
                onClick={generateVideo}
                disabled={processing}
                className="w-full py-3 bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] transition-colors disabled:opacity-50"
              >
                {processing ? "Generating..." : "Generate Video"}
              </button>
            </div>
          )}

          {/* Preview & Download */}
          {(audioUrl || videoUrl) && (
            <div className="mt-4 pt-4 border-t border-[#1e293b]">
              <label className="text-xs text-[#64748b] uppercase mb-3 block">Preview & Download</label>
              
              {/* Video Preview */}
              {videoUrl && (
                <div className="mb-4">
                  <video 
                    src={videoUrl} 
                    controls 
                    className="w-full bg-black rounded"
                    style={{ maxHeight: '200px' }}
                  />
                </div>
              )}
              
              {/* Download Buttons */}
              <div className="flex gap-2">
                {audioUrl && (
                  <a 
                    href={audioUrl} 
                    download={`${project?.title || 'dubbed'}_khmer.wav`} 
                    className="flex-1 py-3 bg-[#22c55e] text-white text-center font-bold hover:bg-[#16a34a] flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Audio
                  </a>
                )}
                {videoUrl && (
                  <a 
                    href={videoUrl} 
                    download={`${project?.title || 'dubbed'}_khmer.mp4`} 
                    className="flex-1 py-3 bg-[#00d4ff] text-[#0a0f1a] text-center font-bold hover:bg-[#00b8e6] flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Video
                  </a>
                )}
              </div>
            </div>
          )}
          </div>

          {/* Right - Actors Panel */}
          <div className="flex-1 bg-[#0a0f1a] border-b border-[#1e293b] overflow-y-auto" style={{ maxHeight: '280px' }}>
            {actors.length > 0 ? (
              <div className="p-4">
                <h3 className="text-xs text-[#64748b] uppercase mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" /> Detected Actors in Video
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {actors.map((actor) => (
                    <div
                      key={actor.id}
                      data-testid={`actor-card-${actor.id}`}
                      className="bg-[#0d1520] border border-[#1e293b] rounded-lg p-4 hover:border-[#00d4ff]/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                          actor.gender === 'male' 
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                            : 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                        }`}>
                          {actor.gender === 'male' ? 'B' : 'G'}
                        </div>
                        <div>
                          <p className="text-white font-bold text-sm">{actor.label || actor.id}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <select
                              data-testid={`actor-gender-${actor.id}`}
                              value={actor.gender || 'female'}
                              onChange={(e) => updateActor(actor.id, 'gender', e.target.value)}
                              className="bg-[#1e293b] text-xs px-2 py-0.5 border-none outline-none rounded text-[#94a3b8]"
                            >
                              <option value="female">Girl</option>
                              <option value="male">Boy</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* AI Voice Selection */}
                      <div className="mb-3">
                        <label className="text-[10px] text-[#64748b] uppercase block mb-1">AI Voice</label>
                        <select
                          data-testid={`actor-voice-${actor.id}`}
                          value={actor.voice || (actor.gender === 'male' ? 'dara' : 'sophea')}
                          onChange={(e) => updateActor(actor.id, 'voice', e.target.value)}
                          className="w-full bg-[#1e293b] text-white text-xs px-2 py-1.5 border-none outline-none rounded"
                          disabled={!!actor.custom_voice}
                        >
                          {actor.gender === 'male' ? (
                            maleVoices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)
                          ) : (
                            femaleVoices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)
                          )}
                        </select>
                      </div>

                      {/* Custom Voice Upload */}
                      <div>
                        <label className="text-[10px] text-[#64748b] uppercase block mb-1">Your Voice</label>
                        {actor.custom_voice ? (
                          <div className="flex items-center gap-2 bg-[#22c55e]/10 px-3 py-2 rounded border border-[#22c55e]/20">
                            <CheckCircle className="w-4 h-4 text-[#22c55e]" weight="fill" />
                            <span className="text-[#22c55e] text-xs font-bold flex-1">Voice Uploaded</span>
                            <button
                              data-testid={`actor-remove-voice-${actor.id}`}
                              onClick={() => {
                                const updated = actors.map(a =>
                                  a.id === actor.id ? { ...a, custom_voice: null } : a
                                );
                                setActors(updated);
                                // Remove custom_audio from all segments of this actor
                                const updatedSegs = segments.map(s =>
                                  s.speaker === actor.id ? { ...s, custom_audio: null } : s
                                );
                                setSegments(updatedSegs);
                                // Save to backend
                                axios.patch(`${API}/projects/${projectId}`,
                                  { actors: updated, segments: updatedSegs },
                                  { headers: { Authorization: `Bearer ${token}` } }
                                ).catch(() => {});
                              }}
                              className="text-[#ef4444] text-xs hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <label
                            data-testid={`actor-upload-voice-${actor.id}`}
                            className="cursor-pointer flex items-center justify-center gap-2 px-3 py-2 bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] text-xs font-bold hover:bg-[#00d4ff]/20 transition-colors rounded"
                          >
                            <input
                              type="file"
                              accept="audio/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadActorVoice(actor.id, file);
                              }}
                            />
                            <Upload className="w-3 h-3" /> Upload Voice
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : segments.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[#64748b] text-sm p-8">
                Upload a video and click "Extract Text" to auto-detect actors
              </div>
            ) : null}
          </div>
        </div>

        {/* Bottom - Subtitle Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#0d1520] sticky top-0 z-10">
              <tr className="text-[#64748b] text-xs uppercase">
                <th className="px-3 py-3 text-left w-12">#</th>
                <th className="px-3 py-3 text-left w-24">Start</th>
                <th className="px-3 py-3 text-left w-24">End</th>
                <th className="px-3 py-3 text-left">Original</th>
                <th className="px-3 py-3 text-left">Translated</th>
                <th className="px-3 py-3 text-left w-28">Speaker</th>
                <th className="px-3 py-3 text-left w-20">Gender</th>
                <th className="px-3 py-3 text-left w-36">Voice</th>
              </tr>
            </thead>
            <tbody>
              {segments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-20 text-[#64748b]">
                    Upload a video and click "Extract Text & Timestamps" to detect actors
                  </td>
                </tr>
              ) : (
                segments.map((seg, idx) => {
                  const actor = actors.find(a => a.id === seg.speaker);
                  const hasActorVoice = actor?.custom_voice;
                  return (
                    <tr key={idx} className="border-b border-[#1e293b] hover:bg-[#0d1520]/50">
                      <td className="px-3 py-3 text-[#64748b]">{idx + 1}</td>
                      <td className="px-3 py-3 text-[#94a3b8] font-mono text-xs">{formatTime(seg.start || 0)}</td>
                      <td className="px-3 py-3 text-[#94a3b8] font-mono text-xs">{formatTime(seg.end || 0)}</td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={seg.original || ""}
                          onChange={(e) => updateSegment(idx, "original", e.target.value)}
                          className="w-full bg-transparent text-white border-b border-transparent hover:border-[#1e293b] focus:border-[#00d4ff] outline-none py-1"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={seg.translated || ""}
                          onChange={(e) => updateSegment(idx, "translated", e.target.value)}
                          className="w-full bg-transparent text-[#00d4ff] border-b border-transparent hover:border-[#1e293b] focus:border-[#00d4ff] outline-none py-1"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${
                          seg.gender === 'male' 
                            ? 'bg-blue-500/10 text-blue-400' 
                            : 'bg-pink-500/10 text-pink-400'
                        }`}>
                          {actor?.label || seg.speaker || `Speaker ${idx}`}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs ${seg.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                          {seg.gender === 'male' ? 'Boy' : 'Girl'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {hasActorVoice ? (
                          <span className="text-[#22c55e] text-xs font-bold flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" weight="fill" /> Custom
                          </span>
                        ) : (
                          <span className="text-[#94a3b8] text-xs">
                            {actor?.voice || seg.voice || 'sophea'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audio Player */}
      {audioUrl && (
        <div className="bg-[#0d1520] border-t border-[#1e293b] px-6 py-3 flex items-center gap-4">
          <audio ref={audioRef} src={audioUrl} controls className="flex-1 h-8" />
        </div>
      )}
    </div>
  );
};

// Helper hook
const useProjectId = () => {
  const location = useLocation();
  const parts = location.pathname.split('/');
  return { projectId: parts[parts.length - 1] };
};

// Protected Route
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <Spinner className="w-12 h-12 text-[#00d4ff] animate-spin" />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

// App Router
function AppRouter() {
  const location = useLocation();
  
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  
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
