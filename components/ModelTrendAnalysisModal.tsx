import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { X, Activity, TrendingUp, Target, Clock, CheckCircle, ArrowUpRight, ArrowDownRight, Minus, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { PredictionHistoryItem } from '../types';

interface ModelTrendAnalysisModalProps {
  modelId: string;
  onClose: () => void;
  modelStats: Record<string, { total: number; correct: number }>;
  history: (PredictionHistoryItem & { ruleId: string })[];
}

export const ModelTrendAnalysisModal: React.FC<ModelTrendAnalysisModalProps> = ({
  modelId,
  onClose,
  modelStats,
  history,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [isDraggingStart, setIsDraggingStart] = useState(false);
  const [isDraggingEnd, setIsDraggingEnd] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const rangeInitialized = useRef(false);

  // 从 history 中提取该模型的已验证预测，按时间正序
  const modelHistory = useMemo(() => {
    return history
      .filter(h => h.resolved && h.detectedCycle === modelId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [history, modelId]);

  // 计算累计胜率和近期胜率数据点
  const chartData = useMemo(() => {
    let cumCorrect = 0;
    let cumTotal = 0;
    const windowSize = 10;
    const recentWindow: boolean[] = [];

    return modelHistory.map((h) => {
      const isCorrect = !!(h.isParityCorrect || h.isSizeCorrect);
      cumTotal++;
      if (isCorrect) cumCorrect++;

      recentWindow.push(isCorrect);
      if (recentWindow.length > windowSize) recentWindow.shift();

      const cumulativeWinRate = (cumCorrect / cumTotal) * 100;
      const recentCorrect = recentWindow.filter(Boolean).length;
      const recentWinRate = (recentCorrect / recentWindow.length) * 100;

      return {
        index: cumTotal,
        cumulativeWinRate: Math.round(cumulativeWinRate * 10) / 10,
        recentWinRate: Math.round(recentWinRate * 10) / 10,
        isCorrect,
        timestamp: h.timestamp,
      };
    });
  }, [modelHistory]);

  // 初始化范围：默认显示最近50条或全部（取较小值）
  useEffect(() => {
    if (chartData.length > 0 && !rangeInitialized.current) {
      rangeInitialized.current = true;
      const defaultVisible = 50;
      if (chartData.length <= defaultVisible) {
        setRangeStart(0);
        setRangeEnd(chartData.length - 1);
      } else {
        setRangeStart(chartData.length - defaultVisible);
        setRangeEnd(chartData.length - 1);
      }
    }
  }, [chartData.length]);

  // 可见数据切片
  const visibleData = useMemo(() => {
    return chartData.slice(rangeStart, rangeEnd + 1);
  }, [chartData, rangeStart, rangeEnd]);

  // 统计数据
  const stats = modelStats[modelId] || { total: 0, correct: 0 };
  const winRate = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const lastCumWinRate = chartData.length > 0 ? chartData[chartData.length - 1].cumulativeWinRate : 0;
  const lastRecentWinRate = chartData.length > 0 ? chartData[chartData.length - 1].recentWinRate : 0;

  // 趋势判断
  const trendDirection = useMemo(() => {
    if (chartData.length < 5) return 'stable';
    const recent5 = chartData.slice(-5);
    const first = recent5[0].cumulativeWinRate;
    const last = recent5[recent5.length - 1].cumulativeWinRate;
    if (last - first > 2) return 'up';
    if (first - last > 2) return 'down';
    return 'stable';
  }, [chartData]);

  // SVG chart dimensions
  const svgWidth = 600;
  const svgHeight = 260;
  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = svgHeight - padding.top - padding.bottom;

  // Build SVG path from data points
  const buildPath = (data: { x: number; y: number }[]): string => {
    if (data.length === 0) return '';
    return data.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  };

  // 基于可见数据计算坐标点
  const { cumulativePoints, recentPoints } = useMemo(() => {
    const count = visibleData.length;
    const cumPts = visibleData.map((d, i) => ({
      x: padding.left + (count > 1 ? (i / (count - 1)) * chartW : chartW / 2),
      y: padding.top + chartH - (d.cumulativeWinRate / 100) * chartH,
    }));
    const recPts = visibleData.map((d, i) => ({
      x: padding.left + (count > 1 ? (i / (count - 1)) * chartW : chartW / 2),
      y: padding.top + chartH - (d.recentWinRate / 100) * chartH,
    }));
    return { cumulativePoints: cumPts, recentPoints: recPts };
  }, [visibleData, chartW, chartH, padding.left, padding.top]);

  const hoveredData = hoveredIndex !== null ? visibleData[hoveredIndex] : null;
  const hoveredX = hoveredIndex !== null ? cumulativePoints[hoveredIndex]?.x : null;

  // 范围快捷按钮
  const setRange = useCallback((count: number | 'all') => {
    if (count === 'all') {
      setRangeStart(0);
      setRangeEnd(chartData.length - 1);
    } else {
      const start = Math.max(0, chartData.length - count);
      setRangeStart(start);
      setRangeEnd(chartData.length - 1);
    }
    setHoveredIndex(null);
  }, [chartData.length]);

  // 范围选择器滑块
  const sliderBarRef = useRef<SVGRectElement>(null);

  const getSliderX = useCallback((index: number) => {
    if (chartData.length <= 1) return padding.left;
    return padding.left + (index / (chartData.length - 1)) * chartW;
  }, [chartData.length, chartW, padding.left]);

  // 拖拽处理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!svgRef.current || (!isDraggingStart && !isDraggingEnd)) return;

      const rect = svgRef.current.getBoundingClientRect();
      const svgX = (e.clientX - rect.left) * (svgWidth / rect.width);
      const relativeX = Math.max(0, Math.min(1, (svgX - padding.left) / chartW));
      const newIndex = Math.round(relativeX * (chartData.length - 1));

      if (isDraggingStart) {
        setRangeStart(Math.max(0, Math.min(newIndex, rangeEnd - 1)));
      } else if (isDraggingEnd) {
        setRangeEnd(Math.max(rangeStart + 1, Math.min(newIndex, chartData.length - 1)));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingStart(false);
      setIsDraggingEnd(false);
    };

    if (isDraggingStart || isDraggingEnd) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingStart, isDraggingEnd, rangeStart, rangeEnd, chartData.length, chartW, padding.left, svgWidth]);

  // 缩小显示范围（放大视图）
  const zoomIn = useCallback(() => {
    const currentRange = rangeEnd - rangeStart;
    if (currentRange <= 5) return;
    const shrink = Math.max(1, Math.floor(currentRange * 0.2));
    setRangeStart(prev => Math.min(prev + shrink, rangeEnd - 2));
    setRangeEnd(prev => Math.max(prev - shrink, rangeStart + 2));
  }, [rangeStart, rangeEnd]);

  // 扩大显示范围（缩小视图）
  const zoomOut = useCallback(() => {
    const expand = Math.max(1, Math.floor((rangeEnd - rangeStart) * 0.3));
    setRangeStart(prev => Math.max(0, prev - expand));
    setRangeEnd(prev => Math.min(chartData.length - 1, prev + expand));
  }, [rangeStart, rangeEnd, chartData.length]);

  // 可见范围内的统计
  const visibleStats = useMemo(() => {
    if (visibleData.length === 0) return { correct: 0, total: 0, winRate: 0 };
    const correct = visibleData.filter(d => d.isCorrect).length;
    return {
      correct,
      total: visibleData.length,
      winRate: Math.round((correct / visibleData.length) * 100),
    };
  }, [visibleData]);

  // 范围滑块高度
  const sliderY = svgHeight - 18;
  const sliderH = 12;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-3xl p-8 max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-black text-gray-900 flex items-center">
            <Activity className="w-6 h-6 mr-2 text-purple-600" />
            {modelId} - 性能趋势分析
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-2xl border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-black text-blue-600 uppercase tracking-wider">总预测</span>
            </div>
            <p className="text-3xl font-black text-blue-900">{stats.total}</p>
            <p className="text-xs text-blue-600 mt-1">正确 {stats.correct} 场</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-4 rounded-2xl border border-emerald-100">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">累计胜率</span>
            </div>
            <p className="text-3xl font-black text-emerald-900">{winRate}%</p>
            <div className="mt-1 bg-white/50 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all"
                style={{ width: `${winRate}%` }}
              />
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-2xl border border-purple-100">
            <div className="flex items-center justify-between mb-2">
              <Target className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-black text-purple-600 uppercase tracking-wider">近10场胜率</span>
            </div>
            <div className="flex items-center space-x-2">
              <p className="text-3xl font-black text-purple-900">{Math.round(lastRecentWinRate)}%</p>
              {trendDirection === 'up' && <ArrowUpRight className="w-5 h-5 text-green-500" />}
              {trendDirection === 'down' && <ArrowDownRight className="w-5 h-5 text-red-500" />}
              {trendDirection === 'stable' && <Minus className="w-5 h-5 text-gray-400" />}
            </div>
            <p className="text-xs text-purple-600 mt-1">
              {trendDirection === 'up' ? '趋势上升' : trendDirection === 'down' ? '趋势下降' : '趋势稳定'}
            </p>
          </div>
        </div>

        {/* SVG Trend Chart */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-bold text-gray-800 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-indigo-600" />
              胜率变化趋势
            </h4>
            <div className="flex items-center space-x-4 text-xs">
              <span className="flex items-center space-x-1">
                <span className="w-3 h-0.5 bg-indigo-500 rounded inline-block" />
                <span className="text-gray-500 font-bold">累计胜率</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-0.5 bg-orange-400 rounded inline-block" />
                <span className="text-gray-500 font-bold">近10场胜率</span>
              </span>
            </div>
          </div>

          {/* Range Controls */}
          {chartData.length > 1 && (
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">范围:</span>
                {[
                  { label: '近30', count: 30 },
                  { label: '近50', count: 50 },
                  { label: '近100', count: 100 },
                  { label: '近200', count: 200 },
                  { label: '全部', count: 'all' as const },
                ].filter(opt => opt.count === 'all' || (typeof opt.count === 'number' && chartData.length > opt.count * 0.5)).map(opt => {
                  const isActive = opt.count === 'all'
                    ? rangeStart === 0 && rangeEnd === chartData.length - 1
                    : typeof opt.count === 'number' && rangeStart === Math.max(0, chartData.length - opt.count) && rangeEnd === chartData.length - 1;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => setRange(opt.count)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={zoomIn} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all" title="放大">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button onClick={zoomOut} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all" title="缩小">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setRange('all')} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all" title="查看全部">
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {chartData.length > 1 ? (
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-auto"
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Y-axis grid lines and labels */}
                {[0, 25, 50, 75, 100].map(val => {
                  const y = padding.top + chartH - (val / 100) * chartH;
                  return (
                    <g key={val}>
                      <line
                        x1={padding.left} y1={y}
                        x2={svgWidth - padding.right} y2={y}
                        stroke={val === 50 ? '#94a3b8' : '#e2e8f0'}
                        strokeWidth={val === 50 ? 1 : 0.5}
                        strokeDasharray={val === 50 ? '4,4' : 'none'}
                      />
                      <text
                        x={padding.left - 8} y={y + 4}
                        textAnchor="end"
                        className="text-[10px]"
                        fill="#94a3b8"
                        fontWeight="bold"
                      >
                        {val}%
                      </text>
                    </g>
                  );
                })}

                {/* X-axis labels */}
                {visibleData.length > 0 && (() => {
                  const step = Math.max(1, Math.floor(visibleData.length / 6));
                  const indices: number[] = [];
                  for (let i = 0; i < visibleData.length; i += step) indices.push(i);
                  if (indices[indices.length - 1] !== visibleData.length - 1) indices.push(visibleData.length - 1);
                  return indices.map(i => (
                    <text
                      key={i}
                      x={cumulativePoints[i].x}
                      y={svgHeight - 28}
                      textAnchor="middle"
                      className="text-[9px]"
                      fill="#94a3b8"
                      fontWeight="bold"
                    >
                      #{visibleData[i].index}
                    </text>
                  ));
                })()}

                {/* Cumulative win rate line */}
                <path
                  d={buildPath(cumulativePoints)}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Recent win rate line */}
                <path
                  d={buildPath(recentPoints)}
                  fill="none"
                  stroke="#fb923c"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="4,2"
                />

                {/* Hover interaction areas */}
                {visibleData.map((_, i) => (
                  <rect
                    key={i}
                    x={cumulativePoints[i].x - (visibleData.length > 1 ? chartW / (visibleData.length - 1) / 2 : 10)}
                    y={padding.top}
                    width={visibleData.length > 1 ? chartW / (visibleData.length - 1) : 20}
                    height={chartH}
                    fill="transparent"
                    onMouseEnter={() => setHoveredIndex(i)}
                  />
                ))}

                {/* Hover indicator */}
                {hoveredIndex !== null && hoveredX !== null && (
                  <>
                    <line
                      x1={hoveredX} y1={padding.top}
                      x2={hoveredX} y2={padding.top + chartH}
                      stroke="#6366f1"
                      strokeWidth="1"
                      strokeDasharray="3,3"
                      opacity="0.5"
                    />
                    <circle
                      cx={cumulativePoints[hoveredIndex].x}
                      cy={cumulativePoints[hoveredIndex].y}
                      r="4"
                      fill="#6366f1"
                      stroke="white"
                      strokeWidth="2"
                    />
                    <circle
                      cx={recentPoints[hoveredIndex].x}
                      cy={recentPoints[hoveredIndex].y}
                      r="4"
                      fill="#fb923c"
                      stroke="white"
                      strokeWidth="2"
                    />
                  </>
                )}

                {/* Range Slider */}
                {chartData.length > 2 && (
                  <g>
                    {/* Slider background */}
                    <rect
                      ref={sliderBarRef}
                      x={padding.left}
                      y={sliderY}
                      width={chartW}
                      height={sliderH}
                      fill="#e2e8f0"
                      rx="6"
                    />
                    {/* Selected range */}
                    <rect
                      x={getSliderX(rangeStart)}
                      y={sliderY}
                      width={Math.max(0, getSliderX(rangeEnd) - getSliderX(rangeStart))}
                      height={sliderH}
                      fill="#6366f1"
                      opacity="0.25"
                      rx="6"
                    />
                    {/* Left handle */}
                    <g
                      onMouseDown={(e) => { e.stopPropagation(); setIsDraggingStart(true); }}
                      style={{ cursor: 'ew-resize' }}
                    >
                      <rect
                        x={getSliderX(rangeStart) - 6}
                        y={sliderY - 3}
                        width="12"
                        height={sliderH + 6}
                        fill="#6366f1"
                        rx="4"
                        className="hover:fill-indigo-700 transition-colors"
                      />
                      <line
                        x1={getSliderX(rangeStart) - 1.5} y1={sliderY + 2}
                        x2={getSliderX(rangeStart) - 1.5} y2={sliderY + sliderH - 2}
                        stroke="white" strokeWidth="1.5" strokeLinecap="round"
                      />
                      <line
                        x1={getSliderX(rangeStart) + 1.5} y1={sliderY + 2}
                        x2={getSliderX(rangeStart) + 1.5} y2={sliderY + sliderH - 2}
                        stroke="white" strokeWidth="1.5" strokeLinecap="round"
                      />
                    </g>
                    {/* Right handle */}
                    <g
                      onMouseDown={(e) => { e.stopPropagation(); setIsDraggingEnd(true); }}
                      style={{ cursor: 'ew-resize' }}
                    >
                      <rect
                        x={getSliderX(rangeEnd) - 6}
                        y={sliderY - 3}
                        width="12"
                        height={sliderH + 6}
                        fill="#6366f1"
                        rx="4"
                        className="hover:fill-indigo-700 transition-colors"
                      />
                      <line
                        x1={getSliderX(rangeEnd) - 1.5} y1={sliderY + 2}
                        x2={getSliderX(rangeEnd) - 1.5} y2={sliderY + sliderH - 2}
                        stroke="white" strokeWidth="1.5" strokeLinecap="round"
                      />
                      <line
                        x1={getSliderX(rangeEnd) + 1.5} y1={sliderY + 2}
                        x2={getSliderX(rangeEnd) + 1.5} y2={sliderY + sliderH - 2}
                        stroke="white" strokeWidth="1.5" strokeLinecap="round"
                      />
                    </g>
                  </g>
                )}
              </svg>

              {/* Hover tooltip + Range info */}
              <div className="mt-2 space-y-1">
                {hoveredData ? (
                  <div className="flex items-center justify-center space-x-6 text-xs font-bold">
                    <span className="text-gray-500">第 {hoveredData.index} 场</span>
                    <span className="text-indigo-600">累计: {hoveredData.cumulativeWinRate}%</span>
                    <span className="text-orange-500">近期: {hoveredData.recentWinRate}%</span>
                    <span className={hoveredData.isCorrect ? 'text-green-600' : 'text-red-500'}>
                      {hoveredData.isCorrect ? '正确' : '错误'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-4 text-[10px] font-bold text-gray-400">
                    <span>显示: 第 {visibleData[0]?.index ?? '-'} ~ {visibleData[visibleData.length - 1]?.index ?? '-'} 场</span>
                    <span className="text-gray-300">|</span>
                    <span>共 {visibleData.length} 个数据点 / 总 {chartData.length} 场</span>
                    <span className="text-gray-300">|</span>
                    <span>可见范围胜率: <span className="text-indigo-600">{visibleStats.winRate}%</span> ({visibleStats.correct}/{visibleStats.total})</span>
                  </div>
                )}
              </div>
            </div>
          ) : chartData.length === 1 ? (
            <div className="py-8 text-center bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-sm font-bold text-gray-500">仅 1 条记录，至少需要 2 条才能绘制趋势</p>
              <p className="text-xs text-gray-400 mt-1">
                第1场: {chartData[0].isCorrect ? '正确' : '错误'} · 累计胜率 {chartData[0].cumulativeWinRate}%
              </p>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-2xl border border-gray-100">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">暂无已验证的预测数据</p>
              <p className="text-xs mt-1">开始预测并等待验证后将显示趋势分析</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-sm font-black uppercase transition-all bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
