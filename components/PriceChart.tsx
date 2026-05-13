
import React, { useMemo, useState } from 'react';
import { PricePoint } from '../types';

interface PriceChartProps {
  data: PricePoint[];
  ticker: string;
  pastMonths: number;
  futureMonths: number;
}

export const PriceChart: React.FC<PriceChartProps> = ({ data, ticker, pastMonths, futureMonths }) => {
  const chartWidth = 400;
  const chartHeight = 180;
  const paddingLeft = 45; // Y축 눈금을 위한 왼쪽 여백
  const paddingBottom = 25; // X축 눈금을 위한 하단 여백
  const paddingTop = 20;

  const [hoveredPoint, setHoveredPoint] = useState<{x: number, y: number, date: string, price: number, isFuture: boolean, volume?: number} | null>(null);

  // 1. 날짜 파싱 및 시간순 정렬
  const filteredData = useMemo(() => {
    return (data || [])
      .filter(p => p && p.date && typeof p.price === 'number')
      .map(p => ({ ...p, time: new Date(p.date).getTime() }))
      .filter(p => !isNaN(p.time))
      .sort((a, b) => a.time - b.time);
  }, [data]);

  // 2. 스케일 및 눈금 계산
  const { pastPts, futurePts, minP, maxP, minT, maxT, todayX, yTicks, xTicks, nowTime, maxVol } = useMemo(() => {
    if (filteredData.length < 2) return { pastPts: '', futurePts: '', minP: 0, maxP: 0, minT: 0, maxT: 0, todayX: -1, yTicks: [], xTicks: [], nowTime: new Date().getTime(), maxVol: 0 };

    const prices = filteredData.map(d => d.price);
    const minP = Math.min(...prices) * 0.95;
    const maxP = Math.max(...prices) * 1.05;
    const priceRange = maxP - minP || 1; // Prevent division by zero

    const volumes = filteredData.map(d => d.volume || 0);
    const maxVol = Math.max(...volumes) || 1;

    const times = filteredData.map(d => d.time);
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const timeRange = maxT - minT || 1; // Prevent division by zero

    const getX = (time: number) => paddingLeft + ((time - minT) / timeRange) * (chartWidth - paddingLeft);
    const getY = (price: number) => (chartHeight - paddingBottom) - ((price - minP) / priceRange) * (chartHeight - paddingBottom - paddingTop);

    const nowTime = new Date().getTime();
    const pastPts = filteredData.filter(d => d.time <= nowTime).map(d => `${getX(d.time)},${getY(d.price)}`).join(' ');
    
    // 미래 선은 현재 시점(또는 가장 최근 과거 데이터)부터 시작하도록 연결
    const futureData = filteredData.filter(d => d.time >= nowTime);
    const lastPastData = filteredData.filter(d => d.time <= nowTime).pop();
    if (lastPastData && futureData.length > 0 && futureData[0].time !== lastPastData.time) {
      futureData.unshift(lastPastData);
    }
    const futurePts = futureData.map(d => `${getX(d.time)},${getY(d.price)}`).join(' ');

    // 오늘 날짜 위치
    const todayX = nowTime >= minT && nowTime <= maxT ? getX(nowTime) : -1;

    // Y축 눈금 (4개 지점)
    const yTicks = [0, 0.33, 0.66, 1].map(ratio => {
      const val = minP + priceRange * ratio;
      return { label: Math.round(val).toLocaleString(), y: getY(val) };
    });

    // X축 눈금 (시작, 중간, 끝)
    const xTicks = [0, 0.5, 1].map(ratio => {
      const time = minT + timeRange * ratio;
      const dateObj = new Date(time);
      return { 
        label: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`, 
        x: getX(time) 
      };
    });

    return { pastPts, futurePts, minP, maxP, minT, maxT, todayX, yTicks, xTicks, nowTime, maxVol };
  }, [filteredData]);

  if (filteredData.length < 2) {
    return (
      <div className="mt-6 p-8 bg-slate-50 rounded-[24px] border border-slate-200 text-center text-slate-400 font-bold">
        차트 데이터를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="mt-6 p-4 bg-slate-50 rounded-[24px] border border-slate-200 relative">
      <div className="flex items-center justify-between mb-4">
        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <span className="w-1.5 h-3 bg-rose-500 rounded-full"></span>
          데이터 기반 가격 추이 및 예측
        </h5>
        <div className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded text-[9px] font-black">
          {pastMonths}개월 실제 / {futureMonths}개월 예측
        </div>
      </div>

      <div className="relative h-[200px] w-full mb-4" onMouseLeave={() => setHoveredPoint(null)}>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible">
          {/* Y축 눈금선 및 라벨 */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={paddingLeft} y1={tick.y} x2={chartWidth} y2={tick.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />
              <text x={paddingLeft - 5} y={tick.y} fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="end" alignmentBaseline="middle">
                {tick.label}
              </text>
            </g>
          ))}

          {/* X축 눈금 라벨 */}
          {xTicks.map((tick, i) => (
            <text key={i} x={tick.x} y={chartHeight - 5} fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">
              {tick.label}
            </text>
          ))}
          
          {/* 오늘 수직선 */}
          {todayX !== -1 && (
            <g>
              <line x1={todayX} y1={paddingTop} x2={todayX} y2={chartHeight - paddingBottom} stroke="#fb7185" strokeWidth="1.5" strokeDasharray="4 4" />
              <rect x={todayX - 12} y={paddingTop - 12} width="24" height="10" rx="3" fill="#fb7185" />
              <text x={todayX} y={paddingTop - 5} fill="white" fontSize="6" fontWeight="black" textAnchor="middle">오늘</text>
            </g>
          )}

          {/* 미래 예측 영역 음영 */}
          {todayX !== -1 && (
            <rect x={todayX} y={paddingTop} width={chartWidth - todayX} height={chartHeight - paddingBottom - paddingTop} fill="#fb7185" fillOpacity="0.05" />
          )}

          {/* 거래량 바 */}
          {filteredData.map((d, i) => {
            if (!d.volume) return null;
            const timeRange = maxT - minT;
            const x = paddingLeft + ((d.time - minT) / timeRange) * (chartWidth - paddingLeft);
            const volHeight = (d.volume / maxVol) * 40; // 최대 40px 높이
            const y = chartHeight - paddingBottom - volHeight;
            const isFuture = d.time > nowTime || d.type === 'future';
            return (
              <rect
                key={`vol-${i}`}
                x={x - 2}
                y={y}
                width="4"
                height={volHeight}
                fill={isFuture ? '#fb7185' : '#94a3b8'}
                fillOpacity="0.3"
              />
            );
          })}

          {/* 주가 궤적 (과거) */}
          {pastPts && (
            <polyline
              fill="none"
              stroke="#1e293b"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={pastPts}
              className="drop-shadow-sm"
            />
          )}

          {/* 주가 궤적 (미래 예측) */}
          {futurePts && (
            <polyline
              fill="none"
              stroke="#fb7185"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 4"
              points={futurePts}
            />
          )}

          {/* 데이터 포인트 */}
          {filteredData.map((d, i) => {
            const timeRange = maxT - minT;
            const priceRange = maxP - minP;
            const x = paddingLeft + ((d.time - minT) / timeRange) * (chartWidth - paddingLeft);
            const y = (chartHeight - paddingBottom) - ((d.price - minP) / priceRange) * (chartHeight - paddingBottom - paddingTop);
            const isFuture = d.time > nowTime || d.type === 'future';
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="4"
                fill={isFuture ? '#fb7185' : '#1e293b'}
                stroke="white"
                strokeWidth="1.5"
                className="cursor-pointer transition-all duration-200 hover:r-6"
                onMouseEnter={() => setHoveredPoint({ x, y, date: d.date, price: d.price, isFuture, volume: d.volume })}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredPoint && (
          <div 
            className="absolute z-20 bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
            style={{ 
              left: `${(hoveredPoint.x / chartWidth) * 100}%`, 
              top: `calc(${(hoveredPoint.y / chartHeight) * 100}% - 8px)` 
            }}
          >
            <div className="font-bold">{hoveredPoint.date}</div>
            <div className={hoveredPoint.isFuture ? 'text-rose-400' : 'text-emerald-400'}>
              {hoveredPoint.price.toLocaleString()}
            </div>
            {hoveredPoint.volume && (
              <div className="text-slate-400 text-[9px]">거래량: {hoveredPoint.volume.toLocaleString()}</div>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-center gap-6 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-800"></span>
          <span className="text-[9px] font-black text-slate-500">실제 기록</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          <span className="text-[9px] font-black text-slate-500">AI 예측</span>
        </div>
      </div>
    </div>
  );
};
