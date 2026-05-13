
export enum Market {
  KR = 'KR',
  US = 'US'
}

export enum StrategyType {
  VALUE = 'Value',
  MOMENTUM = 'Momentum',
  SWING = 'Swing',
  MACRO = 'Macro',
  WATCHLIST = 'Watchlist'
}

export interface StrategyAnalysis {
  strategy: StrategyType | string;
  score: number;
  reason: string;
  opinion: string;
}

export interface PricePoint {
  date: string;
  price: number;
  type: 'past' | 'future';
  volume?: number;
}

export interface PortfolioStock {
  id: string;
  ticker: string;
  quantity: number;
  purchasePrice?: number;
  currentPrice?: number;
}

export interface Fundamentals {
  per: string;
  pbr: string;
  cape: string; // Cyclically Adjusted PE
  eps?: string;
}

export interface RiskSignal {
  type: 'DIVERGENCE' | 'FX_RISK' | 'OVERHEAT' | 'MACRO_RISK' | 'NEWS_RISK' | 'MODEL_RISK' | 'EARNINGS_RISK';
  level: 'WARNING' | 'CRITICAL';
  message: string;
}

export interface TechnicalIndicators {
  rsi: string;
  macd: string;
  movingAverage50d: string;
  movingAverage200d: string;
}

export interface Recommendation {
  ticker: string;
  name: string;
  currentPrice: string;
  entryPrice: string; // 추천 매수가
  targetPrice: string;
  expectedReturn: string;
  convictionScore: number;
  period: string;
  rationale: string;
  summaryOpinion: string;
  investmentAction: string; // "강력 매수", "비중 축소", "전량 매도" 등
  stopLoss: string;
  weight: string;
  matchedStrategies: StrategyType[];
  detailedAnalyses: StrategyAnalysis[];
  indicators: Record<string, string>;
  fundamentals?: Fundamentals; 
  technicals?: TechnicalIndicators;
  newsSentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  riskSignals?: RiskSignal[]; // 새로 추가된 위험 신호 로직
  chartData: PricePoint[];
  lastUpdated?: string;
  // 포트폴리오 전용 필드
  rebalanceAction?: {
    type: 'BUY' | 'SELL' | 'HOLD';
    adjustmentQuantity: string;
    finalQuantity: string;
    reason: string;
  };
}

export interface AnalysisBasis {
  indicators: { name: string; value: string; impact: string }[];
  news: { title: string; source: string; sentiment: string }[];
  strategies: { name: string; description: string }[];
}

export interface PreAnalysis {
  liquidity: string;
  valuation: string;
  supplyDemand: string;
  industryCycle: string;
  narrativeVsNumbers: string;
  macroScenarios: string;
  collapseRisk: string;
}

export interface AnalysisResponse {
  preAnalysis?: PreAnalysis;
  topPicks: Recommendation[];
  surgingStocks: Recommendation[];
  watchlistAnalysis: Recommendation[];
  portfolioAnalysis: Recommendation[]; // 포트폴리오 리밸런싱 결과
  globalMarketSummary: string;
  strategyPerformanceSummary: Record<StrategyType, string>;
  analysisBasis: AnalysisBasis; // 추가된 분석 근거 필드
  sources?: { title: string; uri: string }[];
}

export interface Strategy {
  id: StrategyType;
  title: string;
  description: string;
  keyPoints: string[];
  icon: string;
}

export interface WatchlistStock {
  id: string;
  ticker: string;
  name: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string; // Base64 encoded image data
}
