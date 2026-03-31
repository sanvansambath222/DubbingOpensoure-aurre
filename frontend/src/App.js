import { useRef, useEffect, useState, createContext, useContext, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Progress } from "./components/ui/progress";
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
  FilmStrip
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

// Auth Callback Component
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
        navigate("/dashboard", { state: { user: response.data.user } });
      } catch (error) {
        toast.error("Authentication failed");
        navigate("/");
      }
    };

    processAuth();
  }, [navigate, login]);

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
      <Spinner className="w-12 h-12 text-[#0055FF] animate-spin" weight="bold" />
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
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] relative overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ 
          backgroundImage: `url(https://images.pexels.com/photos/33923597/pexels-photo-33923597.jpeg)`,
        }}
      >
        <div className="absolute inset-0 bg-[#0A0A0B]/90" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0A0A0B]/70 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MicrophoneStage className="w-8 h-8 text-[#0055FF]" weight="duotone" />
              <span className="font-outfit text-xl font-medium text-white tracking-tight">Khmer Dubbing</span>
            </div>
            <button
              data-testid="google-login-button"
              onClick={handleGoogleLogin}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0055FF] text-white text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,85,255,0.4)]"
            >
              <SignIn className="w-4 h-4" weight="bold" />
              Sign In
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl text-left"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] mb-6">
              AI-Powered Video Dubbing
            </p>
            <h1 className="font-outfit text-4xl sm:text-5xl lg:text-6xl font-light tracking-tighter text-white mb-6">
              Chinese to Khmer<br />
              <span className="text-[#0055FF]">Voice Dubbing</span>
            </h1>
            <p className="text-base leading-relaxed text-[#A1A1AA] max-w-xl mb-10">
              Transform your Chinese videos into Khmer. Upload video, auto-transcribe with Whisper,
              translate with GPT-5.2, generate HD audio, and export dubbed video.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={handleGoogleLogin}
                className="inline-flex items-center gap-3 px-8 py-4 bg-[#0055FF] text-white text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,85,255,0.4)]"
              >
                Get Started
                <CaretRight className="w-4 h-4" weight="bold" />
              </button>
              <div className="text-sm text-[#71717A]">
                Free to start • No credit card required
              </div>
            </div>

            <div className="mt-20 grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { icon: VideoCamera, title: "Upload Video", desc: "MP4, MOV, etc." },
                { icon: SpeakerHigh, title: "Auto Transcribe", desc: "Whisper AI" },
                { icon: Translate, title: "AI Translation", desc: "GPT-5.2" },
                { icon: FilmStrip, title: "Export Video", desc: "Dubbed output" }
              ].map((feature, i) => (
                <div key={i} className="p-5 border border-[#27272A] bg-[#141415]/50 backdrop-blur">
                  <feature.icon className="w-7 h-7 text-[#0055FF] mb-3" weight="duotone" />
                  <h3 className="font-outfit text-base font-medium text-white mb-1">{feature.title}</h3>
                  <p className="text-xs text-[#71717A]">{feature.desc}</p>
                </div>
              ))}
            </div>
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
  const [creating, setCreating] = useState(false);

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
    setCreating(true);
    try {
      const response = await axios.post(`${API}/projects`, 
        { title: `Project ${projects.length + 1}` },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      navigate(`/editor/${response.data.project_id}`);
    } catch (error) {
      toast.error("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (projectId, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this project?")) return;
    
    try {
      await axios.delete(`${API}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(projects.filter(p => p.project_id !== projectId));
      toast.success("Project deleted");
    } catch (error) {
      toast.error("Failed to delete project");
    }
  };

  const getStatusIcon = (status) => {
    const completedStates = ['completed', 'audio_ready'];
    const errorStates = ['error'];
    const processingStates = ['transcribing', 'translating', 'generating_audio', 'generating_video'];
    
    if (completedStates.includes(status)) return <CheckCircle className="w-5 h-5 text-[#34D399]" weight="fill" />;
    if (errorStates.includes(status)) return <XCircle className="w-5 h-5 text-[#F87171]" weight="fill" />;
    if (processingStates.includes(status)) return <Spinner className="w-5 h-5 text-[#FBBF24] animate-spin" weight="bold" />;
    return <Clock className="w-5 h-5 text-[#A1A1AA]" weight="duotone" />;
  };

  const getFileTypeIcon = (fileType) => {
    if (fileType === 'video') return <VideoCamera className="w-4 h-4 text-[#0055FF]" weight="duotone" />;
    if (fileType === 'audio') return <FileAudio className="w-4 h-4 text-[#0055FF]" weight="duotone" />;
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0A0A0B]/70 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MicrophoneStage className="w-8 h-8 text-[#0055FF]" weight="duotone" />
            <span className="font-outfit text-xl font-medium text-white tracking-tight">Khmer Dubbing</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {user?.picture ? (
                <img src={user.picture} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <User className="w-8 h-8 text-[#A1A1AA]" weight="duotone" />
              )}
              <span className="text-sm text-[#A1A1AA] hidden sm:block">{user?.name}</span>
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-[#A1A1AA] hover:text-white transition-colors"
            >
              <SignOut className="w-4 h-4" weight="bold" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-outfit text-2xl sm:text-3xl font-medium tracking-tight text-white">
                Your Projects
              </h1>
              <p className="text-sm text-[#71717A] mt-1">Create and manage your dubbing projects</p>
            </div>
            <button
              data-testid="create-project-btn"
              onClick={createProject}
              disabled={creating}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#0055FF] text-white text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,85,255,0.4)] disabled:opacity-50"
            >
              {creating ? <Spinner className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" weight="bold" />}
              New Project
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Spinner className="w-10 h-10 text-[#0055FF] animate-spin" weight="bold" />
            </div>
          ) : projects.length === 0 ? (
            <div 
              data-testid="upload-dropzone"
              onClick={createProject}
              className="relative flex flex-col items-center justify-center p-16 md:p-24 border-2 border-dashed border-[#27272A] bg-[#0A0A0B] transition-all duration-300 hover:border-[#0055FF]/50 hover:bg-[#0055FF]/5 cursor-pointer"
            >
              <VideoCamera className="w-16 h-16 text-[#27272A] mb-6" weight="duotone" />
              <h3 className="font-outfit text-xl font-medium text-white mb-2">Create your first project</h3>
              <p className="text-sm text-[#71717A]">Upload video or audio to start dubbing</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <motion.div
                  key={project.project_id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => navigate(`/editor/${project.project_id}`)}
                  className="group relative flex flex-col p-6 bg-[#141415] border border-[#27272A] transition-all duration-300 hover:border-[#3F3F46] hover:-translate-y-1 hover:shadow-2xl cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(project.status)}
                      {getFileTypeIcon(project.file_type)}
                    </div>
                    <button
                      onClick={(e) => deleteProject(project.project_id, e)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-[#71717A] hover:text-[#F87171] transition-all"
                    >
                      <Trash className="w-4 h-4" weight="bold" />
                    </button>
                  </div>
                  <h3 className="font-outfit text-lg font-medium text-white mb-2">{project.title}</h3>
                  <p className="text-xs text-[#71717A] uppercase tracking-wider mb-4">
                    {project.status.replace(/_/g, " ")}
                  </p>
                  {project.original_filename && (
                    <p className="text-sm text-[#A1A1AA] truncate mb-2">
                      {project.original_filename}
                    </p>
                  )}
                  {project.original_text && (
                    <p className="text-sm text-[#52525B] line-clamp-2 mb-4">
                      {project.original_text.substring(0, 80)}...
                    </p>
                  )}
                  <div className="mt-auto pt-4 border-t border-[#27272A]">
                    <p className="text-xs text-[#52525B]">
                      {new Date(project.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

// Editor Page
const Editor = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useProjectId();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [originalText, setOriginalText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const response = await axios.get(`${API}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(response.data);
      setOriginalText(response.data.original_text || "");
      
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
    
    setUploading(true);
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
      toast.success("File uploaded successfully!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const transcribe = async () => {
    setTranscribing(true);
    try {
      const response = await axios.post(`${API}/projects/${projectId}/transcribe`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(response.data);
      setOriginalText(response.data.original_text || "");
      toast.success("Transcription complete!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  };

  const saveText = async () => {
    try {
      await axios.patch(`${API}/projects/${projectId}`, 
        { original_text: originalText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Text saved");
    } catch (error) {
      toast.error("Failed to save");
    }
  };

  const translate = async () => {
    if (!originalText.trim()) {
      toast.error("Please enter or transcribe Chinese text first");
      return;
    }
    
    setTranslating(true);
    try {
      await axios.patch(`${API}/projects/${projectId}`, 
        { original_text: originalText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const response = await axios.post(`${API}/projects/${projectId}/translate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(response.data);
      toast.success("Translation complete!");
    } catch (error) {
      toast.error("Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  const generateAudio = async () => {
    if (!project?.translated_text) {
      toast.error("Please translate text first");
      return;
    }
    
    setGeneratingAudio(true);
    try {
      const response = await axios.post(`${API}/projects/${projectId}/generate-audio`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(response.data);
      
      if (response.data.dubbed_audio_path) {
        loadFile(response.data.dubbed_audio_path, 'audio');
      }
      toast.success("Audio generated!");
    } catch (error) {
      toast.error("Audio generation failed");
    } finally {
      setGeneratingAudio(false);
    }
  };

  const generateVideo = async () => {
    if (!project?.dubbed_audio_path) {
      toast.error("Please generate audio first");
      return;
    }
    if (project?.file_type !== 'video') {
      toast.error("Original file must be a video");
      return;
    }
    
    setGeneratingVideo(true);
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
      setGeneratingVideo(false);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const downloadFile = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const getProgressSteps = () => {
    const steps = [
      { key: 'upload', label: 'Upload', done: !!project?.original_file_path },
      { key: 'transcribe', label: 'Transcribe', done: !!project?.original_text && project?.file_type !== 'text' },
      { key: 'translate', label: 'Translate', done: !!project?.translated_text },
      { key: 'audio', label: 'Audio', done: !!project?.dubbed_audio_path },
      { key: 'video', label: 'Video', done: !!project?.dubbed_video_path, skip: project?.file_type !== 'video' }
    ];
    return steps.filter(s => !s.skip);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <Spinner className="w-12 h-12 text-[#0055FF] animate-spin" weight="bold" />
      </div>
    );
  }

  const progressSteps = getProgressSteps();
  const completedSteps = progressSteps.filter(s => s.done).length;
  const progressPercent = (completedSteps / progressSteps.length) * 100;

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0A0A0B]/70 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate("/dashboard")}
              className="text-[#A1A1AA] hover:text-white transition-colors"
            >
              ← Back
            </button>
            <div className="h-6 w-px bg-[#27272A]" />
            <h1 className="font-outfit text-lg font-medium text-white">{project?.title}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#71717A]">
              {progressSteps.map((step, i) => (
                <span key={step.key} className={`flex items-center gap-1 ${step.done ? 'text-[#34D399]' : ''}`}>
                  {step.done ? '✓' : (i + 1)} {step.label}
                  {i < progressSteps.length - 1 && <span className="mx-1">→</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="h-1 bg-[#27272A]">
          <div 
            className="h-full bg-[#0055FF] transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      <main className="pt-24 min-h-screen">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[calc(100vh-96px)]">
          {/* Left Panel - Upload & Script */}
          <div data-testid="script-panel" className="lg:col-span-5 p-6 border-r border-[#27272A] flex flex-col overflow-y-auto">
            {/* Upload Section */}
            <div className="mb-6">
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] mb-3 block">
                1. Upload Video/Audio
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              {project?.original_file_path ? (
                <div className="p-4 bg-[#141415] border border-[#27272A] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {project.file_type === 'video' ? (
                      <VideoCamera className="w-6 h-6 text-[#0055FF]" weight="duotone" />
                    ) : (
                      <FileAudio className="w-6 h-6 text-[#0055FF]" weight="duotone" />
                    )}
                    <div>
                      <p className="text-sm text-white truncate max-w-[200px]">{project.original_filename}</p>
                      <p className="text-xs text-[#71717A] uppercase">{project.file_type}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-[#0055FF] hover:underline"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <div
                  data-testid="upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center p-12 border-2 border-dashed border-[#27272A] bg-[#0A0A0B] transition-all duration-300 hover:border-[#0055FF]/50 hover:bg-[#0055FF]/5 cursor-pointer ${uploading ? 'tracing-beam-border' : ''}`}
                >
                  {uploading ? (
                    <Spinner className="w-10 h-10 text-[#0055FF] animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-[#27272A] mb-3" weight="duotone" />
                      <p className="text-sm text-[#A1A1AA]">Click to upload video or audio</p>
                      <p className="text-xs text-[#52525B] mt-1">MP4, MOV, MP3, WAV</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Transcribe Section */}
            {project?.original_file_path && (
              <div className="mb-6">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] mb-3 block">
                  2. Transcribe Chinese Audio
                </label>
                <button
                  onClick={transcribe}
                  disabled={transcribing || !project?.original_file_path}
                  className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-white text-sm font-medium transition-all duration-300 ${
                    transcribing ? 'bg-[#27272A]' : 'bg-[#141415] border border-[#27272A] hover:bg-[#1F1F22]'
                  } disabled:opacity-50`}
                >
                  {transcribing ? (
                    <>
                      <Spinner className="w-4 h-4 animate-spin" />
                      Transcribing with Whisper...
                    </>
                  ) : (
                    <>
                      <SpeakerHigh className="w-4 h-4" weight="bold" />
                      Auto-Transcribe (Whisper)
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Script Section */}
            <div className="mb-6 flex-1">
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] mb-3 block">
                3. Chinese Script (中文)
              </label>
              <textarea
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                onBlur={saveText}
                placeholder="输入中文文本或使用自动转录..."
                className="w-full h-40 bg-[#141415] border border-[#27272A] text-white px-4 py-3 text-sm focus:outline-none focus:border-[#0055FF] focus:ring-1 focus:ring-[#0055FF] transition-all placeholder:text-[#71717A] resize-none font-mono"
              />
            </div>

            {/* Translate Button */}
            <button
              onClick={translate}
              disabled={translating || !originalText.trim()}
              className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-white text-sm font-medium transition-all duration-300 ${
                translating ? 'bg-[#27272A]' : 'bg-[#0055FF] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,85,255,0.4)]'
              } disabled:opacity-50`}
            >
              {translating ? (
                <>
                  <Spinner className="w-4 h-4 animate-spin" />
                  Translating...
                </>
              ) : (
                <>
                  <Translate className="w-4 h-4" weight="bold" />
                  4. Translate to Khmer
                </>
              )}
            </button>

            {/* Khmer Translation */}
            {project?.translated_text && (
              <div className="mt-6">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] mb-3 block">
                  Khmer Translation (ភាសាខ្មែរ)
                </label>
                <div className="w-full min-h-32 max-h-48 overflow-y-auto bg-[#0A0A0B] border border-[#27272A] text-white px-4 py-3 text-sm">
                  {project.translated_text}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Output */}
          <div data-testid="video-player" className="lg:col-span-7 p-6 flex flex-col">
            <label className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] mb-3 block">
              5. Generate Output
            </label>
            
            {/* Output Preview */}
            <div className={`flex-1 flex flex-col items-center justify-center p-8 border border-[#27272A] bg-[#141415] min-h-[300px] ${(generatingAudio || generatingVideo) ? 'processing-glow' : ''}`}>
              {videoUrl ? (
                <div className="w-full">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="w-full max-h-[400px] bg-black"
                  />
                  <div className="mt-4 flex gap-3">
                    <button
                      data-testid="download-dubbed-button"
                      onClick={() => downloadFile(videoUrl, `${project?.title || 'dubbed'}_khmer.mp4`)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#0055FF] text-white text-sm font-medium"
                    >
                      <Download className="w-4 h-4" weight="bold" />
                      Download Video
                    </button>
                    {audioUrl && (
                      <button
                        onClick={() => downloadFile(audioUrl, `${project?.title || 'dubbed'}_khmer.mp3`)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-transparent text-white text-sm font-medium border border-[#27272A]"
                      >
                        <Download className="w-4 h-4" weight="bold" />
                        Audio Only
                      </button>
                    )}
                  </div>
                </div>
              ) : audioUrl ? (
                <div className="w-full max-w-md text-center">
                  <Waveform className="w-20 h-20 text-[#0055FF] mx-auto mb-6" weight="duotone" />
                  <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />
                  
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <button
                      onClick={togglePlay}
                      className="w-14 h-14 flex items-center justify-center bg-[#0055FF] text-white rounded-full transition-all hover:scale-105"
                    >
                      {isPlaying ? (
                        <Pause className="w-6 h-6" weight="fill" />
                      ) : (
                        <Play className="w-6 h-6" weight="fill" />
                      )}
                    </button>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      data-testid="download-dubbed-button"
                      onClick={() => downloadFile(audioUrl, `${project?.title || 'dubbed'}_khmer.mp3`)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-transparent text-white text-sm font-medium border border-[#27272A] hover:bg-[#27272A]"
                    >
                      <Download className="w-4 h-4" weight="bold" />
                      Download Audio
                    </button>
                    {project?.file_type === 'video' && (
                      <button
                        onClick={generateVideo}
                        disabled={generatingVideo}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#0055FF] text-white text-sm font-medium"
                      >
                        {generatingVideo ? <Spinner className="w-4 h-4 animate-spin" /> : <FilmStrip className="w-4 h-4" />}
                        Generate Video
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <Waveform className="w-20 h-20 text-[#27272A] mx-auto mb-6" weight="duotone" />
                  <p className="text-[#71717A] mb-6">
                    {generatingAudio ? "Generating Khmer audio..." : 
                     generatingVideo ? "Merging audio with video..." :
                     "Generate audio from translated text"}
                  </p>
                  
                  <button
                    onClick={generateAudio}
                    disabled={generatingAudio || !project?.translated_text}
                    className={`inline-flex items-center gap-2 px-6 py-3 text-white text-sm font-medium transition-all duration-300 ${
                      generatingAudio ? 'bg-[#27272A]' : 'bg-[#0055FF] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,85,255,0.4)]'
                    } disabled:opacity-50`}
                  >
                    {generatingAudio ? (
                      <>
                        <Spinner className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Waveform className="w-4 h-4" weight="bold" />
                        Generate Khmer Audio
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Voice Selection */}
            <div className="mt-6">
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717A] mb-3 block">
                Khmer Voice (សំឡេងខ្មែរ)
              </label>
              <select
                value={project?.voice || "sophea"}
                onChange={async (e) => {
                  try {
                    const response = await axios.patch(`${API}/projects/${projectId}`, 
                      { voice: e.target.value },
                      { headers: { Authorization: `Bearer ${token}` } }
                    );
                    setProject(response.data);
                  } catch (error) {
                    toast.error("Failed to update voice");
                  }
                }}
                className="w-full bg-[#141415] border border-[#27272A] text-white px-4 py-3 text-sm focus:outline-none focus:border-[#0055FF] transition-all"
              >
                <optgroup label="សំឡេងស្រី (Female)">
                  <option value="sophea">Sophea - សោភា (ស្រី)</option>
                  <option value="chanthy">Chanthy - ចន្ធី (ស្រី)</option>
                  <option value="bopha">Bopha - បុប្ផា (ស្រី)</option>
                  <option value="srey">Srey - ស្រី (ស្រី)</option>
                </optgroup>
                <optgroup label="សំឡេងប្រុស (Male)">
                  <option value="dara">Dara - តារា (ប្រុស)</option>
                  <option value="virak">Virak - វីរៈ (ប្រុស)</option>
                  <option value="sokha">Sokha - សុខា (ប្រុស)</option>
                  <option value="pich">Pich - ពេជ្រ (ប្រុស)</option>
                </optgroup>
              </select>
              <p className="text-xs text-[#34D399] mt-2">✓ Real Khmer pronunciation powered by CAMB.AI</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// Helper hook
const useProjectId = () => {
  const location = useLocation();
  const parts = location.pathname.split('/');
  const projectId = parts[parts.length - 1];
  return { projectId };
};

// Protected Route
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <Spinner className="w-12 h-12 text-[#0055FF] animate-spin" weight="bold" />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
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
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/editor/:projectId" element={
        <ProtectedRoute>
          <Editor />
        </ProtectedRoute>
      } />
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
