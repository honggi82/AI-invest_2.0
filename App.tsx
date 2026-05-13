
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Market, StrategyType, Recommendation, WatchlistStock, AnalysisResponse, PortfolioStock } from './types';
import { STRATEGIES } from './constants';
import { MarketToggle } from './components/MarketToggle';
import { RecommendationCard } from './components/RecommendationCard';
import { ChatBot } from './components/ChatBot';
import { getAllRecommendations, evaluateAndUpdateModel } from './geminiService';
import { encryptData, decryptData } from './encryption';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import Markdown from 'react-markdown';

const App: React.FC = () => {
  const [selectedMarket, setSelectedMarket] = useState<Market>(Market.KR);
  const [loading, setLoading] = useState(false);
  const [isUpdatingAi, setIsUpdatingAi] = useState(false);
  const [aiUpdateModalResult, setAiUpdateModalResult] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResponse | null>(() => {
    const saved = localStorage.getItem('smartinvest_results');
    if (saved) {
      try { return JSON.parse(saved); } catch(e){}
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(() => {
    const saved = localStorage.getItem('smartinvest_apiKey');
    return saved ? (decryptData(saved) || saved) : '';
  });
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  
  // 분석 옵션 상태
  const [pastMonths, setPastMonths] = useState(() => {
    const saved = localStorage.getItem('smartinvest_pastMonths');
    return saved ? Number(saved) : 3;
  });
  const [futureMonths, setFutureMonths] = useState(() => {
    const saved = localStorage.getItem('smartinvest_futureMonths');
    return saved ? Number(saved) : 3;
  });
  const [recommendationCount, setRecommendationCount] = useState(() => {
    const saved = localStorage.getItem('smartinvest_recCount');
    return saved ? Number(saved) : 5;
  }); // 기본 추천 개수 5개

  const resultsRef = useRef<HTMLDivElement>(null);
  
  // 상태 관리
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>(() => {
    const saved = localStorage.getItem('smartinvest_watchlist');
    if (saved) {
      try { return JSON.parse(saved); } catch(e){}
    }
    return [];
  });
  const [portfolio, setPortfolio] = useState<PortfolioStock[]>(() => {
    const saved = localStorage.getItem('smartinvest_portfolio');
    if (saved) {
      try { return JSON.parse(saved); } catch(e){}
    }
    return [];
  });
  const [newStock, setNewStock] = useState('');
  const [portTicker, setPortTicker] = useState('');
  const [portQty, setPortQty] = useState('');
  const [deepDiveRequest, setDeepDiveRequest] = useState<{ ticker: string, name: string, timestamp: number } | null>(null);
  const [isFetchingKis, setIsFetchingKis] = useState(false);
  const [kisMessage, setKisMessage] = useState<string | null>(null);
  
  // 증권사 연동 상태 관리
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState('kis');
  const [brokerCredentials, setBrokerCredentials] = useState<{
    [brokerId: string]: { appKey?: string; appSecret?: string; accountNumber?: string; isVirtual?: boolean; proxyUrl?: string; }
  }>(() => {
    const saved = localStorage.getItem('smartinvest_brokers');
    if (saved) {
      const decrypted = decryptData(saved);
      if (decrypted) return decrypted;
    }
    return {};
  });

  const [brokerInput, setBrokerInput] = useState({ 
    appKey: '', 
    appSecret: '', 
    accountNumber: '',
    isVirtual: true,
    proxyUrl: 'http://127.0.0.1:5000/balance'
  });

  const BROKERS = [
    { id: 'kis', name: '한국투자증권' },
    { id: 'kiwoom', name: '키움증권 (로컬 프록시)' },
    { id: 'mirae', name: '미래에셋증권 (지원예정)' }
  ];

  useEffect(() => {
    // API KEY와 증권사 정보는 외부에 노출되지 않도록 암호화하여 저장합니다.
    localStorage.setItem('smartinvest_brokers', encryptData(brokerCredentials));
  }, [brokerCredentials]);

  const handleBrokerLogin = () => {
    if (selectedBroker === 'kis') {
      if (!brokerInput.appKey || !brokerInput.appSecret || !brokerInput.accountNumber) {
        alert('모든 정보를 입력해주세요.');
        return;
      }
    } else if (selectedBroker === 'kiwoom') {
      if (!brokerInput.proxyUrl) {
        alert('로컬 프록시 서버 URL을 입력해주세요.');
        return;
      }
    } else {
      alert('현재 지원하지 않는 증권사입니다.');
      return;
    }

    setBrokerCredentials(prev => ({
      ...prev,
      [selectedBroker]: brokerInput
    }));
    setShowBrokerModal(false);
  };

  const handleBrokerLogout = (brokerId: string) => {
    setBrokerCredentials(prev => {
      const next = { ...prev };
      delete next[brokerId];
      return next;
    });
  };

  const fetchPortfolio = useCallback(async (brokerId: string) => {
    const creds = brokerCredentials[brokerId];
    if (!creds) {
      setKisMessage(`${BROKERS.find(b => b.id === brokerId)?.name} 로그인이 필요합니다.`);
      return;
    }

    setIsFetchingKis(true);
    setKisMessage(null);
    try {
      const res = await fetch('/api/broker/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker: brokerId,
          credentials: creds
        })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch from Broker');
      }

      if (data.holdings && data.holdings.length > 0) {
        const newPortfolio: PortfolioStock[] = data.holdings.map((h: any) => ({
          id: Date.now().toString() + Math.random().toString(),
          ticker: h.ticker,
          quantity: h.quantity,
          purchasePrice: h.purchasePrice,
          currentPrice: h.currentPrice
        }));
        
        setPortfolio(prev => {
          const map = new Map(prev.map(p => [p.ticker, p]));
          newPortfolio.forEach(p => map.set(p.ticker, p));
          return Array.from(map.values());
        });
        setKisMessage(`${newPortfolio.length}개 종목을 불러왔습니다.`);
      } else {
        setKisMessage('보유 종목이 없습니다.');
      }
    } catch (err: any) {
      let errorMsg = err.message;
      if (errorMsg.includes('유효하지 않은 AppKey')) {
        errorMsg += `\n(발급받은 키가 '실전투자용'이라면 옵션에서 실전투자를 선택했는지 꼭 확인해주세요!)`;
      }
      setKisMessage(`연동 실패: ${errorMsg}`);
    } finally {
      setIsFetchingKis(false);
    }
  }, [brokerCredentials]);

  useEffect(() => {
    localStorage.setItem('smartinvest_watchlist', JSON.stringify(watchlist));
    localStorage.setItem('smartinvest_portfolio', JSON.stringify(portfolio));
    localStorage.setItem('smartinvest_pastMonths', pastMonths.toString());
    localStorage.setItem('smartinvest_futureMonths', futureMonths.toString());
    localStorage.setItem('smartinvest_recCount', recommendationCount.toString());
    localStorage.setItem('smartinvest_apiKey', encryptData(apiKey));
    if (results) {
      localStorage.setItem('smartinvest_results', JSON.stringify(results));
    } else {
      localStorage.removeItem('smartinvest_results');
    }
  }, [watchlist, portfolio, pastMonths, futureMonths, recommendationCount, apiKey, results]);

  const addWatchStock = useCallback(() => {
    const trimmed = newStock.trim();
    if (!trimmed) return;
    const stock: WatchlistStock = { id: Date.now().toString(), ticker: trimmed.toUpperCase(), name: trimmed };
    setWatchlist(prev => prev.some(s => s.ticker === stock.ticker) ? prev : [...prev, stock]);
    setNewStock('');
  }, [newStock]);

  const addPortfolioStock = useCallback(() => {
    const ticker = portTicker.trim().toUpperCase();
    const qty = parseInt(portQty);
    if (!ticker || isNaN(qty)) return;
    const stock: PortfolioStock = { id: Date.now().toString(), ticker, quantity: qty };
    setPortfolio(prev => [...prev.filter(p => p.ticker !== ticker), stock]);
    setPortTicker('');
    setPortQty('');
  }, [portTicker, portQty]);

  const handleAnalyzeAll = useCallback(async () => {
    if (!apiKey) {
      setError('Gemini API Key를 입력해주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    setKisMessage('최신 증권사 연동 데이터를 함께 조회하는 중입니다...');

    let currentPortfolio = [...portfolio];
    
    const brokerStockInfo: Record<string, any> = {};

    // 연동된 증권사가 있다면, 분석 전 최신 잔고를 자동으로 가져와 병합 및 주식 정보 조회
    const connectedBrokers = Object.keys(brokerCredentials);
    if (connectedBrokers.length > 0) {
      for (const brokerId of connectedBrokers) {
        try {
          const creds = brokerCredentials[brokerId];
          const res = await fetch('/api/broker/balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ broker: brokerId, credentials: creds })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.holdings && data.holdings.length > 0) {
              const newPortfolio: PortfolioStock[] = data.holdings.map((h: any) => ({
                id: Date.now().toString() + Math.random().toString(),
                ticker: h.ticker,
                quantity: h.quantity,
                purchasePrice: h.purchasePrice,
                currentPrice: h.currentPrice
              }));
              
              const map = new Map(currentPortfolio.map(p => [p.ticker, p]));
              newPortfolio.forEach(p => map.set(p.ticker, p));
              currentPortfolio = Array.from(map.values());
            }
          }

          // Fetch stock info for all known tickers (portfolio + watchlist)
          const allTickers = Array.from(new Set([...currentPortfolio.map(p => p.ticker), ...watchlist.map(w => w.ticker)]));
          for (const ticker of allTickers) {
            if (!brokerStockInfo[ticker]) {
              try {
                const infoRes = await fetch('/api/broker/stock-info', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ broker: brokerId, credentials: creds, ticker })
                });
                if (infoRes.ok) {
                  const infoData = await infoRes.json();
                  if (infoData.price) {
                    brokerStockInfo[ticker] = infoData;
                  }
                }
              } catch (e) {
                console.warn(`Failed to fetch info for ${ticker}`, e);
              }
            }
          }
        } catch (e) {
          console.warn(`Broker ${brokerId} sync failed before analysis`, e);
        }
      }
      setPortfolio(currentPortfolio); // 상태 업데이트
    }

    setKisMessage('시장 분석을 진행 중입니다. 잠시만 기다려주세요...');

    const strategyInfo = STRATEGIES.map(s => ({ id: s.id, title: s.title, details: s.keyPoints.join(', ') }));
    try {
      // 기간 설정값 및 추천 개수를 함께 전달
      const data = await getAllRecommendations(
        apiKey,
        selectedMarket, 
        strategyInfo, 
        watchlist.map(s => s.ticker), 
        currentPortfolio, 
        pastMonths,
        futureMonths,
        recommendationCount,
        brokerStockInfo
      );
      setResults(data);
      
      // 분석 완료 후 요약 데이터 로컬 저장
      const newSummaries: any[] = [];
      const arraysToSave = [
        ...(data.portfolioAnalysis || []),
        ...(data.watchlistAnalysis || []),
        ...(data.topPicks || []),
        ...(data.surgingStocks || [])
      ];
      
      const seen = new Set();
      arraysToSave.forEach(item => {
        if (!item || seen.has(item.ticker)) return;
        seen.add(item.ticker);
        newSummaries.push({
          ticker: item.ticker,
          name: item.name,
          date: new Date().toISOString(),
          currentPrice: item.currentPrice,
          summaryOpinion: item.summaryOpinion,
          rationale: item.rationale,
          investmentAction: item.investmentAction,
          targetPrice: item.targetPrice
        });
      });
      
      const existingHistoryStr = localStorage.getItem('smartinvest_historical_summaries');
      let existingHistory = existingHistoryStr ? JSON.parse(existingHistoryStr) : [];
      existingHistory = [...newSummaries, ...existingHistory].slice(0, 100); // 100개까지만 저장
      localStorage.setItem('smartinvest_historical_summaries', JSON.stringify(existingHistory));

    } catch (err: any) {
      setError(err.message || '분석 중 오류가 발생했습니다.');
    } finally { 
      setLoading(false); 
      setKisMessage(null);
    }
  }, [apiKey, selectedMarket, watchlist, portfolio, pastMonths, futureMonths, recommendationCount, brokerCredentials]);

  const handleUpdateAiModel = useCallback(async () => {
    if (!apiKey) {
      setError('Gemini API Key를 입력해주세요.');
      return;
    }
    
    const existingHistoryStr = localStorage.getItem('smartinvest_historical_summaries');
    const history = existingHistoryStr ? JSON.parse(existingHistoryStr) : [];
    if (history.length === 0) {
      alert('과거 주식 분석 및 추천 이력이 없습니다. 분석을 먼저 실행하세요.');
      return;
    }

    setIsUpdatingAi(true);
    setKisMessage('증권사에서 현재 주식 데이터를 가져와 과거 추천 결과를 평가 중입니다...');

    const brokerStockInfo: Record<string, any> = {};
    const connectedBrokers = Object.keys(brokerCredentials);
    if (connectedBrokers.length > 0) {
      for (const brokerId of connectedBrokers) {
        try {
          const creds = brokerCredentials[brokerId];
          const allTickers = Array.from(new Set(history.map((h: any) => h.ticker)));
          for (const ticker of allTickers as string[]) {
            if (!brokerStockInfo[ticker]) {
              try {
                const infoRes = await fetch('/api/broker/stock-info', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ broker: brokerId, credentials: creds, ticker })
                });
                if (infoRes.ok) {
                  const infoData = await infoRes.json();
                  if (infoData.price) {
                    brokerStockInfo[ticker] = infoData;
                  }
                }
              } catch (e) {
                // ignore
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    setKisMessage('AI가 과거 데이터를 자가 점검(Self-Reflection)하여 새로운 로직을 구축하고 있습니다...');
    try {
      const updatedRules = await evaluateAndUpdateModel(apiKey, history, brokerStockInfo);
      localStorage.setItem('smartinvest_ai_model_rules', updatedRules);
      setAiUpdateModalResult(updatedRules);
    } catch (err: any) {
      setError(err.message || '리뷰 중 오류가 발생했습니다.');
    } finally {
      setIsUpdatingAi(false);
      setKisMessage(null);
    }
  }, [apiKey, brokerCredentials]);

  // 사고 팔 종목만 필터링 (HOLD 제외, 추천주 + 관심종목 분석 포함)
  const executionList = useMemo(() => {
    if (!results) return [];
    const combined = [...(results.portfolioAnalysis || []), ...(results.topPicks || []), ...(results.watchlistAnalysis || []), ...(results.surgingStocks || [])];
    
    // 중복 제거 (티커 기준) 및 BUY/SELL 필터링
    const seen = new Set();
    return combined.filter(item => {
      if (!item) return false;
      const isTradeAction = item.rebalanceAction && (item.rebalanceAction.type === 'BUY' || item.rebalanceAction.type === 'SELL');
      if (!isTradeAction) return false;
      if (seen.has(item.ticker)) return false;
      seen.add(item.ticker);
      return true;
    });
  }, [results]);

  const handleSavePDF = async () => {
    if (!resultsRef.current) return;
    setLoading(true);
    try {
      const canvas = await html2canvas(resultsRef.current, { scale: 2, useCORS: true, backgroundColor: '#f8fafc' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`R_D_Agent_Report_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (e) { alert('PDF 저장 실패'); } finally { setLoading(false); }
  };

  const handleDeepDive = useCallback((ticker: string, name: string) => {
    setDeepDiveRequest({ ticker, name, timestamp: Date.now() });
    // Scroll to chatbot
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, []);

  return (
    <div className="min-h-screen bg-[#fcfdfe] text-slate-900 pb-20 overflow-x-hidden">
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40 h-20 flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-xl flex items-center justify-center text-white font-black italic shadow-lg text-sm sm:text-base">Q</div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-gray-900">R&D-Agent<span className="text-blue-600">(Q)</span></h1>
          </div>
          <div className="flex items-center">
            <MarketToggle selected={selectedMarket} onChange={setSelectedMarket} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="bg-white rounded-[32px] p-6 sm:p-8 shadow-xl border border-gray-100 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black flex items-center gap-2">
                <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                Gemini API 설정
              </h3>
              <p className="text-sm text-slate-500 mt-1 font-medium">AI 분석을 위해 API 키를 입력해주세요. (로컬에 안전하게 저장됩니다)</p>
            </div>
            <div className="relative flex items-center w-full sm:w-auto">
              <input 
                type={isApiKeyVisible ? "text" : "password"} 
                value={apiKey} 
                onChange={e => setApiKey(e.target.value)} 
                placeholder="Gemini API Key 입력" 
                className="bg-gray-50 border-2 border-gray-200 focus:border-emerald-500 rounded-2xl px-4 py-3 text-base sm:text-sm font-bold w-full sm:w-72 focus:outline-none pr-12 transition-colors"
              />
              <button 
                onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                className="absolute right-3 text-gray-400 hover:text-gray-600 p-2"
                title={isApiKeyVisible ? "숨기기" : "보기"}
              >
                {isApiKeyVisible ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          <div className="bg-white rounded-[32px] p-8 shadow-xl border border-gray-100">
            <h3 className="text-xl font-black mb-6 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-7 bg-indigo-600 rounded-full"></span>
                내 계좌 종목 관리
              </div>
              <button 
                onClick={() => {
                  if (brokerCredentials[selectedBroker]) {
                    setBrokerInput({
                      appKey: brokerCredentials[selectedBroker].appKey || '',
                      appSecret: brokerCredentials[selectedBroker].appSecret || '',
                      accountNumber: brokerCredentials[selectedBroker].accountNumber || '',
                      isVirtual: brokerCredentials[selectedBroker].isVirtual ?? true,
                      proxyUrl: brokerCredentials[selectedBroker].proxyUrl || 'http://127.0.0.1:5000/balance'
                    });
                  } else {
                    setBrokerInput({
                      appKey: '',
                      appSecret: '',
                      accountNumber: '',
                      isVirtual: true,
                      proxyUrl: 'http://127.0.0.1:5000/balance'
                    });
                  }
                  setShowBrokerModal(true);
                }}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors"
              >
                증권사 연동 관리
              </button>
            </h3>

            {/* 증권사 연결 상태 UI */}
            {Object.keys(brokerCredentials).length > 0 && (
              <div className="mb-4 space-y-2">
                {Object.keys(brokerCredentials).map(brokerId => {
                  const brokerName = BROKERS.find(b => b.id === brokerId)?.name;
                  return (
                    <div key={brokerId} className="flex items-center justify-between bg-blue-50/50 border border-blue-100 p-3 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-blue-700">{brokerName} 연결됨</span>
                        {brokerId !== 'mirae' && (
                          <button 
                            onClick={() => fetchPortfolio(brokerId)}
                            disabled={isFetchingKis}
                            className={`text-xs font-bold border px-2 py-1 rounded disabled:opacity-50 ${brokerId === 'kis' ? 'text-blue-600 bg-white border-blue-200 hover:bg-blue-50' : 'text-fuchsia-600 bg-white border-fuchsia-200 hover:bg-fuchsia-50'}`}
                          >
                            {isFetchingKis ? '업데이트 중...' : '잔고 가져오기'}
                          </button>
                        )}
                      </div>
                      <button 
                        onClick={() => handleBrokerLogout(brokerId)}
                        className="text-xs text-red-500 font-bold hover:text-red-700"
                      >
                        로그아웃
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {kisMessage && (
              <div className={`mb-4 px-4 py-2 rounded-xl text-sm font-bold ${kisMessage.includes('실패') || kisMessage.includes('필요') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                {kisMessage}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <input value={portTicker} onChange={e => setPortTicker(e.target.value)} placeholder="티커 (예: AAPL)" className="bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-4 py-3 focus:outline-none font-bold text-base sm:text-sm" />
              <input value={portQty} onChange={e => setPortQty(e.target.value)} type="number" placeholder="보유 수량" className="bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-4 py-3 focus:outline-none font-bold text-base sm:text-sm" />
              <button onClick={addPortfolioStock} className="bg-indigo-600 text-white rounded-2xl font-black text-base sm:text-sm py-3 sm:py-0 hover:bg-indigo-700 transition-all">등록</button>
            </div>
            <div className="space-y-2">
              {portfolio.map(p => (
                <div key={p.id} className="flex justify-between items-center bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                  <span className="font-black text-indigo-700">{p.ticker}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-slate-500">{p.quantity} 주 보유 중</span>
                    <button onClick={() => { setPortTicker(p.ticker); setPortQty(p.quantity.toString()); }} className="text-slate-400 hover:text-indigo-500" title="수정">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.112l-3.154.832.832-3.154a4.5 4.5 0 011.112-1.89l13.13-13.13z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.862 4.487" /></svg>
                    </button>
                    <button onClick={() => setPortfolio(prev => prev.filter(x => x.id !== p.id))} className="text-slate-400 hover:text-red-500" title="삭제">×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[32px] p-8 shadow-xl border border-gray-100">
            <h3 className="text-xl font-black mb-6 flex items-center gap-3">
              <span className="w-1.5 h-7 bg-rose-600 rounded-full"></span>
              분석 옵션 및 관심 종목
            </h3>
            <div className="flex flex-col sm:flex-row gap-2 mb-6">
              <input value={newStock} onChange={e => setNewStock(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWatchStock()} placeholder="관심 종목 추가" className="flex-1 bg-gray-50 border-2 border-transparent focus:border-rose-500 rounded-2xl px-4 py-3 focus:outline-none font-bold text-base sm:text-sm" />
              <button onClick={addWatchStock} className="bg-gray-900 text-white px-6 py-3 sm:py-0 rounded-2xl font-black text-base sm:text-sm">추가</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              {watchlist.map(s => (
                <span key={s.id} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl border border-rose-100 text-xs font-black flex items-center gap-2">
                  {s.ticker}
                  <button onClick={() => { setNewStock(s.ticker); setWatchlist(prev => prev.filter(x => x.id !== s.id)); }} className="hover:text-rose-800" title="수정">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.112l-3.154.832.832-3.154a4.5 4.5 0 011.112-1.89l13.13-13.13z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.862 4.487" /></svg>
                  </button>
                  <button onClick={() => setWatchlist(prev => prev.filter(x => x.id !== s.id))} className="hover:text-rose-800" title="삭제">×</button>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase flex justify-between mb-2">
                  과거 데이터 <span className="text-indigo-600">{pastMonths}개월</span>
                </label>
                <input type="range" min="1" max="12" value={pastMonths} onChange={e => setPastMonths(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase flex justify-between mb-2">
                  미래 예측 <span className="text-indigo-600">{futureMonths}개월</span>
                </label>
                <input type="range" min="1" max="12" value={futureMonths} onChange={e => setFutureMonths(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase flex justify-between mb-2">
                  추천 종목 수 <span className="text-rose-600">{recommendationCount}개</span>
                </label>
                <input type="range" min="3" max="10" value={recommendationCount} onChange={e => setRecommendationCount(Number(e.target.value))} className="w-full accent-rose-600 cursor-pointer" />
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mb-16">
          <button onClick={handleAnalyzeAll} disabled={loading} className="w-full sm:w-auto px-10 sm:px-16 py-5 sm:py-6 rounded-full font-black text-lg sm:text-xl text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 transition-all shadow-[0_10px_40px_-10px_rgba(79,70,229,0.5)] hover:shadow-[0_20px_40px_-10px_rgba(79,70,229,0.7)] hover:-translate-y-1 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none">
            {loading ? "R&D-Agent(Q) 파이프라인 분석 중..." : "R&D-Agent(Q) 리밸런싱 리포트 생성 ⚡"}
          </button>
          {error && (
            <div className="mt-4 text-rose-600 font-bold bg-rose-50 py-3 px-6 rounded-2xl inline-block border border-rose-100">
              ⚠️ {error}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400 font-medium">
            * AI가 실시간 검색을 통해 데이터를 수집하므로 분석에 1~2분 정도 소요될 수 있습니다.<br/>
            * 제공되는 주가 및 분석 정보는 참고용이며, 실제 투자 결과에 대한 책임은 투자자 본인에게 있습니다.
          </p>
        </div>

        {results && (
          <div ref={resultsRef} className="space-y-20 p-4 sm:p-8 bg-[#f8fafc] rounded-[48px] relative">
            <div className="absolute top-8 right-8 z-10">
              <button onClick={handleSavePDF} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs shadow-lg hover:bg-slate-800 transition-colors">
                PDF 저장
              </button>
            </div>
            
            {/* 사전 분석 결과 섹션 */}
            {results.preAnalysis && (
              <section className="bg-white rounded-[40px] p-8 sm:p-12 shadow-xl border border-gray-100 mb-12">
                <div className="mb-10 border-b-4 border-indigo-600 pb-6">
                  <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                    <span className="text-4xl">🔬</span> 사전 분석 리포트
                  </h2>
                  <p className="text-slate-500 font-bold text-sm uppercase tracking-wide mt-2">
                    투자 전략 수립 전 핵심 시장 지표 및 리스크 점검 결과
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-indigo-700 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span> 유동성 방향 감지
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                      {results.preAnalysis.liquidity}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-rose-700 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span> 밸류에이션 왜곡 탐지
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed bg-rose-50/50 p-4 rounded-2xl border border-rose-100">
                      {results.preAnalysis.valuation}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-amber-700 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> 수급 구조 역전 포착
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                      {results.preAnalysis.supplyDemand}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-emerald-700 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 산업 사이클 위치 진단
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                      {results.preAnalysis.industryCycle}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-blue-700 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span> 서사 vs 숫자 괴리 분석
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                      {results.preAnalysis.narrativeVsNumbers}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-purple-700 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span> 거시 시나리오 확률
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
                      {results.preAnalysis.macroScenarios}
                    </p>
                  </div>
                  <div className="space-y-4 md:col-span-2">
                    <h3 className="text-lg font-black text-red-700 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span> 붕괴 가능성 탐지
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed bg-red-50/50 p-4 rounded-2xl border border-red-100">
                      {results.preAnalysis.collapseRisk}
                    </p>
                  </div>
                </div>
              </section>
            )}

            <section>
              <div className="mb-10 border-b-4 border-indigo-600 pb-6">
                <div>
                  <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                    <span className="text-4xl">⚖️</span> 실시간 포트폴리오 리밸런싱
                  </h2>
                  <p className="text-indigo-600 font-bold text-sm mt-2">현재 보유량 대비 최적의 비중 조절 제안</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {results.portfolioAnalysis?.filter(Boolean).map((rec, idx) => (
                  <RecommendationCard key={`port-${idx}`} recommendation={rec} pastMonths={pastMonths} futureMonths={futureMonths} onDeepDive={handleDeepDive} />
                ))}
              </div>
            </section>

            {results.watchlistAnalysis && results.watchlistAnalysis.length > 0 && (
              <section>
                <div className="mb-10 border-b-4 border-amber-500 pb-6">
                  <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                    <span className="text-4xl">👀</span> 관심 종목 정밀 분석
                  </h2>
                  <p className="text-amber-600 font-bold text-sm mt-2">와치리스트에 등록된 종목의 현재 위치 진단</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {results.watchlistAnalysis?.filter(Boolean).map((rec, idx) => (
                    <RecommendationCard key={`watch-${idx}`} recommendation={rec} pastMonths={pastMonths} futureMonths={futureMonths} onDeepDive={handleDeepDive} />
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-10 border-b-4 border-rose-600 pb-6">
                <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                  <span className="text-4xl">🎯</span> 전략적 신규 추천주
                </h2>
                <p className="text-rose-600 font-bold text-sm mt-2">AI가 선정한 현재 시점 최적의 매수 후보</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {results.topPicks?.filter(Boolean).map((rec, idx) => (
                  <RecommendationCard key={`top-${idx}`} recommendation={rec} rank={idx+1} pastMonths={pastMonths} futureMonths={futureMonths} onDeepDive={handleDeepDive} />
                ))}
              </div>
            </section>

            {results.surgingStocks && results.surgingStocks.length > 0 && (
              <section>
                <div className="mb-10 border-b-4 border-emerald-500 pb-6">
                  <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                    <span className="text-4xl">🚀</span> 급등/테마주 포착
                  </h2>
                  <p className="text-emerald-600 font-bold text-sm mt-2">현재 시장에서 강한 모멘텀을 보이는 종목</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {results.surgingStocks?.filter(Boolean).map((rec, idx) => (
                    <RecommendationCard key={`surge-${idx}`} recommendation={rec} pastMonths={pastMonths} futureMonths={futureMonths} onDeepDive={handleDeepDive} />
                  ))}
                </div>
              </section>
            )}

            {/* 최종 매매 실행 요약표 */}
            <section className="bg-white rounded-[40px] p-8 sm:p-12 shadow-xl border border-gray-100 overflow-hidden relative">
               <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-16 -mt-16"></div>
               <div className="mb-10 border-b-4 border-slate-900 pb-6">
                  <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                    <span className="text-4xl">📝</span> 최종 매매 실행 요약표
                  </h2>
                  <p className="text-slate-500 font-bold text-sm uppercase tracking-wide">AI 분석 결과에 따른 '매수/매도' 액션 목록 (HOLD 제외)</p>
               </div>
               
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse min-w-[600px]">
                   <thead>
                     <tr className="border-b-2 border-slate-100 bg-slate-50/50">
                       <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">종목명 (티커)</th>
                       <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">권장 액션</th>
                       <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">조정 수량</th>
                       <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">최종 권장 수량</th>
                     </tr>
                   </thead>
                   <tbody>
                     {executionList.map((item, idx) => (
                       <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                         <td className="py-5 px-6">
                           <div className="font-black text-slate-900 text-lg">{item.name}</div>
                           <div className="text-[11px] text-indigo-500 font-black">{item.ticker}</div>
                         </td>
                         <td className="py-5 px-6 text-center">
                           <span className={`px-4 py-2 rounded-2xl text-xs font-black shadow-sm inline-block ${
                             item.rebalanceAction?.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' :
                             item.rebalanceAction?.type === 'SELL' ? 'bg-rose-100 text-rose-700' :
                             'bg-slate-100 text-slate-600'
                           }`}>
                             {item.rebalanceAction?.type === 'BUY' ? '추가 매수' :
                              item.rebalanceAction?.type === 'SELL' ? '일부 매도' : '보유 유지'}
                           </span>
                         </td>
                         <td className={`py-5 px-6 text-right font-black text-lg ${
                           item.rebalanceAction?.type === 'BUY' ? 'text-emerald-600' :
                           item.rebalanceAction?.type === 'SELL' ? 'text-rose-600' : 'text-slate-400'
                         }`}>
                           {item.rebalanceAction?.adjustmentQuantity}
                         </td>
                         <td className="py-5 px-6 text-right">
                           <div className="text-lg font-black text-slate-900">{item.rebalanceAction?.finalQuantity}</div>
                           <div className="text-[9px] text-slate-400 font-bold uppercase">Target Quantity</div>
                         </td>
                       </tr>
                     ))}
                     {executionList.length === 0 && (
                       <tr>
                         <td colSpan={4} className="py-20 text-center text-slate-400 font-bold">당장 매수/매도할 종목이 없습니다. (모든 종목 보유 유지 상태)</td>
                       </tr>
                     )}
                   </tbody>
                 </table>
               </div>
            </section>

            {/* AI 분석 근거 요약 섹션 */}
            <section className="bg-slate-900 text-white rounded-[40px] p-8 sm:p-12 shadow-2xl overflow-hidden relative">
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl -ml-32 -mb-32"></div>
              <div className="mb-12 border-b border-slate-700 pb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-black flex items-center gap-3">
                    <span className="text-4xl">🔍</span> AI 분석 근거 요약
                  </h2>
                  <p className="text-slate-400 font-bold text-sm uppercase tracking-wide mt-2">지표, 뉴스, 전략을 아우르는 통합 인사이트</p>
                </div>
                <div className="bg-rose-600 text-[10px] font-black px-4 py-2 rounded-xl uppercase shadow-lg shadow-rose-900/40">
                  Data Verified by Gemini
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* 핵심 지표 */}
                <div className="space-y-6">
                  <h3 className="text-rose-400 font-black text-lg flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-rose-600 rounded-full"></span> 핵심 경제 지표
                  </h3>
                  <div className="space-y-4">
                    {results.analysisBasis?.indicators?.filter(Boolean).map((ind, i) => (
                      <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-2xl hover:bg-white/10 transition-all">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-black text-slate-300">{ind.name}</span>
                          <span className="text-sm font-black text-white">{ind.value}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium leading-relaxed mt-2">{ind.impact}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 주요 뉴스 */}
                <div className="space-y-6">
                  <h3 className="text-indigo-400 font-black text-lg flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span> 시장 주요 뉴스
                  </h3>
                  <div className="space-y-4">
                    {results.analysisBasis?.news?.filter(Boolean).map((news, i) => (
                      <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-2xl hover:bg-white/10 transition-all">
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <span className="text-[10px] font-black text-indigo-400 bg-indigo-900/40 px-2 py-0.5 rounded uppercase">{news.source}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                            news.sentiment?.includes('호재') || news.sentiment?.includes('Positive') ? 'text-emerald-400 bg-emerald-900/40' : 'text-rose-400 bg-rose-900/40'
                          }`}>{news.sentiment}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-100 leading-snug">{news.title}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 적용 전략 요약 */}
                <div className="space-y-6">
                  <h3 className="text-amber-400 font-black text-lg flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-amber-600 rounded-full"></span> 적용 투자 전략 요약
                  </h3>
                  <div className="space-y-4">
                    {results.analysisBasis?.strategies?.filter(Boolean).map((strat, i) => (
                      <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-2xl hover:bg-white/10 transition-all">
                        <h4 className="text-xs font-black text-amber-400 mb-1">{strat.name}</h4>
                        <p className="text-[11px] text-slate-300 font-medium leading-relaxed">{strat.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            
            <div className="flex justify-center mb-8">
              <button
                onClick={handleUpdateAiModel}
                disabled={isUpdatingAi}
                className="bg-purple-600 hover:bg-purple-700 text-white font-black py-4 px-8 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-2"
              >
                {isUpdatingAi ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    AI 모델 자가 점검 및 업데이트 중...
                  </>
                ) : (
                  <>✨ AI 모델 업데이트✨</>
                )}
              </button>
            </div>

            <ChatBot apiKey={apiKey} reportContext={results} deepDiveRequest={deepDiveRequest} market={selectedMarket} />
          </div>
        )}
      </main>

      {/* AI 모델 업데이트 결과 모달 */}
      {aiUpdateModalResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl relative max-h-[80vh] flex flex-col">
            <button onClick={() => setAiUpdateModalResult(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
              <span className="text-purple-600">✨</span> AI 모델 업데이트 완료
            </h3>
            <div className="overflow-y-auto flex-1 pr-2 mb-4 markdown-body prose prose-slate prose-sm sm:prose-base max-w-none">
              <Markdown>{aiUpdateModalResult}</Markdown>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 pb-2">
              <p className="text-sm font-bold text-slate-500 text-center">
                다음 종목 분석부터 위 새롭게 추가된 로직이 포함되어 더욱 정교하게 분석합니다.
              </p>
            </div>
            <div className="mt-4 flex justify-center">
               <button onClick={() => setAiUpdateModalResult(null)} className="bg-slate-900 text-white font-bold py-3 px-8 rounded-xl hover:bg-slate-800 transition-colors">
                 확인
               </button>
            </div>
          </div>
        </div>
      )}
      {/* 증권사 연동 모달 */}
      {showBrokerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setShowBrokerModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <h3 className="text-xl font-black text-slate-900 mb-6">증권사 연동</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">증권사 선택</label>
                <select 
                  value={selectedBroker}
                  onChange={e => {
                    const newBroker = e.target.value;
                    setSelectedBroker(newBroker);
                    if (brokerCredentials[newBroker]) {
                      setBrokerInput({
                        appKey: brokerCredentials[newBroker].appKey || '',
                        appSecret: brokerCredentials[newBroker].appSecret || '',
                        accountNumber: brokerCredentials[newBroker].accountNumber || '',
                        isVirtual: brokerCredentials[newBroker].isVirtual ?? true,
                        proxyUrl: brokerCredentials[newBroker].proxyUrl || 'http://127.0.0.1:5000/balance'
                      });
                    } else {
                      setBrokerInput({
                        appKey: '',
                        appSecret: '',
                        accountNumber: '',
                        isVirtual: true,
                        proxyUrl: 'http://127.0.0.1:5000/balance'
                      });
                    }
                  }}
                  className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl px-4 py-3 font-bold text-sm focus:outline-none"
                >
                  {BROKERS.map(b => (
                    <option key={b.id} value={b.id} disabled={b.id === 'mirae'}>{b.name}</option>
                  ))}
                </select>
              </div>

              {selectedBroker === 'kis' && (
                <>
                  <div className="flex items-center gap-4 mb-2 mt-4 px-2">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                      <input 
                        type="radio" 
                        name="kisEnv" 
                        checked={brokerInput.isVirtual} 
                        onChange={() => setBrokerInput({...brokerInput, isVirtual: true})}
                        className="w-4 h-4 text-blue-600"
                      />
                      모의투자
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                      <input 
                        type="radio" 
                        name="kisEnv" 
                        checked={!brokerInput.isVirtual} 
                        onChange={() => setBrokerInput({...brokerInput, isVirtual: false})}
                        className="w-4 h-4 text-rose-600"
                      />
                      실전투자
                    </label>
                  </div>
                  <p className="text-xs text-rose-600 font-bold mb-4 px-2">※ 발급받으신 AppKey의 환경(모의/실전)과 일치해야 연동이 성공합니다.</p>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">App Key (Client ID)</label>
                    <input 
                      type="text" 
                      value={brokerInput.appKey}
                      onChange={e => setBrokerInput({...brokerInput, appKey: e.target.value.trim()})}
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl px-4 py-3 font-bold text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">App Secret</label>
                    <input 
                      type="password" 
                      value={brokerInput.appSecret}
                      onChange={e => setBrokerInput({...brokerInput, appSecret: e.target.value.trim()})}
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl px-4 py-3 font-bold text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">계좌번호 (하이픈 제외)</label>
                    <input 
                      type="text" 
                      value={brokerInput.accountNumber}
                      onChange={e => setBrokerInput({...brokerInput, accountNumber: e.target.value.trim()})}
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl px-4 py-3 font-bold text-sm focus:outline-none"
                    />
                  </div>
                </>
              )}

              {selectedBroker === 'kiwoom' && (
                <>
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 mt-2 mb-4">
                    <p className="text-[11px] font-black text-amber-800 leading-relaxed mb-2">
                      🚫 키움증권 Open API+ 구조적 한계 안내
                    </p>
                    <p className="text-[11px] font-medium text-amber-700 leading-relaxed">
                      키움증권은 Windows OS 기반의 32비트 COM(ocx) 객체로만 데이터를 제공하므로, 크롬이나 사파리 같은 일반 웹 브라우저에서 서버 없이 직접 연결하는 것이 기술적으로 불가능합니다.
                    </p>
                    <p className="text-[11px] font-medium text-amber-700 leading-relaxed mt-2">
                      PC에 Python/Node.js 등으로 별도의 '로컬 프록시 서버'를 띄워두신 분에 한하여 해당 주소로 통신할 수 있습니다.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">로컬 프록시 서버 URL</label>
                    <input 
                      type="text" 
                      value={brokerInput.proxyUrl}
                      onChange={e => setBrokerInput({...brokerInput, proxyUrl: e.target.value.trim()})}
                      placeholder="예) http://127.0.0.1:5000/balance"
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl px-4 py-3 font-bold text-sm focus:outline-none placeholder-slate-400"
                    />
                  </div>
                </>
              )}

              <button 
                onClick={handleBrokerLogin}
                className="w-full bg-slate-900 text-white font-black rounded-xl py-3 mt-4 hover:bg-slate-800 transition-colors disabled:opacity-50"
                disabled={selectedBroker === 'mirae'}
              >
                연동(로그인) 하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
