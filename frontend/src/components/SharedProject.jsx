import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { Spinner, VideoCamera, MicrophoneStage, Globe, Download, Subtitles } from "@phosphor-icons/react";
import { useAuth, ThemeToggle } from "./AuthContext";
import { API } from "./constants";

const SharedProject = () => {
  const { isDark } = useAuth();
  const d = isDark;
  const location = useLocation();
  const shareToken = location.pathname.split('/shared/')[1];
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchShared = async () => {
      try {
        const r = await axios.get(`${API}/shared/${shareToken}`);
        setProject(r.data);
      } catch { setError("Project not found or link expired"); }
      finally { setLoading(false); }
    };
    if (shareToken) fetchShared();
  }, [shareToken]);

  if (loading) return <div className={`min-h-screen flex items-center justify-center ${d?'bg-zinc-950':'bg-zinc-50'}`}><Spinner className="w-12 h-12 text-zinc-700 animate-spin" /></div>;
  if (error) return (
    <div className={`min-h-screen flex items-center justify-center text-center px-6 ${d?'bg-zinc-950':'bg-zinc-50'}`}>
      <div>
        <VideoCamera className={`w-16 h-16 mx-auto mb-4 ${d?'text-zinc-600':'text-zinc-300'}`} weight="duotone" />
        <h2 className={`text-xl font-bold mb-2 ${d?'text-white':'text-zinc-950'}`}>Not Found</h2>
        <p className="text-zinc-500 text-sm mb-6">{error}</p>
        <a href="/" className={`px-5 py-2.5 text-sm font-semibold rounded-sm transition-colors ${d?'bg-white text-zinc-950 hover:bg-zinc-200':'bg-cyan-500 text-zinc-950 hover:bg-cyan-400'}`}>
          Go to VoxiDub
        </a>
      </div>
    </div>
  );

  const LANG_NAMES = { zh: "Chinese", th: "Thai", vi: "Vietnamese", ko: "Korean", ja: "Japanese", en: "English" };

  return (
    <div className={`min-h-screen ${d?'bg-zinc-950':'bg-zinc-50'}`} data-testid="shared-project-page">
      <header className={`backdrop-blur-sm border-b ${d?'bg-zinc-950/90 border-zinc-800':'bg-zinc-50/90 border-black/10'}`}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/voxidub-logo.png" alt="VoxiDub.AI" className="h-12 w-12 rounded-full object-cover border-2 border-zinc-200" />
            <span className={`text-xl font-bold tracking-tight ${d?'text-white':'text-zinc-950'}`} style={{fontFamily:"'Outfit',sans-serif"}}>VoxiDub.AI</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a href="/" className={`px-4 py-2 text-xs font-semibold rounded-sm transition-colors ${d?'bg-zinc-800 text-white hover:bg-zinc-700':'bg-zinc-100 text-zinc-950 hover:bg-zinc-200'}`}>
              Try it now
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className={`text-2xl font-bold mb-2 ${d?'text-white':'text-zinc-950'}`}>{project.title}</h1>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            {project.detected_language && (
              <span className="flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded-sm">
                <Globe className="w-3 h-3" /> {LANG_NAMES[project.detected_language] || project.detected_language} to Khmer
              </span>
            )}
            {project.segments?.length > 0 && <span>{project.segments.length} segments</span>}
            {project.actors?.length > 0 && <span>{project.actors.length} actors</span>}
          </div>
        </div>

        {project.has_video && (
          <div className="mb-6">
            <video src={`${API}/shared/${shareToken}/video`} controls className="w-full rounded-sm bg-black max-h-[400px]" data-testid="shared-video" />
          </div>
        )}
        {!project.has_video && project.has_audio && (
          <div className="mb-6 bg-white border border-black/10 rounded-sm p-4">
            <audio src={`${API}/shared/${shareToken}/audio`} controls className="w-full" data-testid="shared-audio" />
          </div>
        )}

        <div className="flex gap-3 mb-8">
          {project.has_video && (
            <a href={`${API}/shared/${shareToken}/video`} download data-testid="shared-download-video"
              className="px-5 py-2.5 bg-zinc-950/5 border border-zinc-950/15 text-zinc-700 text-sm font-semibold rounded-sm hover:bg-zinc-100 flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" /> Download Video
            </a>
          )}
          {project.has_audio && (
            <a href={`${API}/shared/${shareToken}/audio`} download data-testid="shared-download-audio"
              className="px-5 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-sm hover:bg-emerald-100 flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" /> Download Audio
            </a>
          )}
          {project.segments?.some(s => s.translated) && (
            <a href={`${API}/shared/${shareToken}/srt`} download data-testid="shared-download-srt"
              className="px-5 py-2.5 bg-violet-50 border border-violet-200 text-violet-700 text-sm font-semibold rounded-sm hover:bg-violet-100 flex items-center gap-2 transition-colors">
              <Subtitles className="w-4 h-4" /> Download SRT
            </a>
          )}
        </div>

        {project.segments?.length > 0 && (
          <div className={`border rounded-sm overflow-hidden ${d?'bg-zinc-900 border-zinc-800':'bg-white border-black/10'}`}>
            <div className={`px-4 py-3 border-b ${d?'border-zinc-800':'border-black/10'}`}>
              <h3 className={`font-semibold text-sm ${d?'text-white':'text-zinc-950'}`}>Subtitles</h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className={`sticky top-0 ${d?'bg-zinc-900':'bg-white'}`}>
                  <tr className={`text-[10px] uppercase ${d?'text-zinc-500':'text-zinc-400'}`}>
                    <th className="px-4 py-2 text-left w-10">#</th>
                    <th className="px-4 py-2 text-left w-20">Time</th>
                    <th className="px-4 py-2 text-left">Original</th>
                    <th className="px-4 py-2 text-left">Khmer</th>
                    <th className="px-4 py-2 text-left w-24">Speaker</th>
                  </tr>
                </thead>
                <tbody>
                  {project.segments.map((seg, i) => (
                    <tr key={seg.id ?? i} className={`border-b ${d?'border-zinc-800':'border-black/5'}`}>
                      <td className={`px-4 py-2 ${d?'text-zinc-500':'text-zinc-400'}`}>{i + 1}</td>
                      <td className="px-4 py-2 text-zinc-500 font-mono text-[10px]">
                        {Math.floor((seg.start||0)/60)}:{((seg.start||0)%60).toFixed(0).padStart(2,'0')}
                      </td>
                      <td className={`px-4 py-2 ${d?'text-zinc-400':'text-zinc-600'}`}>{seg.original}</td>
                      <td className={`px-4 py-2 ${d?'text-zinc-300':'text-zinc-700'}`}>{seg.translated}</td>
                      <td className="px-4 py-2">
                        <span className={`text-[10px] font-bold ${seg.gender === 'male' ? 'text-blue-600' : 'text-pink-600'}`}>
                          {seg.gender === 'male' ? 'Boy' : 'Girl'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default SharedProject;
