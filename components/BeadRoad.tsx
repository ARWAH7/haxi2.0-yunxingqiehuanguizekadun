
import React, { useMemo, useRef, useEffect, memo } from 'react';
import { BlockData, IntervalRule } from '../types';
import { calculateBeadGrid } from '../utils/helpers';
import { Flame } from 'lucide-react';

interface BeadRoadProps {
  blocks: BlockData[];
  mode: 'parity' | 'size';
  rule?: IntervalRule; // Pass the active rule for better alignment logic
  title?: string;
  rows?: number;
}

const BeadRoad: React.FC<BeadRoadProps> = memo(({ blocks, mode, rule, title, rows = 6 }) => {
  const grid = useMemo(() => {
    return calculateBeadGrid(
      blocks, 
      mode === 'parity' ? 'type' : 'sizeType', 
      rows,
      rule?.value || 1,
      rule?.startBlock || 0
    );
  }, [blocks, mode, rows, rule]);

  // 计算网格的唯一标识符，用于强制重新渲染
  const gridKey = useMemo(() => {
    // ⚡ 只调用一次 flat()，从后向前遍历替代 reverse + find
    const flatGrid = grid.flat();
    const firstCell = flatGrid.find(cell => cell.blockHeight);
    let lastCell: typeof firstCell = undefined;
    for (let i = flatGrid.length - 1; i >= 0; i--) {
      if (flatGrid[i].blockHeight) { lastCell = flatGrid[i]; break; }
    }
    const key = `${firstCell?.blockHeight || 'empty'}-${lastCell?.blockHeight || 'empty'}`;

    if (process.env.NODE_ENV === 'development') {
      console.log(`[BeadRoad] 🔑 Grid Key: ${key} (第一个: ${firstCell?.blockHeight}, 最后一个: ${lastCell?.blockHeight})`);
    }

    return key;
  }, [grid]);

  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstDataLoad = useRef(true);
  const lastBlocksCount = useRef(blocks.length);

  // Intelligent Scroll Logic
  useEffect(() => {
    const container = containerRef.current;
    if (!container || blocks.length === 0) return;

    const scrollToEnd = () => {
      if (container) {
        container.scrollLeft = container.scrollWidth;
      }
    };

    const BUFFER = 60;
    const isAtEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - BUFFER;

    // Handle initial load specifically when blocks are first populated
    if (isFirstDataLoad.current) {
      scrollToEnd();
      const raf = requestAnimationFrame(() => {
        scrollToEnd();
        setTimeout(scrollToEnd, 150);
      });
      isFirstDataLoad.current = false;
      lastBlocksCount.current = blocks.length;
      return () => cancelAnimationFrame(raf);
    } 

    if (blocks.length > lastBlocksCount.current) {
      if (isAtEnd) {
        scrollToEnd();
      }
      lastBlocksCount.current = blocks.length;
    }
  }, [grid, blocks.length]);

  // Calculate current streak
  const streakInfo = useMemo(() => {
    if (blocks.length === 0) return null;
    const sorted = [...blocks].sort((a, b) => b.height - a.height);
    const key = mode === 'parity' ? 'type' : 'sizeType';
    const firstVal = sorted[0][key];
    let count = 0;
    for (const b of sorted) {
      if (b[key] === firstVal) count++;
      else break;
    }
    
    const labelMap: Record<string, string> = {
      'ODD': '单', 'EVEN': '双', 'BIG': '大', 'SMALL': '小'
    };
    
    const colorMap: Record<string, string> = {
      'ODD': 'var(--color-odd)', 'EVEN': 'var(--color-even)', 
      'BIG': 'var(--color-big)', 'SMALL': 'var(--color-small)'
    };

    return {
      label: labelMap[firstVal as string],
      count,
      color: colorMap[firstVal as string]
    };
  }, [blocks, mode]);

  const stats = useMemo(() => {
    if (mode === 'parity') {
      const odd = blocks.filter(b => b.type === 'ODD').length;
      return {
        labelA: '单', countA: odd, colorVarA: 'var(--color-odd)',
        labelB: '双', countB: blocks.length - odd, colorVarB: 'var(--color-even)'
      };
    } else {
      const big = blocks.filter(b => b.sizeType === 'BIG').length;
      return {
        labelA: '大', countA: big, colorVarA: 'var(--color-big)',
        labelB: '小', countB: blocks.length - big, colorVarB: 'var(--color-small)'
      };
    }
  }, [blocks, mode]);

  const renderCell = (type: any, value: number | undefined, blockHeight: number | undefined, colIdx: number, rowIdx: number) => {
    if (!type) return <div key={`${colIdx}-${rowIdx}`} className="w-8 h-8 border-r border-b border-gray-100/30 shrink-0" />;
    
    const isParity = mode === 'parity';
    const label = isParity ? (type === 'ODD' ? '单' : '双') : (type === 'BIG' ? '大' : '小');
    const colorVar = isParity 
      ? (type === 'ODD' ? 'var(--color-odd)' : 'var(--color-even)')
      : (type === 'BIG' ? 'var(--color-big)' : 'var(--color-small)');

    return (
      <div 
        key={`${colIdx}-${rowIdx}`} 
        className="w-8 h-8 border-r border-b border-gray-100/30 flex items-center justify-center relative group shrink-0"
      >
        <div 
          style={{ backgroundColor: colorVar }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-sm transition-transform group-hover:scale-110"
        >
          {label}
        </div>
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none font-bold whitespace-nowrap">
          {blockHeight ? `Block #${blockHeight}` : value}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 flex flex-col h-fit overflow-hidden">
      <div className="flex justify-between items-center mb-3 px-1 shrink-0">
        <div className="flex flex-col">
          <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">
            {title || (mode === 'parity' ? '单双珠盘路' : '大小珠盘路')}
          </h3>
          {streakInfo && streakInfo.count >= 2 && (
            <div className="flex items-center mt-1 space-x-1 animate-in fade-in slide-in-from-left-2 duration-300">
              <Flame className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="text-[10px] font-black text-gray-800">
                当前: <span style={{ color: streakInfo.color }}>{streakInfo.label}</span> {streakInfo.count}连
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-3 text-[10px] font-black">
          <div className="flex items-center space-x-1.5">
            <span style={{ backgroundColor: stats.colorVarA }} className="w-4 h-4 rounded flex items-center justify-center text-white text-[9px]">{stats.labelA}</span>
            <span className="text-gray-500 tabular-nums">{stats.countA}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span style={{ backgroundColor: stats.colorVarB }} className="w-4 h-4 rounded flex items-center justify-center text-white text-[9px]">{stats.labelB}</span>
            <span className="text-gray-500 tabular-nums">{stats.countB}</span>
          </div>
        </div>
      </div>

      <div className="flex h-auto min-h-0">
        {/* Row numbers on the left */}
        <div className="flex flex-col border-r border-gray-100 bg-gray-50/50 shrink-0">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="w-8 h-8 flex items-center justify-center text-[10px] font-black text-gray-300 border-b border-gray-100/30">
              {i + 1}
            </div>
          ))}
        </div>
        
        <div 
          ref={containerRef}
          className="overflow-x-auto custom-scrollbar border border-gray-100 bg-gray-50/20 flex-1"
        >
          <div className="flex h-max w-max pr-2" key={gridKey}>
            {grid.map((column, colIdx) => {
              // Generate stable key based on first non-null cell's blockHeight
              const firstNonNullCell = column.find(cell => cell.type !== null);
              const columnKey = firstNonNullCell?.blockHeight 
                ? `col-${firstNonNullCell.blockHeight}` 
                : `empty-${colIdx}`;
              
              return (
                <div key={columnKey} className="flex flex-col">
                  {column.map((cell, rowIdx) => renderCell(cell.type, cell.value, cell.blockHeight, colIdx, rowIdx))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

BeadRoad.displayName = 'BeadRoad';

// ✅ React.memo 优化：只有当 blocks、mode、rule、rows 改变时才重新渲染
export default memo(BeadRoad, (prevProps, nextProps) => {
  return (
    prevProps.blocks === nextProps.blocks &&
    prevProps.mode === nextProps.mode &&
    prevProps.rule?.id === nextProps.rule?.id &&
    prevProps.rows === nextProps.rows &&
    prevProps.title === nextProps.title
  );
});
