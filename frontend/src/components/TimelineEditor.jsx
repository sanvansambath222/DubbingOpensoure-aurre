import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  GenderMale, GenderFemale, MagnifyingGlassPlus, MagnifyingGlassMinus,
  Waveform, FloppyDisk, ArrowsHorizontal, ArrowCounterClockwise, Play
} from "@phosphor-icons/react";

const MIN_ZOOM = 5;
const MAX_ZOOM = 100;
const TRACK_HEIGHT = 44;
const RULER_HEIGHT = 30;
const LABEL_WIDTH = 56;

const formatTime = (sec) => {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const TimelineEditor = ({
  segments, actors, isDark, totalDuration,
  onOffsetChange, onSeekVideo, videoCurrentTime, onSaveOffsets
}) => {
  const d = isDark;
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(20);
  const [dragging, setDragging] = useState(null);
  const [offsets, setOffsets] = useState({});
  const hasChanges = Object.values(offsets).some(v => v !== 0);

  const duration = useMemo(() => {
    const maxEnd = segments.reduce((m, s) => Math.max(m, (s.end || 0) + Math.abs(offsets[segments.indexOf(s)] || 0)), 0);
    return Math.max(totalDuration || 0, maxEnd, 30) + 10;
  }, [segments, totalDuration, offsets]);

  const timelineWidth = duration * zoom;

  const tracks = useMemo(() =>
    actors.map(actor => ({
      actor,
      segs: segments.map((seg, idx) => ({ ...seg, _idx: idx })).filter(seg => seg.speaker === actor.id)
    })),
    [actors, segments]
  );

  // Init offsets from segment data
  useEffect(() => {
    const init = {};
    segments.forEach((seg, idx) => {
      if (seg.timeline_offset !== undefined && seg.timeline_offset !== 0) {
        init[idx] = seg.timeline_offset;
      }
    });
    if (Object.keys(init).length > 0) setOffsets(init);
  }, [segments]);

  const getTickInterval = useCallback(() => {
    if (zoom >= 60) return 1;
    if (zoom >= 30) return 2;
    if (zoom >= 15) return 5;
    if (zoom >= 8) return 10;
    return 30;
  }, [zoom]);

  // Drag handlers
  const handleMouseDown = (e, segIdx) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({ segIdx, startX: e.clientX, originalOffset: offsets[segIdx] || 0 });
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const deltaX = e.clientX - dragging.startX;
    const deltaSec = deltaX / zoom;
    const seg = segments[dragging.segIdx];
    const newOffset = dragging.originalOffset + deltaSec;
    // Don't allow dragging before 0
    const minOffset = -(seg.start || 0);
    const clampedOffset = Math.max(minOffset, newOffset);
    setOffsets(prev => ({ ...prev, [dragging.segIdx]: Math.round(clampedOffset * 10) / 10 }));
  }, [dragging, zoom, segments]);

  const handleMouseUp = useCallback(() => {
    if (!dragging) return;
    const finalOffset = offsets[dragging.segIdx] || 0;
    onOffsetChange?.(dragging.segIdx, finalOffset);
    setDragging(null);
  }, [dragging, offsets, onOffsetChange]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => handleMouseMove(e);
    const up = () => handleMouseUp();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  const handleTimelineClick = (e) => {
    if (dragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + (containerRef.current?.scrollLeft || 0) - LABEL_WIDTH;
    if (x < 0) return;
    const time = x / zoom;
    onSeekVideo?.(time);
  };

  const resetOffsets = () => {
    setOffsets({});
    segments.forEach((_, idx) => onOffsetChange?.(idx, 0));
  };

  const playheadX = (videoCurrentTime || 0) * zoom + LABEL_WIDTH;
  const totalHeight = (tracks.length + 1) * TRACK_HEIGHT + RULER_HEIGHT + 12;

  return (
    <div className={`border-b select-none ${d ? 'bg-zinc-950/60 border-zinc-800' : 'bg-zinc-50 border-black/8'}`} data-testid="timeline-editor">
      {/* Controls */}
      <div className={`flex items-center gap-3 px-4 py-2 border-b ${d ? 'border-zinc-800/60' : 'border-black/5'}`}>
        <div className="flex items-center gap-1.5">
          <ArrowsHorizontal className={`w-3.5 h-3.5 ${d ? 'text-cyan-400' : 'text-cyan-600'}`} weight="bold" />
          <span className={`text-[10px] font-bold uppercase tracking-widest ${d ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Timeline
          </span>
        </div>

        <div className="flex items-center gap-0.5 ml-3">
          <button onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 5))} data-testid="timeline-zoom-out"
            className={`p-1 rounded transition-colors ${d ? 'hover:bg-zinc-700 text-zinc-500' : 'hover:bg-zinc-200 text-zinc-400'}`}>
            <MagnifyingGlassMinus className="w-3.5 h-3.5" />
          </button>
          <div className={`w-16 h-1 rounded-full mx-1 relative ${d ? 'bg-zinc-700' : 'bg-zinc-200'}`}>
            <div className={`h-full rounded-full ${d ? 'bg-cyan-500/50' : 'bg-cyan-400/50'}`}
              style={{ width: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }} />
          </div>
          <button onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 5))} data-testid="timeline-zoom-in"
            className={`p-1 rounded transition-colors ${d ? 'hover:bg-zinc-700 text-zinc-500' : 'hover:bg-zinc-200 text-zinc-400'}`}>
            <MagnifyingGlassPlus className="w-3.5 h-3.5" />
          </button>
          <span className={`text-[8px] font-mono ml-1 ${d ? 'text-zinc-600' : 'text-zinc-400'}`}>{zoom}px/s</span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {hasChanges && (
            <button onClick={resetOffsets} data-testid="timeline-reset-btn"
              className={`px-2 py-1 text-[9px] font-semibold rounded flex items-center gap-1 transition-colors ${d ? 'text-zinc-400 hover:text-white hover:bg-zinc-700' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200'}`}>
              <ArrowCounterClockwise className="w-3 h-3" /> Reset
            </button>
          )}
          <button onClick={() => onSaveOffsets?.(offsets)} data-testid="timeline-save-btn"
            className={`px-3 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-all ${
              hasChanges
                ? (d ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-500')
                : (d ? 'bg-zinc-800 text-zinc-500 border border-zinc-700' : 'bg-zinc-100 text-zinc-400 border border-zinc-200')
            }`}>
            <FloppyDisk className="w-3 h-3" /> Save Timeline
          </button>
        </div>
      </div>

      {/* Timeline Canvas */}
      <div ref={containerRef} className="overflow-x-auto overflow-y-hidden relative"
        style={{ maxHeight: totalHeight + 4 }}>
        <div style={{ width: timelineWidth + LABEL_WIDTH + 40, height: totalHeight }}
          className="relative" onClick={handleTimelineClick}>

          {/* Ruler */}
          <div className={`sticky top-0 z-20 border-b ${d ? 'bg-zinc-900/95 border-zinc-700/50' : 'bg-white/95 border-zinc-200'}`}
            style={{ height: RULER_HEIGHT }}>
            {(() => {
              const interval = getTickInterval();
              const ticks = [];
              for (let t = 0; t <= duration; t += interval) {
                const x = t * zoom + LABEL_WIDTH;
                const isMajor = t % (interval * 5) === 0 || interval >= 10;
                ticks.push(
                  <div key={t} className="absolute top-0" style={{ left: x }}>
                    <div className={`w-px ${isMajor ? 'h-4' : 'h-2.5'} ${d ? 'bg-zinc-600' : 'bg-zinc-300'}`} />
                    {isMajor && (
                      <span className={`absolute text-[7px] font-mono -translate-x-1/2 ${d ? 'text-zinc-500' : 'text-zinc-400'}`}
                        style={{ top: isMajor ? 16 : 12 }}>
                        {formatTime(t)}
                      </span>
                    )}
                  </div>
                );
              }
              return ticks;
            })()}
          </div>

          {/* Tracks */}
          {tracks.map((track, tIdx) => {
            const isMale = track.actor.gender === 'male';
            const trackTop = RULER_HEIGHT + tIdx * TRACK_HEIGHT + 4;
            return (
              <div key={track.actor.id} className="absolute left-0 right-0"
                style={{ top: trackTop, height: TRACK_HEIGHT }}
                data-testid={`timeline-track-${track.actor.id}`}>
                {/* Track bg stripe */}
                <div className={`absolute inset-0 ${tIdx % 2 === 0 ? (d ? 'bg-zinc-900/30' : 'bg-zinc-50/50') : ''}`} />

                {/* Track label */}
                <div className={`absolute left-0 top-0 bottom-0 flex flex-col items-center justify-center z-10 ${d ? 'bg-zinc-900/90' : 'bg-white/90'}`}
                  style={{ width: LABEL_WIDTH }}>
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isMale ? 'bg-blue-500/15' : 'bg-pink-500/15'}`}>
                    {isMale
                      ? <GenderMale className="w-3 h-3 text-blue-500" weight="bold" />
                      : <GenderFemale className="w-3 h-3 text-pink-500" weight="bold" />}
                  </div>
                  <span className={`text-[7px] font-bold mt-0.5 truncate max-w-[50px] ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {track.actor.label || track.actor.id}
                  </span>
                </div>

                {/* Segments */}
                {track.segs.map(seg => {
                  const offset = offsets[seg._idx] || 0;
                  const start = (seg.start || 0) + offset;
                  const segDur = (seg.end || 0) - (seg.start || 0);
                  const left = Math.max(0, start * zoom) + LABEL_WIDTH;
                  const width = Math.max(segDur * zoom, 8);
                  const isDraggingThis = dragging?.segIdx === seg._idx;

                  return (
                    <div
                      key={seg._idx}
                      data-testid={`timeline-block-${seg._idx}`}
                      onMouseDown={(e) => handleMouseDown(e, seg._idx)}
                      onClick={(e) => { e.stopPropagation(); onSeekVideo?.(seg.start || 0); }}
                      title={`${seg.translated || seg.original || 'Segment ' + (seg._idx + 1)}\n${formatTime(seg.start || 0)} → ${formatTime(seg.end || 0)}${offset ? ` (${offset > 0 ? '+' : ''}${offset.toFixed(1)}s)` : ''}`}
                      className={`absolute rounded-md cursor-grab active:cursor-grabbing flex items-center px-1.5 overflow-hidden border transition-all ${
                        isDraggingThis
                          ? 'ring-2 shadow-xl z-30 scale-[1.03]'
                          : 'hover:shadow-lg hover:brightness-110 z-10'
                      } ${
                        isMale
                          ? `bg-blue-500 border-blue-400/50 text-white ${isDraggingThis ? 'ring-blue-300' : ''}`
                          : `bg-pink-500 border-pink-400/50 text-white ${isDraggingThis ? 'ring-pink-300' : ''}`
                      }`}
                      style={{
                        left,
                        width,
                        top: 4,
                        height: TRACK_HEIGHT - 10,
                      }}>
                      {width > 30 && (
                        <span className="text-[8px] font-semibold truncate whitespace-nowrap opacity-90">
                          {seg.translated || seg.original || `#${seg._idx + 1}`}
                        </span>
                      )}
                      {offset !== 0 && width > 50 && (
                        <span className="text-[7px] opacity-60 ml-auto flex-shrink-0 font-mono">
                          {offset > 0 ? '+' : ''}{offset.toFixed(1)}s
                        </span>
                      )}
                      {/* Drag grip lines */}
                      <div className="absolute right-0.5 top-1/2 -translate-y-1/2 flex flex-col gap-[2px] opacity-40">
                        <div className="w-1 h-px bg-white" />
                        <div className="w-1 h-px bg-white" />
                        <div className="w-1 h-px bg-white" />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Background Audio Track */}
          {(() => {
            const bgTop = RULER_HEIGHT + tracks.length * TRACK_HEIGHT + 4;
            return (
              <div className="absolute left-0 right-0" style={{ top: bgTop, height: TRACK_HEIGHT }}
                data-testid="timeline-bg-track">
                <div className={`absolute left-0 top-0 bottom-0 flex flex-col items-center justify-center z-10 ${d ? 'bg-zinc-900/90' : 'bg-white/90'}`}
                  style={{ width: LABEL_WIDTH }}>
                  <div className="w-6 h-6 rounded-md flex items-center justify-center bg-amber-500/15">
                    <Waveform className="w-3 h-3 text-amber-500" weight="bold" />
                  </div>
                  <span className={`text-[7px] font-bold mt-0.5 ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>BG</span>
                </div>
                {/* BG bar with fake waveform */}
                <div className={`absolute rounded-md border ${d ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-400/10 border-amber-400/20'}`}
                  style={{ left: LABEL_WIDTH, width: Math.max(duration * zoom - 20, 100), top: 4, height: TRACK_HEIGHT - 10 }}>
                  <div className="h-full flex items-center gap-px px-1 overflow-hidden">
                    {Array.from({ length: Math.min(Math.floor(duration * zoom / 3), 300) }, (_, i) => (
                      <div key={i} className={`w-[2px] flex-shrink-0 rounded-full ${d ? 'bg-amber-500/20' : 'bg-amber-400/25'}`}
                        style={{ height: `${20 + Math.sin(i * 0.3) * 15 + Math.random() * 25}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Playhead line */}
          {videoCurrentTime > 0 && (
            <div className="absolute top-0 w-0.5 bg-red-500 z-40 pointer-events-none"
              style={{ left: playheadX, height: totalHeight }}
              data-testid="timeline-playhead">
              <div className="w-3 h-3 bg-red-500 rounded-full absolute -left-[5px] -top-1 shadow-md" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimelineEditor;
