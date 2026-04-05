import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  GenderMale, GenderFemale, MagnifyingGlassPlus, MagnifyingGlassMinus,
  Waveform, FloppyDisk, ArrowsHorizontal, ArrowCounterClockwise,
  Play, Pause, Stop, DotsSixVertical, Clock, SpeakerHigh,
  Scissors, UserSwitch, X
} from "@phosphor-icons/react";

const MIN_ZOOM = 8;
const MAX_ZOOM = 120;
const TRACK_HEIGHT = 64;
const RULER_HEIGHT = 38;
const LABEL_WIDTH = 90;
const BLOCK_MARGIN = 6;

const formatTime = (sec) => {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}.${ms}` : `0:${String(s).padStart(2, '0')}.${ms}`;
};

const formatShort = (sec) => {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const TimelineEditor = ({
  segments, actors, isDark, totalDuration,
  onOffsetChange, onSeekVideo, videoCurrentTime, onSaveOffsets,
  isPlaying, onPlayPause, onStop,
  onSplitSegment, onChangeSpeaker
}) => {
  const d = isDark;
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(30);
  const [dragging, setDragging] = useState(null);
  const [offsets, setOffsets] = useState({});
  const [hoveredSeg, setHoveredSeg] = useState(null);
  const [selectedSeg, setSelectedSeg] = useState(null);
  const [draggingPlayhead, setDraggingPlayhead] = useState(null);
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
    if (zoom >= 80) return 1;
    if (zoom >= 40) return 2;
    if (zoom >= 20) return 5;
    if (zoom >= 10) return 10;
    return 30;
  }, [zoom]);

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
    if (dragging || draggingPlayhead) return;
    setSelectedSeg(null);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + (containerRef.current?.scrollLeft || 0) - LABEL_WIDTH;
    if (x < 0) return;
    const time = x / zoom;
    onSeekVideo?.(time);
  };

  // Playhead drag
  const handlePlayheadDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingPlayhead({ startX: e.clientX, startTime: videoCurrentTime || 0 });
  };

  const handlePlayheadMove = useCallback((e) => {
    if (!draggingPlayhead || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft - LABEL_WIDTH;
    const time = Math.max(0, Math.min(duration, x / zoom));
    onSeekVideo?.(time);
  }, [draggingPlayhead, zoom, duration, onSeekVideo]);

  const handlePlayheadUp = useCallback(() => {
    setDraggingPlayhead(null);
  }, []);

  useEffect(() => {
    if (!draggingPlayhead) return;
    const move = (e) => handlePlayheadMove(e);
    const up = () => handlePlayheadUp();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [draggingPlayhead, handlePlayheadMove, handlePlayheadUp]);

  const resetOffsets = () => {
    setOffsets({});
    segments.forEach((_, idx) => onOffsetChange?.(idx, 0));
  };

  const playheadX = (videoCurrentTime || 0) * zoom + LABEL_WIDTH;
  const totalHeight = (tracks.length + 1) * TRACK_HEIGHT + RULER_HEIGHT + 16;

  useEffect(() => {
    if (!isPlaying || !containerRef.current) return;
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const viewWidth = container.clientWidth;
    if (playheadX < scrollLeft + LABEL_WIDTH + 40 || playheadX > scrollLeft + viewWidth - 60) {
      container.scrollLeft = Math.max(0, playheadX - viewWidth * 0.3);
    }
  }, [playheadX, isPlaying]);

  const changedCount = Object.values(offsets).filter(v => v !== 0).length;

  return (
    <div className={`select-none ${d ? 'bg-zinc-950' : 'bg-white'}`} data-testid="timeline-editor">
      {/* Top Control Bar */}
      <div className={`flex items-center gap-2 px-5 py-3 border-b ${d ? 'border-zinc-800 bg-zinc-900/80' : 'border-zinc-200 bg-zinc-50/80'}`}>
        {/* Left: Label + Transport */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <ArrowsHorizontal className={`w-4 h-4 ${d ? 'text-cyan-400' : 'text-cyan-600'}`} weight="bold" />
            <span className={`text-xs font-bold uppercase tracking-wider ${d ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Timeline
            </span>
          </div>

          {/* Transport controls */}
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${d ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
            <button onClick={onStop} data-testid="timeline-stop-btn"
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${d ? 'text-zinc-400 hover:bg-zinc-700 hover:text-white' : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'}`}>
              <Stop className="w-4 h-4" weight="fill" />
            </button>
            <button onClick={onPlayPause} data-testid="timeline-play-btn"
              className={`w-10 h-8 rounded-md flex items-center justify-center transition-all font-bold ${
                isPlaying
                  ? (d ? 'bg-amber-500/25 text-amber-300 hover:bg-amber-500/35' : 'bg-amber-100 text-amber-600 hover:bg-amber-200')
                  : (d ? 'bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500/35' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200')
              }`}>
              {isPlaying
                ? <Pause className="w-4.5 h-4.5" weight="fill" />
                : <Play className="w-4.5 h-4.5" weight="fill" />}
            </button>
          </div>

          {/* Time display */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono ${d ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-700'}`}>
            <Clock className="w-3.5 h-3.5 opacity-50" />
            <span className="text-sm font-bold tabular-nums tracking-tight">
              {formatTime(videoCurrentTime || 0)}
            </span>
            {totalDuration > 0 && (
              <span className={`text-[10px] opacity-40 ml-1`}>/ {formatShort(duration)}</span>
            )}
          </div>
        </div>

        {/* Center: Zoom */}
        <div className="flex items-center gap-1 ml-6">
          <button onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 5))} data-testid="timeline-zoom-out"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${d ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-500'}`}>
            <MagnifyingGlassMinus className="w-4 h-4" />
          </button>
          <div className={`w-24 h-1.5 rounded-full mx-1 relative cursor-pointer ${d ? 'bg-zinc-700' : 'bg-zinc-200'}`}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setZoom(Math.round(MIN_ZOOM + pct * (MAX_ZOOM - MIN_ZOOM)));
            }}>
            <div className={`h-full rounded-full transition-all ${d ? 'bg-cyan-500/60' : 'bg-cyan-400/60'}`}
              style={{ width: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }} />
            <div className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow border-2 ${d ? 'bg-cyan-400 border-zinc-800' : 'bg-cyan-500 border-white'}`}
              style={{ left: `calc(${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}% - 6px)` }} />
          </div>
          <button onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 5))} data-testid="timeline-zoom-in"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${d ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-500'}`}>
            <MagnifyingGlassPlus className="w-4 h-4" />
          </button>
          <span className={`text-[9px] font-mono ml-1.5 ${d ? 'text-zinc-600' : 'text-zinc-400'}`}>{zoom}px/s</span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 ml-auto">
          {hasChanges && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${d ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
              {changedCount} changed
            </span>
          )}
          {hasChanges && (
            <button onClick={resetOffsets} data-testid="timeline-reset-btn"
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md flex items-center gap-1.5 transition-colors border ${d ? 'text-zinc-300 border-zinc-700 hover:bg-zinc-800' : 'text-zinc-600 border-zinc-300 hover:bg-zinc-100'}`}>
              <ArrowCounterClockwise className="w-3.5 h-3.5" /> Reset All
            </button>
          )}
          <button onClick={() => onSaveOffsets?.(offsets)} data-testid="timeline-save-btn"
            className={`px-4 py-1.5 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all shadow-sm ${
              hasChanges
                ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-500/20'
                : (d ? 'bg-zinc-800 text-zinc-500 border border-zinc-700' : 'bg-zinc-100 text-zinc-400 border border-zinc-200')
            }`}>
            <FloppyDisk className="w-3.5 h-3.5" /> Save Timeline
          </button>
        </div>
      </div>

      {/* Timeline Canvas */}
      <div ref={containerRef} className={`overflow-x-auto overflow-y-hidden relative border-b ${d ? 'border-zinc-800' : 'border-zinc-200'}`}
        style={{ height: totalHeight + 4 }}>
        <div style={{ width: timelineWidth + LABEL_WIDTH + 60, minHeight: totalHeight }}
          className="relative" onClick={handleTimelineClick}>

          {/* Ruler */}
          <div className={`sticky top-0 z-20 border-b ${d ? 'bg-zinc-900 border-zinc-700/60' : 'bg-zinc-50 border-zinc-200'}`}
            style={{ height: RULER_HEIGHT }}>
            {/* Label spacer */}
            <div className={`absolute left-0 top-0 bottom-0 z-10 ${d ? 'bg-zinc-900' : 'bg-zinc-50'}`} style={{ width: LABEL_WIDTH }} />
            {(() => {
              const interval = getTickInterval();
              const ticks = [];
              for (let t = 0; t <= duration; t += interval) {
                const x = t * zoom + LABEL_WIDTH;
                const isMajor = t % (interval * (interval >= 10 ? 3 : 5)) === 0 || interval >= 10;
                ticks.push(
                  <div key={t} className="absolute" style={{ left: x, top: 0, height: '100%' }}>
                    <div className={`w-px ${isMajor ? 'h-5' : 'h-3'} ${d ? (isMajor ? 'bg-zinc-500' : 'bg-zinc-700') : (isMajor ? 'bg-zinc-400' : 'bg-zinc-200')}`} />
                    {isMajor && (
                      <span className={`absolute text-[9px] font-mono -translate-x-1/2 font-semibold ${d ? 'text-zinc-400' : 'text-zinc-500'}`}
                        style={{ top: 20 }}>
                        {formatShort(t)}
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
            const trackTop = RULER_HEIGHT + tIdx * TRACK_HEIGHT + 8;
            return (
              <div key={track.actor.id} className="absolute left-0 right-0"
                style={{ top: trackTop, height: TRACK_HEIGHT }}
                data-testid={`timeline-track-${track.actor.id}`}>
                {/* Track bg */}
                <div className={`absolute inset-0 ${
                  tIdx % 2 === 0
                    ? (d ? 'bg-zinc-900/40' : 'bg-zinc-50/80')
                    : (d ? 'bg-zinc-900/20' : 'bg-white/60')
                }`} />
                {/* Subtle grid lines */}
                <div className={`absolute bottom-0 left-0 right-0 h-px ${d ? 'bg-zinc-800/50' : 'bg-zinc-100'}`} />

                {/* Track label */}
                <div className={`absolute left-0 top-0 bottom-0 flex items-center gap-2 px-2 z-10 ${d ? 'bg-zinc-900/95' : 'bg-white/95'}`}
                  style={{ width: LABEL_WIDTH }}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isMale
                      ? (d ? 'bg-blue-500/20 ring-1 ring-blue-500/30' : 'bg-blue-100 ring-1 ring-blue-200')
                      : (d ? 'bg-pink-500/20 ring-1 ring-pink-500/30' : 'bg-pink-100 ring-1 ring-pink-200')
                  }`}>
                    {isMale
                      ? <GenderMale className="w-4.5 h-4.5 text-blue-500" weight="bold" />
                      : <GenderFemale className="w-4.5 h-4.5 text-pink-500" weight="bold" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[10px] font-bold truncate leading-tight ${d ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      {track.actor.label || track.actor.id}
                    </p>
                    <p className={`text-[8px] font-semibold uppercase ${isMale ? 'text-blue-500' : 'text-pink-500'}`}>
                      {isMale ? 'Boy' : 'Girl'}
                    </p>
                  </div>
                </div>

                {/* Segments */}
                {track.segs.map(seg => {
                  const offset = offsets[seg._idx] || 0;
                  const start = (seg.start || 0) + offset;
                  const segDur = (seg.end || 0) - (seg.start || 0);
                  const left = Math.max(0, start * zoom) + LABEL_WIDTH;
                  const width = Math.max(segDur * zoom, 16);
                  const isDraggingThis = dragging?.segIdx === seg._idx;
                  const isHovered = hoveredSeg === seg._idx;
                  const isSelected = selectedSeg === seg._idx;

                  return (
                    <div key={seg._idx} className="contents">
                    <div
                      data-testid={`timeline-block-${seg._idx}`}
                      onMouseDown={(e) => handleMouseDown(e, seg._idx)}
                      onMouseEnter={() => setHoveredSeg(seg._idx)}
                      onMouseLeave={() => setHoveredSeg(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSeg(isSelected ? null : seg._idx);
                        onSeekVideo?.(seg.start || 0);
                      }}
                      title={`${seg.translated || seg.original || 'Segment ' + (seg._idx + 1)}\n${formatShort(seg.start || 0)} → ${formatShort(seg.end || 0)} (${segDur.toFixed(1)}s)${offset ? `\nOffset: ${offset > 0 ? '+' : ''}${offset.toFixed(1)}s` : ''}`}
                      className={`absolute rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-1 overflow-hidden border-2 transition-all ${
                        isDraggingThis
                          ? 'ring-2 ring-offset-1 shadow-2xl z-30 scale-[1.02]'
                          : isSelected
                            ? 'ring-2 ring-offset-1 ring-yellow-400 shadow-2xl z-25'
                            : isHovered
                              ? 'shadow-xl z-20 brightness-110'
                              : 'shadow-md z-10 hover:shadow-lg'
                      } ${
                        isMale
                          ? `border-blue-400/60 text-white ${isDraggingThis ? 'ring-blue-300 bg-blue-500' : 'bg-blue-500/90'}`
                          : `border-pink-400/60 text-white ${isDraggingThis ? 'ring-pink-300 bg-pink-500' : 'bg-pink-500/90'}`
                      }`}
                      style={{
                        left,
                        width,
                        top: BLOCK_MARGIN,
                        height: TRACK_HEIGHT - BLOCK_MARGIN * 2 - 2,
                        ...(isDraggingThis ? { ringOffsetColor: d ? '#09090b' : '#fff' } : {}),
                      }}>
                      {/* Drag handle left */}
                      <div className={`flex-shrink-0 flex items-center justify-center w-5 h-full opacity-40 hover:opacity-80 ${isDraggingThis ? 'opacity-80' : ''}`}>
                        <DotsSixVertical className="w-3.5 h-3.5" weight="bold" />
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center pr-1.5">
                        {width > 50 && (
                          <span className="text-[10px] font-semibold truncate whitespace-nowrap leading-tight">
                            {seg.translated || seg.original || `#${seg._idx + 1}`}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          {width > 40 && (
                            <span className="text-[8px] opacity-60 font-mono">
                              {segDur.toFixed(1)}s
                            </span>
                          )}
                          {offset !== 0 && width > 60 && (
                            <span className={`text-[8px] font-mono font-bold px-1 py-px rounded ${
                              offset > 0
                                ? 'bg-white/20 text-green-200'
                                : 'bg-white/20 text-amber-200'
                            }`}>
                              {offset > 0 ? '+' : ''}{offset.toFixed(1)}s
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Drag handle right */}
                      <div className={`flex-shrink-0 flex items-center justify-center w-4 h-full opacity-30 hover:opacity-70`}>
                        <DotsSixVertical className="w-3 h-3" weight="bold" />
                      </div>
                    </div>

                    {/* Floating Toolbar - shown when block is selected */}
                    {isSelected && !isDraggingThis && (
                      <div className={`absolute z-50 flex items-center gap-1 px-1.5 py-1 rounded-lg shadow-xl border ${d ? 'bg-zinc-800 border-zinc-600' : 'bg-white border-zinc-300'}`}
                        style={{ left: left + 4, top: -36 }}
                        data-testid={`timeline-toolbar-${seg._idx}`}
                        onClick={(e) => e.stopPropagation()}>
                        {/* Split button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); onSplitSegment?.(seg._idx); setSelectedSeg(null); }}
                          data-testid={`timeline-split-${seg._idx}`}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${d ? 'hover:bg-violet-500/20 text-violet-400' : 'hover:bg-violet-100 text-violet-600'}`}>
                          <Scissors className="w-3.5 h-3.5" weight="bold" /> Split
                        </button>
                        {/* Divider */}
                        <div className={`w-px h-5 ${d ? 'bg-zinc-600' : 'bg-zinc-200'}`} />
                        {/* Actor picker */}
                        {actors.map(actor => {
                          const isCurrent = seg.speaker === actor.id;
                          const actorMale = actor.gender === 'male';
                          return (
                            <button key={actor.id}
                              onClick={(e) => { e.stopPropagation(); if (!isCurrent) { onChangeSpeaker?.(seg._idx, actor.id, actor.gender); setSelectedSeg(null); } }}
                              data-testid={`timeline-assign-${seg._idx}-${actor.id}`}
                              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                                isCurrent
                                  ? (actorMale
                                    ? (d ? 'bg-blue-500/25 text-blue-300 ring-1 ring-blue-500/40' : 'bg-blue-100 text-blue-700 ring-1 ring-blue-300')
                                    : (d ? 'bg-pink-500/25 text-pink-300 ring-1 ring-pink-500/40' : 'bg-pink-100 text-pink-700 ring-1 ring-pink-300'))
                                  : (d ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500')
                              }`}>
                              {actorMale
                                ? <GenderMale className="w-3 h-3" weight="bold" />
                                : <GenderFemale className="w-3 h-3" weight="bold" />}
                              {actor.label || actor.id}
                            </button>
                          );
                        })}
                        {/* Close */}
                        <button onClick={(e) => { e.stopPropagation(); setSelectedSeg(null); }}
                          className={`w-5 h-5 rounded flex items-center justify-center ml-0.5 ${d ? 'hover:bg-zinc-700 text-zinc-500' : 'hover:bg-zinc-100 text-zinc-400'}`}>
                          <X className="w-3 h-3" weight="bold" />
                        </button>
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Background Audio Track */}
          {(() => {
            const bgTop = RULER_HEIGHT + tracks.length * TRACK_HEIGHT + 8;
            return (
              <div className="absolute left-0 right-0" style={{ top: bgTop, height: TRACK_HEIGHT }}
                data-testid="timeline-bg-track">
                <div className={`absolute inset-0 ${d ? 'bg-zinc-900/20' : 'bg-amber-50/30'}`} />
                {/* Label */}
                <div className={`absolute left-0 top-0 bottom-0 flex items-center gap-2 px-2 z-10 ${d ? 'bg-zinc-900/95' : 'bg-white/95'}`}
                  style={{ width: LABEL_WIDTH }}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                    isPlaying
                      ? (d ? 'bg-amber-500/30 ring-1 ring-amber-400/40 animate-pulse' : 'bg-amber-200 ring-1 ring-amber-300 animate-pulse')
                      : (d ? 'bg-amber-500/15 ring-1 ring-amber-500/20' : 'bg-amber-100 ring-1 ring-amber-200')
                  }`}>
                    {isPlaying
                      ? <SpeakerHigh className="w-4 h-4 text-amber-500" weight="fill" />
                      : <Waveform className="w-4 h-4 text-amber-500" weight="bold" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[10px] font-bold truncate leading-tight ${isPlaying ? (d ? 'text-amber-300' : 'text-amber-700') : (d ? 'text-zinc-300' : 'text-zinc-600')}`}>
                      {isPlaying ? 'Playing' : 'Background'}
                    </p>
                    <p className={`text-[8px] font-semibold uppercase text-amber-500`}>Music</p>
                  </div>
                </div>
                {/* Waveform bar */}
                <div className={`absolute rounded-lg border ${
                  isPlaying
                    ? (d ? 'bg-amber-500/12 border-amber-500/30' : 'bg-amber-400/12 border-amber-400/30')
                    : (d ? 'bg-amber-500/6 border-amber-500/15' : 'bg-amber-400/8 border-amber-400/15')
                }`}
                  style={{ left: LABEL_WIDTH, width: Math.max(duration * zoom - 20, 100), top: BLOCK_MARGIN, height: TRACK_HEIGHT - BLOCK_MARGIN * 2 - 2 }}>
                  <div className="h-full flex items-center gap-[1px] px-2 overflow-hidden">
                    {Array.from({ length: Math.min(Math.floor(duration * zoom / 3), 400) }, (_, i) => {
                      const h = 15 + Math.sin(i * 0.25) * 12 + Math.sin(i * 0.7) * 8 + Math.sin(i * 1.3) * 5;
                      return (
                        <div key={i} className={`w-[2px] flex-shrink-0 rounded-full transition-colors ${
                          isPlaying ? (d ? 'bg-amber-400/30' : 'bg-amber-500/25') : (d ? 'bg-amber-500/15' : 'bg-amber-400/18')
                        }`}
                          style={{ height: `${Math.max(8, Math.min(85, h))}%` }} />
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Playhead - BIG draggable handle */}
          <div className={`absolute top-0 z-40`}
            style={{ left: playheadX - 1, height: totalHeight }}
            data-testid="timeline-playhead">
            {/* Vertical line */}
            <div className={`absolute left-[1px] top-0 w-[2px] h-full transition-colors ${
              draggingPlayhead ? 'bg-red-500 shadow-lg shadow-red-500/30' : isPlaying ? 'bg-red-500' : 'bg-red-400/70'
            }`} />
            {/* Big draggable handle at top */}
            <div
              onMouseDown={handlePlayheadDown}
              data-testid="timeline-playhead-handle"
              className={`absolute -left-[13px] -top-[2px] cursor-grab active:cursor-grabbing group transition-transform ${
                draggingPlayhead ? 'scale-110' : 'hover:scale-105'
              }`}>
              <svg width="28" height="32" viewBox="0 0 28 32" className="drop-shadow-lg">
                {/* Handle body */}
                <rect x="2" y="0" width="24" height="20" rx="4"
                  className={`transition-colors ${
                    draggingPlayhead ? 'fill-red-500' : isPlaying ? 'fill-red-500' : 'fill-red-400'
                  }`} />
                {/* Arrow pointing down */}
                <polygon points="6,20 22,20 14,30"
                  className={`transition-colors ${
                    draggingPlayhead ? 'fill-red-500' : isPlaying ? 'fill-red-500' : 'fill-red-400'
                  }`} />
                {/* Grip lines inside handle */}
                <line x1="10" y1="6" x2="10" y2="15" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                <line x1="14" y1="6" x2="14" y2="15" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                <line x1="18" y1="6" x2="18" y2="15" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom hint */}
      {hoveredSeg !== null && (
        <div className={`px-5 py-1.5 text-[10px] flex items-center gap-3 ${d ? 'bg-zinc-900/50 text-zinc-400' : 'bg-zinc-50 text-zinc-500'}`}>
          <span className="font-semibold">Segment {hoveredSeg + 1}</span>
          <span>{formatShort(segments[hoveredSeg]?.start || 0)} → {formatShort(segments[hoveredSeg]?.end || 0)}</span>
          <span className="font-mono">({((segments[hoveredSeg]?.end || 0) - (segments[hoveredSeg]?.start || 0)).toFixed(1)}s)</span>
          {offsets[hoveredSeg] ? (
            <span className={`font-bold ${offsets[hoveredSeg] > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
              Offset: {offsets[hoveredSeg] > 0 ? '+' : ''}{offsets[hoveredSeg].toFixed(1)}s
            </span>
          ) : null}
          <span className="ml-auto opacity-60">Drag left/right to adjust timing</span>
        </div>
      )}
    </div>
  );
};

export default TimelineEditor;
