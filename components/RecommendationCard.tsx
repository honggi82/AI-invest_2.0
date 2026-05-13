
import React, { useState } from 'react';
import { Recommendation, StrategyType } from '../types';
import { STRATEGIES } from '../constants';
import { PriceChart } from './PriceChart';

interface RecommendationCardProps {
  recommendation: Recommendation;
  rank?: number;
  pastMonths: number;
  futureMonths: number;
  onDeepDive?: (ticker: string, name: string) => void;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({ recommendation, rank, pastMonths, futureMonths, onDeepDive }) => {
  const [copied, setCopied] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-rose-600 bg-rose-50';
    if (score >= 70) return 'text-indigo-600 bg-indigo-50';
    return 'text-slate-400 bg-slate-50';
  };

  const isRebalance = !!recommendation.rebalanceAction;
  const hasRiskSignals = recommendation.riskSignals && recommendation.riskSignals.length > 0;

  const handleCopy = () => {
    const text = `[${recommendation.ticker}] ${recommendation.name} AI 분석 리포트
현재가: ${recommendation.currentPrice || 'N/A'}
목표가(${futureMonths}개월): ${recommendation.targetPrice || 'N/A'}
AI 확신도: ${recommendation.convictionScore || 'N/A'}%
투자의견: ${recommendation.investmentAction || 'N/A'}

요약:
${recommendation.summaryOpinion || recommendation.rationale || '내용 없음'}
`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`bg-white border rounded-[32px] overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 flex flex-col h-full group relative ${
      hasRiskSignals ? 'border-rose-200 ring-2 ring-rose-50' : isRebalance ? 'border-indigo-200' : 'border-gray-200'
    }`}>
      {/* 뱃지: 순위 및 최종 투자 의견 */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        {rank && (
          <div className="w-9 h-9 bg-gray-900 text-white rounded-full flex items-center justify-center font-black text-sm shadow-xl">
            {rank}
          </div>
        )}
        <div className={`px-4 py-2 rounded-2xl font-black text-[10px] text-white shadow-lg ${
          recommendation.investmentAction?.includes('매수') ? 'bg-emerald-600' : 
          recommendation.investmentAction?.includes('매도') ? 'bg-rose-600' : 'bg-slate-700'
        }`}>
          {recommendation.investmentAction || '의견 없음'}
        </div>
      </div>

      <div className="p-7 pt-14 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md inline-block">
                {recommendation.ticker}
              </div>
              {recommendation.newsSentiment && (
                <div className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                  recommendation.newsSentiment === 'POSITIVE' ? 'bg-emerald-100 text-emerald-700' :
                  recommendation.newsSentiment === 'NEGATIVE' ? 'bg-rose-100 text-rose-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {recommendation.newsSentiment === 'POSITIVE' ? '뉴스: 호재' :
                   recommendation.newsSentiment === 'NEGATIVE' ? '뉴스: 악재' : '뉴스: 중립'}
                </div>
              )}
            </div>
            <h3 className="text-2xl font-black text-gray-900">{recommendation.name}</h3>
          </div>
          <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black ${getScoreColor(recommendation.convictionScore || 0)}`}>
            AI 확신 {recommendation.convictionScore || 'N/A'}%
          </div>
        </div>

        {/* 🚨 위험 신호 경고 박스 (신규 추가) */}
        {hasRiskSignals && (
          <div className="mb-5 bg-rose-50 border border-rose-100 p-4 rounded-2xl animate-pulse-slow">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚠️</span>
              <h4 className="text-xs font-black text-rose-700 uppercase">리스크 관리 경고 발동</h4>
            </div>
            <div className="space-y-2">
              {recommendation.riskSignals?.filter(Boolean).map((signal, idx) => (
                <div key={idx} className="bg-white/60 p-2 rounded-lg border border-rose-100/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">
                      {signal.type === 'DIVERGENCE' ? '수급 이탈' : 
                       signal.type === 'FX_RISK' ? '환율 위험' : 
                       signal.type === 'OVERHEAT' ? '과열 신호' :
                       signal.type === 'MODEL_RISK' ? '모델 예측 리스크' :
                       signal.type === 'EARNINGS_RISK' ? '실적 위험' :
                       signal.type === 'MACRO_RISK' ? '거시경제 악재' : '뉴스 리스크'}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-rose-800 leading-tight">"{signal.message}"</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 유닛별 투자 의견 및 종합 의견 (상단 배치) */}
        {recommendation.detailedAnalyses && recommendation.detailedAnalyses.length > 0 && (
          <div className="mb-6 space-y-2">
            <h4 className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              유닛별 투자 예측 결과
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {recommendation.detailedAnalyses.map((analysis, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-gray-800">{analysis.strategy}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                      analysis.opinion?.includes('매수') ? 'bg-emerald-100 text-emerald-700' :
                      analysis.opinion?.includes('매도') ? 'bg-rose-100 text-rose-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {analysis.opinion || 'N/A'}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 font-medium">{analysis.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6 bg-slate-50 p-5 rounded-[24px] border border-slate-100">
          <h4 className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
            AI 종합 투자 의견
          </h4>
          <p className="text-xs font-bold text-slate-700 leading-relaxed whitespace-pre-wrap mt-2">
            {recommendation.summaryOpinion || recommendation.rationale || '분석 의견이 제공되지 않았습니다.'}
          </p>
        </div>

        {/* 펀더멘털 지표 (PER, PBR, CAPE) */}
        {recommendation.fundamentals && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
              <div className="text-[9px] font-bold text-slate-400 uppercase">PER</div>
              <div className="text-xs font-black text-slate-700">{recommendation.fundamentals.per}</div>
            </div>
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
              <div className="text-[9px] font-bold text-slate-400 uppercase">PBR</div>
              <div className="text-xs font-black text-slate-700">{recommendation.fundamentals.pbr}</div>
            </div>
            <div className="bg-amber-50 p-2 rounded-xl border border-amber-100 text-center">
              <div className="text-[9px] font-bold text-amber-500 uppercase">CAPE</div>
              <div className="text-xs font-black text-amber-700">{recommendation.fundamentals.cape}</div>
            </div>
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
              <div className="text-[9px] font-bold text-slate-400 uppercase">EPS</div>
              <div className="text-xs font-black text-slate-700">{recommendation.fundamentals.eps || 'N/A'}</div>
            </div>
          </div>
        )}

        {/* 기술적 지표 */}
        {recommendation.technicals && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 text-center">
              <div className="text-[9px] font-bold text-indigo-400 uppercase">RSI</div>
              <div className="text-xs font-black text-indigo-700">{recommendation.technicals.rsi}</div>
            </div>
            <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 text-center">
              <div className="text-[9px] font-bold text-indigo-400 uppercase">MACD</div>
              <div className="text-xs font-black text-indigo-700">{recommendation.technicals.macd}</div>
            </div>
            <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 text-center">
              <div className="text-[9px] font-bold text-indigo-400 uppercase">MA(50)</div>
              <div className="text-xs font-black text-indigo-700">{recommendation.technicals.movingAverage50d}</div>
            </div>
            <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 text-center">
              <div className="text-[9px] font-bold text-indigo-400 uppercase">MA(200)</div>
              <div className="text-xs font-black text-indigo-700">{recommendation.technicals.movingAverage200d}</div>
            </div>
          </div>
        )}

        {/* 차트 */}
        <PriceChart data={recommendation.chartData || []} ticker={recommendation.ticker} pastMonths={pastMonths} futureMonths={futureMonths} />

        {/* 리밸런싱 상세 (있을 경우) */}
        {isRebalance && (
          <div className="mt-6 bg-indigo-900 text-white p-5 rounded-[24px] shadow-lg">
            <h4 className="text-[10px] font-black text-indigo-300 uppercase mb-3 tracking-widest">수량 조정 제안</h4>
            <div className="flex justify-between items-center mb-4 border-b border-indigo-800 pb-3">
              <div className="text-center">
                <p className="text-[9px] text-indigo-300 font-bold uppercase">조정 수량</p>
                <p className={`text-lg font-black ${recommendation.rebalanceAction?.type === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {recommendation.rebalanceAction?.adjustmentQuantity}
                </p>
              </div>
              <div className="text-indigo-700 text-xl font-black">→</div>
              <div className="text-center">
                <p className="text-[9px] text-indigo-300 font-bold uppercase">권장 최종 수량</p>
                <p className="text-lg font-black text-white">{recommendation.rebalanceAction?.finalQuantity}</p>
              </div>
            </div>
            <p className="text-[11px] font-bold text-indigo-100 leading-relaxed italic">
              "{recommendation.rebalanceAction?.reason}"
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">현재가</div>
            <div className="text-sm font-black text-gray-900">{recommendation.currentPrice || 'N/A'}</div>
          </div>
          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
            <div className="text-[9px] font-bold text-emerald-600 uppercase mb-1">추천 매수가</div>
            <div className="text-sm font-black text-emerald-900">{recommendation.entryPrice || 'N/A'}</div>
          </div>
          <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
            <div className="text-[9px] font-bold text-indigo-600 uppercase mb-1">목표 매도가({futureMonths}m)</div>
            <div className="text-sm font-black text-indigo-900">{recommendation.targetPrice || 'N/A'}</div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {onDeepDive && (
            <button 
              onClick={() => onDeepDive(recommendation.ticker, recommendation.name)}
              className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors"
            >
              챗봇에게 심층 분석 요청하기
            </button>
          )}
          <button 
            onClick={handleCopy}
            className="px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors flex items-center justify-center"
            title="분석 내용 복사하기"
          >
            {copied ? '✅' : '📋'}
          </button>
        </div>
      </div>

      <div className="px-7 py-4 bg-slate-100/50 border-t border-gray-100 flex justify-between items-center text-[10px] font-black uppercase text-slate-500">
        <span>손절가: <span className="text-rose-600">{recommendation.stopLoss || 'N/A'}</span></span>
        <span>업데이트: {recommendation.lastUpdated || 'N/A'}</span>
      </div>
    </div>
  );
};
