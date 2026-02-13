import React, { useState, useRef, useEffect, memo, useMemo, useCallback } from 'react';

interface ChartDataPoint {
  count: number;
  winRate: number;
}

interface InteractiveChartProps {
  data: ChartDataPoint[];
  width?: number;
  height?: number;
}

export const InteractiveChart: React.FC<InteractiveChartProps> = memo(({
  data,
  width = 800,
  height = 400
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(Math.min(49, data.length - 1)); // 默认显示前50个数据点
  const [isDraggingStart, setIsDraggingStart] = useState(false);
  const [isDraggingEnd, setIsDraggingEnd] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const padding = { top: 40, right: 60, bottom: 80, left: 70 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // ⚡ 缓存可见数据切片和统计值
  const visibleData = useMemo(() => data.slice(rangeStart, rangeEnd + 1), [data, rangeStart, rangeEnd]);
  const { maxCount, minCount } = useMemo(() => ({
    maxCount: Math.max(...visibleData.map(d => d.count)),
    minCount: Math.min(...visibleData.map(d => d.count))
  }), [visibleData]);

  // ⚡ 缓存比例尺函数
  const xScale = useCallback((index: number) => {
    const relativeIndex = index - rangeStart;
    return padding.left + (relativeIndex / (rangeEnd - rangeStart)) * innerWidth;
  }, [rangeStart, rangeEnd, innerWidth]);

  const yScale = useCallback((rate: number) => {
    return padding.top + innerHeight - (rate / 100) * innerHeight;
  }, [innerHeight]);

  // ⚡ 缓存路径生成
  const { linePath, areaPath } = useMemo(() => {
    const line = visibleData.map((d, i) => {
      const x = xScale(i + rangeStart);
      const y = yScale(d.winRate);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    const area = `${line} L ${xScale(rangeEnd)} ${padding.top + innerHeight} L ${xScale(rangeStart)} ${padding.top + innerHeight} Z`;

    return { linePath: line, areaPath: area };
  }, [visibleData, xScale, yScale, rangeStart, rangeEnd, innerHeight]);

  // ⚡ 缓存刻度计算
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const tickCount = Math.min(10, rangeEnd - rangeStart + 1);
    const tickStep = Math.max(1, Math.floor((rangeEnd - rangeStart) / tickCount));

    for (let i = rangeStart; i <= rangeEnd; i += tickStep) {
      ticks.push(i);
    }
    if (!ticks.includes(rangeEnd)) {
      ticks.push(rangeEnd);
    }
    return ticks;
  }, [rangeStart, rangeEnd]);

  // Y轴刻度（胜率百分比）
  const yTicks = [0, 25, 50, 75, 100];

  // 处理鼠标移动
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    if (x < padding.left || x > width - padding.right) {
      setHoveredPoint(null);
      return;
    }

    // 找到最近的数据点
    const relativeX = (x - padding.left) / innerWidth;
    const dataIndex = Math.round(relativeX * (rangeEnd - rangeStart)) + rangeStart;
    
    if (dataIndex >= rangeStart && dataIndex <= rangeEnd) {
      setHoveredPoint(dataIndex);
    }
  };

  // 范围选择器相关
  const sliderY = height - 40;
  const sliderHeight = 20;
  
  const getSliderX = (index: number) => {
    return padding.left + (index / (data.length - 1)) * innerWidth;
  };

  const handleSliderMouseDown = (isStart: boolean) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStart) {
      setIsDraggingStart(true);
    } else {
      setIsDraggingEnd(true);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!svgRef.current || (!isDraggingStart && !isDraggingEnd)) return;
      
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const relativeX = Math.max(0, Math.min(1, (x - padding.left) / innerWidth));
      const newIndex = Math.round(relativeX * (data.length - 1));
      
      if (isDraggingStart) {
        setRangeStart(Math.max(0, Math.min(newIndex, rangeEnd - 1)));
      } else if (isDraggingEnd) {
        setRangeEnd(Math.max(rangeStart + 1, Math.min(newIndex, data.length - 1)));
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
  }, [isDraggingStart, isDraggingEnd, rangeStart, rangeEnd, data.length, innerWidth, padding.left]);

  return (
    <div className="relative">
      <svg 
        ref={svgRef}
        width={width} 
        height={height} 
        className="mx-auto"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPoint(null)}
      >
        {/* 背景网格 */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f3f4f6" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect 
          x={padding.left} 
          y={padding.top} 
          width={innerWidth} 
          height={innerHeight} 
          fill="url(#grid)" 
        />

        {/* Y轴网格线和标签 */}
        {yTicks.map(tick => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 15}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill="#6b7280"
                fontWeight="500"
              >
                {tick}%
              </text>
            </g>
          );
        })}

        {/* X轴刻度和标签 */}
        {xTicks.map(tick => {
          const x = xScale(tick);
          return (
            <g key={tick}>
              <line
                x1={x}
                y1={padding.top + innerHeight}
                x2={x}
                y2={padding.top + innerHeight + 6}
                stroke="#9ca3af"
                strokeWidth="2"
              />
              <text
                x={x}
                y={padding.top + innerHeight + 20}
                textAnchor="middle"
                fontSize="11"
                fill="#6b7280"
                fontWeight="600"
              >
                {data[tick].count}
              </text>
            </g>
          );
        })}

        {/* 填充区域 */}
        <path
          d={areaPath}
          fill="url(#gradient)"
          opacity="0.2"
        />
        
        {/* 渐变定义 */}
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* 曲线 */}
        <path
          d={linePath}
          fill="none"
          stroke="#10b981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 数据点 */}
        {visibleData.map((d, i) => {
          const actualIndex = i + rangeStart;
          const x = xScale(actualIndex);
          const y = yScale(d.winRate);
          const isHovered = hoveredPoint === actualIndex;
          
          return (
            <circle
              key={actualIndex}
              cx={x}
              cy={y}
              r={isHovered ? 6 : 4}
              fill="#10b981"
              stroke="white"
              strokeWidth="2"
              className="transition-all cursor-pointer"
              style={{ filter: isHovered ? 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.6))' : 'none' }}
            />
          );
        })}

        {/* 悬停提示 */}
        {hoveredPoint !== null && (
          <g>
            <line
              x1={xScale(hoveredPoint)}
              y1={padding.top}
              x2={xScale(hoveredPoint)}
              y2={padding.top + innerHeight}
              stroke="#10b981"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.5"
            />
            <foreignObject
              x={xScale(hoveredPoint) - 60}
              y={yScale(data[hoveredPoint].winRate) - 60}
              width="120"
              height="50"
            >
              <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs font-bold">
                <div className="text-emerald-300">预测次数: {data[hoveredPoint].count}</div>
                <div className="text-white mt-1">胜率: {data[hoveredPoint].winRate}%</div>
              </div>
            </foreignObject>
          </g>
        )}

        {/* 坐标轴 */}
        <line
          x1={padding.left}
          y1={padding.top + innerHeight}
          x2={width - padding.right}
          y2={padding.top + innerHeight}
          stroke="#374151"
          strokeWidth="2"
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + innerHeight}
          stroke="#374151"
          strokeWidth="2"
        />

        {/* 轴标签 */}
        <text
          x={width / 2}
          y={padding.top + innerHeight + 45}
          textAnchor="middle"
          fontSize="14"
          fill="#374151"
          fontWeight="700"
        >
          预测次数
        </text>
        <text
          x={25}
          y={height / 2}
          textAnchor="middle"
          fontSize="14"
          fill="#374151"
          fontWeight="700"
          transform={`rotate(-90, 25, ${height / 2})`}
        >
          胜率 (%)
        </text>

        {/* 范围选择器 */}
        <g>
          {/* 选择器背景 */}
          <rect
            x={padding.left}
            y={sliderY}
            width={innerWidth}
            height={sliderHeight}
            fill="#e5e7eb"
            rx="10"
          />
          
          {/* 选中范围 */}
          <rect
            x={getSliderX(rangeStart)}
            y={sliderY}
            width={getSliderX(rangeEnd) - getSliderX(rangeStart)}
            height={sliderHeight}
            fill="#6366f1"
            opacity="0.3"
            rx="10"
          />
          
          {/* 左侧滑块 */}
          <g
            onMouseDown={handleSliderMouseDown(true)}
            className="cursor-ew-resize"
          >
            <rect
              x={getSliderX(rangeStart) - 8}
              y={sliderY - 5}
              width="16"
              height={sliderHeight + 10}
              fill="#6366f1"
              rx="8"
              className="hover:fill-indigo-700 transition-colors"
              style={{ cursor: 'ew-resize' }}
            />
            <line
              x1={getSliderX(rangeStart) - 2}
              y1={sliderY + 3}
              x2={getSliderX(rangeStart) - 2}
              y2={sliderY + sliderHeight - 3}
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1={getSliderX(rangeStart) + 2}
              y1={sliderY + 3}
              x2={getSliderX(rangeStart) + 2}
              y2={sliderY + sliderHeight - 3}
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
          
          {/* 右侧滑块 */}
          <g
            onMouseDown={handleSliderMouseDown(false)}
            className="cursor-ew-resize"
          >
            <rect
              x={getSliderX(rangeEnd) - 8}
              y={sliderY - 5}
              width="16"
              height={sliderHeight + 10}
              fill="#6366f1"
              rx="8"
              className="hover:fill-indigo-700 transition-colors"
              style={{ cursor: 'ew-resize' }}
            />
            <line
              x1={getSliderX(rangeEnd) - 2}
              y1={sliderY + 3}
              x2={getSliderX(rangeEnd) - 2}
              y2={sliderY + sliderHeight - 3}
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1={getSliderX(rangeEnd) + 2}
              y1={sliderY + 3}
              x2={getSliderX(rangeEnd) + 2}
              y2={sliderY + sliderHeight - 3}
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        </g>
      </svg>
      
      {/* 范围信息 */}
      <div className="flex justify-center items-center space-x-4 mt-2 text-xs text-gray-600">
        <span className="font-semibold">
          显示范围: 第 {data[rangeStart].count} 次 - 第 {data[rangeEnd].count} 次
        </span>
        <span className="text-gray-400">|</span>
        <span>
          共 {rangeEnd - rangeStart + 1} 个数据点
        </span>
      </div>
    </div>
  );
});
