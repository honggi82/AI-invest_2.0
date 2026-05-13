
import React from 'react';
import { Market } from '../types';

interface MarketToggleProps {
  selected: Market;
  onChange: (market: Market) => void;
}

export const MarketToggle: React.FC<MarketToggleProps> = ({ selected, onChange }) => {
  return (
    <div className="flex bg-slate-100/80 p-1.5 rounded-2xl w-fit border border-slate-200/60 shadow-inner">
      <button
        onClick={() => onChange(Market.KR)}
        className={`px-4 py-2 sm:px-6 sm:py-2.5 rounded-xl text-sm sm:text-base font-black transition-all duration-200 flex items-center gap-2 ${
          selected === Market.KR
            ? 'bg-white text-indigo-600 shadow-md ring-1 ring-black/5'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
        }`}
      >
        <span className="text-lg sm:text-xl leading-none">🇰🇷</span>
        <span>한국 시장</span>
      </button>
      <button
        onClick={() => onChange(Market.US)}
        className={`px-4 py-2 sm:px-6 sm:py-2.5 rounded-xl text-sm sm:text-base font-black transition-all duration-200 flex items-center gap-2 ${
          selected === Market.US
            ? 'bg-white text-indigo-600 shadow-md ring-1 ring-black/5'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
        }`}
      >
        <span className="text-lg sm:text-xl leading-none">🇺🇸</span>
        <span>미국 시장</span>
      </button>
    </div>
  );
};
