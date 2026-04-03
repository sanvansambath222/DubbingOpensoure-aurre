import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Spinner, VideoCamera, FilmStrip, Trash,
  CopySimple, PencilSimple, SignOut, MicrophoneStage, Calendar, Clock, Wrench
} from "@phosphor-icons/react";
import { useAuth, ThemeToggle } from "./AuthContext";
import { API } from "./constants";

// Step progress dots
const StepDots = ({ status, isDark }) => {
  const d = isDark;
  const steps = ['created', 'uploaded', 'transcribed', 'translated', 'audio_ready', 'video_ready'];
  const current = steps.indexOf(status);
  return (
    <div className="flex gap-0.5">
      {steps.map((s, i) => (
        <div key={s} className={`w-1.5 h-1.5 rounded-full ${i <= current ? 'bg-emerald-500' : (d?'bg-zinc-700':'bg-zinc-200')}`} />
      ))}
    </div>
  );
};

const Dashboard = () => {
  const { user, token, logout, isDark } = useAuth();
  const d = isDark;
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try { const r = await axios.get(`${API}/projects`, { headers: { Authorization: `Bearer ${token}` } }); setProjects(r.data); }
    catch { toast.error("Failed to load projects"); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const createProject = async () => {
    try {
      const r = await axios.post(`${API}/projects`, { title: `Project ${projects.length + 1}` },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
      navigate(`/editor/${r.data.project_id}`);
    } catch { toast.error("Failed to create project"); }
  };

  const deleteProject = async (e, pid) => {
    e.stopPropagation();
    if (!window.confirm("Delete this project and all its files?")) return;
    try {
      await axios.delete(`${API}/projects/${pid}`, { headers: { Authorization: `Bearer ${token}` } });
      setProjects(projects.filter(p => p.project_id !== pid));
      toast.success("Project deleted");
    } catch { toast.error("Delete failed"); }
  };

  const clearAllProjects = async () => {
    if (!window.confirm("Delete ALL projects? This cannot be undone.")) return;
    try {
      const r = await axios.delete(`${API}/projects`, { headers: { Authorization: `Bearer ${token}` } });
      setProjects([]);
      toast.success(`Cleared ${r.data.deleted} projects`);
    } catch { toast.error("Clear failed"); }
  };

  const duplicateProject = async (e, pid) => {
    e.stopPropagation();
    try {
      const r = await axios.post(`${API}/projects/${pid}/duplicate`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setProjects([r.data, ...projects]);
      toast.success("Project duplicated!");
    } catch { toast.error("Duplicate failed"); }
  };

  const renameProject = async (e, pid) => {
    e.stopPropagation();
    const proj = projects.find(p => p.project_id === pid);
    const newTitle = prompt("Rename project:", proj?.title || "");
    if (!newTitle || newTitle === proj?.title) return;
    try {
      await axios.patch(`${API}/projects/${pid}`, { title: newTitle }, { headers: { Authorization: `Bearer ${token}` } });
      setProjects(projects.map(p => p.project_id === pid ? { ...p, title: newTitle } : p));
      toast.success("Renamed!");
    } catch { toast.error("Rename failed"); }
  };

  const statusColor = (s) => {
    const map = { created: 'text-zinc-500', uploaded: 'text-blue-600', transcribed: 'text-amber-600', translated: 'text-violet-600', audio_ready: 'text-emerald-600', video_ready: 'text-cyan-600', error: 'text-red-600' };
    return map[s] || 'text-zinc-500';
  };
  const statusBg = (s) => {
    const map = { created: 'bg-zinc-100', uploaded: 'bg-blue-50', transcribed: 'bg-amber-50', translated: 'bg-violet-50', audio_ready: 'bg-emerald-50', video_ready: 'bg-cyan-50', error: 'bg-red-50' };
    return map[s] || 'bg-zinc-100';
  };

  return (
  <AnimatePresence mode="wait">
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className={`min-h-screen ${d?'bg-zinc-950':'bg-zinc-50'}`} style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <header className={`backdrop-blur-xl shadow-sm border-b ${d?'bg-zinc-950/80 border-zinc-800':'bg-white/70 border-black/10'}`}>
        <div className="max-w-6xl mx-auto px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/voxidub-logo.png" alt="VoxiDub.AI" className="h-16 w-auto object-contain" />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className={`text-xs ${d?'text-zinc-500':'text-zinc-400'}`}>{user?.email}</span>
            <button onClick={logout} data-testid="logout-btn"
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors flex items-center gap-1.5 ${d?'text-zinc-400 hover:text-white':'text-zinc-500 hover:text-zinc-950'}`}>
              <SignOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className={`text-2xl font-semibold ${d?'text-white':'text-zinc-950'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>Your Projects</h1>
          <div className="flex items-center gap-2">
            {projects.length > 0 && (
              <button onClick={clearAllProjects} data-testid="clear-all-projects-btn"
                className={`px-4 py-2.5 text-sm font-semibold rounded-sm transition-colors flex items-center gap-2 ${d?'bg-red-900/40 text-red-400 hover:bg-red-900/60 border border-red-800':'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}>
                <Trash className="w-4 h-4" /> Clear All
              </button>
            )}
            <button onClick={() => navigate("/tools")} data-testid="tools-btn"
              className={`px-4 py-2.5 text-sm font-semibold rounded-sm transition-colors flex items-center gap-2 ${d?'bg-violet-900/40 text-violet-400 hover:bg-violet-900/60 border border-violet-800':'bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200'}`}>
              <Wrench className="w-4 h-4" /> Tools
            </button>
            <button onClick={createProject} data-testid="new-project-btn"
              className={`px-5 py-2.5 text-sm font-semibold rounded-sm transition-colors flex items-center gap-2 ${d?'bg-white text-zinc-950 hover:bg-zinc-200':'bg-zinc-950 text-white hover:bg-zinc-800'}`}>
              <Plus className="w-4 h-4" weight="bold" /> New Project
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner className="w-10 h-10 text-zinc-400 animate-spin" /></div>
        ) : projects.length === 0 ? (
          <div onClick={createProject} className={`border-2 border-dashed rounded-sm p-20 text-center cursor-pointer transition-colors group ${d?'border-zinc-700 hover:border-zinc-500':'border-zinc-200 hover:border-zinc-400'}`}>
            <VideoCamera className={`w-14 h-14 mx-auto mb-4 transition-colors ${d?'text-zinc-600 group-hover:text-zinc-400':'text-zinc-300 group-hover:text-zinc-500'}`} weight="duotone" />
            <p className={`text-sm ${d?'text-zinc-500 group-hover:text-zinc-300':'text-zinc-400 group-hover:text-zinc-600'}`}>Create your first dubbing project</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div key={p.project_id} onClick={() => navigate(`/editor/${p.project_id}`)}
                data-testid={`project-card-${p.project_id}`}
                className={`group border rounded-sm p-4 cursor-pointer transition-all hover:shadow-md ${d?'bg-zinc-900 border-zinc-800 hover:border-zinc-600':'bg-white border-black/10 hover:border-zinc-400'}`}>
                <div className="flex items-center mb-2">
                  <h3 className={`font-semibold text-sm flex-1 mr-2 ${d?'text-white':'text-zinc-950'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>{p.title}</h3>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={(e) => renameProject(e, p.project_id)} data-testid={`rename-project-${p.project_id}`}
                      className={`p-0.5 ${d?'text-zinc-500 hover:text-white':'text-zinc-400 hover:text-zinc-950'}`} title="Rename">
                      <PencilSimple className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => duplicateProject(e, p.project_id)} data-testid={`duplicate-project-${p.project_id}`}
                      className={`p-0.5 ${d?'text-zinc-500 hover:text-white':'text-zinc-400 hover:text-zinc-950'}`} title="Duplicate">
                      <CopySimple className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => deleteProject(e, p.project_id)} data-testid={`delete-project-${p.project_id}`}
                      className="text-zinc-400 hover:text-red-500 p-0.5" title="Delete">
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm ${statusColor(p.status)} ${statusBg(p.status)}`}>
                    {p.status?.replace('_', ' ')}
                  </span>
                  {p.file_type === 'video' && <FilmStrip className="w-3.5 h-3.5 text-zinc-400" />}
                  <StepDots status={p.status} isDark={d} />
                </div>
                <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                  {p.created_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  )}
                  {p.updated_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(p.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </motion.div>
  </AnimatePresence>
  );
};

export default Dashboard;
