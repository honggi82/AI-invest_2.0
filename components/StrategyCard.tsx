
import React from 'react';
import { Strategy } from '../types';

interface StrategyCardProps {
  strategy: Strategy;
  isSelected: boolean;
  onClick: () => void;
}

export const StrategyCard: React.FC<StrategyCardProps> = ({ strategy, isSelected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col text-left p-5 rounded-2xl transition-all border-2 ${
        isSelected
          ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-100'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
      }`}
    >
      <div className="text-3xl mb-3">{strategy.icon}</div>
      <h3 className="text-lg font-bold text-gray-900 mb-1">{strategy.title}</h3>
      <p className="text-sm text-gray-500 mb-4 line-clamp-2">{strategy.description}</p>
      <div className="mt-auto flex flex-wrap gap-2">
        {strategy.keyPoints.slice(0, 2).map((point, idx) => (
          <span key={idx} className="text-[10px] px-2 py-1 bg-gray-100 text-gray-600 rounded-full font-medium">
            {point}
          </span>
        ))}
      </div>
    </button>
  );
};
