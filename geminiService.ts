
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Market, StrategyType, Recommendation, AnalysisResponse, ChatMessage, PortfolioStock } from "./types";

export const evaluateAndUpdateModel = async (
  apiKey: string,
  history: any[],
  currentStockInfo: Record<string, any>
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3.1-pro-preview";
  
  const historyStr = history.map(item => `
- ${item.name}(${item.ticker}): 
  과거 추천일: ${new Date(item.date).toLocaleDateString()}, 당시 가격: ${item.currentPrice}, 목표가: ${item.targetPrice}
  당시 추천의견: ${item.summaryOpinion} / 행동: ${item.investmentAction}
  당시 근거: ${item.rationale}
  현재가: ${currentStockInfo[item.ticker]?.price || '알 수 없음'}
  (현재 시장 데이터: PER ${currentStockInfo[item.ticker]?.per || 'N/A'}, PBR ${currentStockInfo[item.ticker]?.pbr || 'N/A'})
  `).join('\n');

  const prompt = `
당신은 최고 수준의 AI 퀀트 전략가입니다.
우리는 사용자의 주식 포트폴리오 관리를 위해 다중 시뮬레이션 에이전트를 운영 중입니다.

[과거 분석 데이터 및 현재 상황]
${historyStr || '과거 분석 내역이 없습니다.'}

위 분석 기록과 '현재가'를 비교해 보십시오.
과연 과거 우리의 추천(목표가 도달 여부, 익절/손절 시점 등)이 타당했는지, 실패했다면 어떠한 거시적 변수나 수급 패턴을 놓쳤는지 맹렬하게 반성(Self-Reflection) 하십시오.

[요청 사항]
과거 실패 사례 또는 더 나은 방법론을 기반으로, 앞으로 주식을 추천할 때 적용해야 할 "새로운 핵심 투자 로직/알고리즘"을 3~5가지 명확한 규칙(Rules) 형태로 작성하십시오.
이 규칙들은 앞으로 모든 종목 분석에 최우선적으로 추가 적용될 것입니다.
응답은 마크다운 형식으로 명확하고 간결하게 작성하십시오. 설명보다는 새롭게 업데이트된 규칙 자체에 집중하십시오.
`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text || "모델 업데이트 결과를 생성하지 못했습니다.";
  } catch (error) {
    console.error("evaluateAndUpdateModel error:", error);
    throw error;
  }
};

export const getAllRecommendations = async (
  apiKey: string,
  market: Market,
  strategies: { id: string; title: string; details: string }[],
  watchlist: string[],
  portfolio: PortfolioStock[],
  pastMonths: number,
  futureMonths: number,
  recommendationCount: number,
  brokerStockInfo?: Record<string, any>
): Promise<AnalysisResponse> => {
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3.1-pro-preview"; 
  const now = new Date();
  const todayStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const currentTimeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  
  const portfolioStr = portfolio.length > 0 
    ? portfolio.map(p => {
        let str = `${p.ticker}(보유수량: ${p.quantity})`;
        if (p.purchasePrice && p.currentPrice) {
          str += `[매수단가: ${p.purchasePrice}, 현재가: ${p.currentPrice}]`;
        }
        return str;
      }).join(', ') 
    : '없음';

  const watchlistStr = watchlist.length > 0 ? watchlist.join(', ') : '없음';

  const brokerInfoStr = brokerStockInfo && Object.keys(brokerStockInfo).length > 0
    ? `\n[증권사 연동 실시간 주식 데이터 (PBR/PER/가격 등)]\n${Object.entries(brokerStockInfo).map(([ticker, info]) => `${ticker}: 현재가 ${info.price}, PER ${info.per}, PBR ${info.pbr}, EPS ${info.eps}, BPS ${info.bps}`).join('\n')}\n* 제공된 데이터가 있다면 이 데이터를 최우선으로 사용하여 분석하십시오.`
    : '';

  const aiModelRules = localStorage.getItem('smartinvest_ai_model_rules');
  const aiModelUpdateStr = aiModelRules ? `\n\n[🔥 AI 모델 자가 업데이트 규정 (Self-Reflection Rules)]\n과거 반성을 통해 업데이트된 아래의 추가 투자 로직을 분석에 반드시 반영하십시오:\n${aiModelRules}\n` : '';

  const perplexityInstruction = market === Market.US 
    ? `특히 종목 분석 시 **https://www.perplexity.ai/finance** 사이트에서 해당 종목(예: "site:perplexity.ai/finance [티커]")을 검색하여 그 내용을 적극적으로 참고하십시오. ` 
    : ``;
  const searchQueryExample = market === Market.US 
    ? `"site:perplexity.ai/finance AAPL", "latest news [ticker]", "[종목명] 파업/이슈"` 
    : `"[종목명] 최신 뉴스", "[종목명] 파업", "[종목명] 악재", "[티커] stock price"`;

  const prompt = `
    [시스템 명령: R&D-Agent(Q) 기반 다중 스마트 에이전트(Multi-Agent) 투자 분석 시스템]
    현재 시각(기준): ${todayStr} ${currentTimeStr}
    분석 대상 시장: ${market === Market.KR ? '한국 (KOSPI/KOSDAQ)' : '미국 (NYSE/NASDAQ)'}${brokerInfoStr}
    
    [데이터 수집 및 검색 지침 - 효율성 및 최신성]
    1. **효율적 통합 검색**: 제공된 포트폴리오와 관심 종목에 대해 반드시 Google 검색을 수행하여 **오늘(${todayStr}) 기준의 "미국 및 한국 주식 실시간 현재가(Current Stock Price)"와 최신 뉴스(실적발표, 파업 등)**를 직접 확인하십시오. 특히 해외 주식의 경우 현재가가 실제 어제 일자나 옛날 데이터로 나오는 경우가 있습니다. 반드시 오늘 날짜(${todayStr}) 기준으로 당일 주식 현재가를 검색해서 입력하십시오. (환각 금지) ${perplexityInstruction}
    2. **최신 데이터 반영**: 실시간 현재가가 기존 지식과 다르면 반드시 방금 검색한 최신 당일 실시간 가격을 'currentPrice'에 반영하십시오.
    3. 'chartData'는 과거 ${pastMonths}개월 실제 데이터와 미래 ${futureMonths}개월 예측 데이터를 생성하며, 현재가와 목표가를 반영해야 합니다.

    [R&D-Agent(Q) 다중 에이전트 분석 파이프라인 (Factor-Model Joint Optimization Pipeline)]
    당신은 논문 'R&D-Agent-Quant'의 방법론을 구현한 4개의 전문 에이전트(유닛)로 구성된 시스템입니다. 각 종목 분석 시 다음 4단계 유닛 프로세스를 엄격히 거치십시오.

    **Unit 1: Specification & Synthesis Unit (가설/팩터 설계가)**
    - 역할: Alpha 158/360 등 팩터 라이브러리 및 최근 트렌드에 기반해, 주식별 고유의 Factor(모멘텀, 가격-거래량, 변동성, 호가창 스프레드 등) 가설을 생성합니다.
    - 출력: 거시 상황에 맞추어 새로 탐색해야 할 혁신적인 데이터 중심 팩터 아이디어 및 논리 도출.

    **Unit 2: Implementation Unit (알고리즘 및 모델링 구현상상가)**
    - 역할: Co-STEER 에이전트를 모사하여, LightGBM, Transformer, MASTER, TRA와 같은 강력한 머신러닝/딥러닝 모델의 파이프라인(코드)을 가상으로 작동, 데이터 피팅과 학습 과정을 시뮬레이션 합니다.
    - 출력: 모델의 관점에서 현재 팩터 데이터가 어떻게 해석되는지에 대한 추론 예측치 및 펀더멘털 스코어.

    **Unit 3: Validation Unit (백테스트 및 정보계수 검증가)**
    - 역할: 도출된 팩터 및 모델 예측 결과를 바탕으로, 가상의 백테스트 환경(Qlib 모사)에서 IC(Information Coefficient), Rank IC, ARR, 최대낙폭(MDD) 등을 산출합니다.
    - 출력: 리스크-리턴 트레이드오프 검증 결과, 노이즈나 과적합된 요인(중복 요소) 필터링 의견.

    **Unit 4: Analysis Unit (최종 의사결정 및 밴딧 스케줄러 - Self-Reflection)**
    - 역할: SOTA(State-of-the-art) 벤치마크 모델과 현재 도출된 결과를 비교 분석하고, Contextual Thompson Sampling(Multi-Armed Bandit)을 활용해 장단기 리스크 보상을 최적화하여 최종 투자 의견을 도출합니다.
    - 출력: 최종 매수/매도/보유 결정, 확신도(Conviction Score), 리스크 관리 규칙(아래 5대 로직) 적용 결과.

    [핵심 투자 로직 수정 사항 (Must Apply Logic Rules - Analysis Unit 필수 적용)]
    다음 5가지 로직을 최우선으로 적용하여 매수/매도/보유 의견을 결정하십시오. (이 로직에 하나라도 해당하여 위험 신호가 발생한 종목은 절대 '강력 매수'나 '매수' 의견을 내면 안 됩니다.)
    Rule 1. 수급-가격 다이버전스 (Warning Signal): 매수-매도 호가 스프레드(Bid-Ask Spread) 확대 및 외국인/기관 대량 매도시 'DIVERGENCE' 발동.
    Rule 2. 환율 연동형 밸류에이션 컷오프 (FX Cut-off): 환율이 최근 평균 대비 급등 시 'FX_RISK' 발동.
    Rule 3. 기술적 과열 강제 차익 실현 (Overheat Trigger): 단기간 예측 팩터의 변동성이 과하게 튀거나 RSI 85 초과 시 'OVERHEAT' 발동.
    Rule 4. 매크로 및 외부 리스크 반영 (Macro/News Risk): 유가 급등, 치명적 악재 뉴스 시 'MACRO_RISK'/'NEWS_RISK' 발동.
    Rule 5. 모델 리스크 증가 (Drawdown Risk): Validation Unit이 예측한 MDD가 허용 범위를 넘을 경우 하이리스크로 간주해 'MODEL_RISK' 발동 후 비중 축소.${aiModelUpdateStr}

    [사용자 입력 데이터]
    - 포트폴리오: ${portfolioStr}
    - 관심 종목: ${watchlistStr}

    [필수 분석 요구사항]
    1. **포트폴리오 리밸런싱 (portfolioAnalysis)**: 제공된 포트폴리오에 있는 **모든 종목(${(portfolio.length)}개)에 대해 단 한 개도 빠짐없이** 각각 분석하고 수량 조절(BUY/SELL/HOLD 등)을 제안하십시오. (응답 배열의 길이는 반드시 제공된 포트폴리오의 종목 수와 정확히 일치해야 합니다.)
    2. **관심 종목 분석 (watchlistAnalysis)**: 제공된 관심 종목 각각에 대해 빠짐없이 적정 가치 및 투자 매력도를 평가하십시오.
    3. **전략적 신규 추천 (Top Picks)**: **오늘(${todayStr}) 기준 최신 데이터**를 바탕으로 매수 매력도가 높은 종목을 **${recommendationCount}개** 추천. (주의: 위 5대 필수 리스크 관리 로직에 하나라도 걸리는 종목은 절대 신규 추천(Top Picks)에 포함시키지 마십시오. 시장 상황이 안 좋다면 방어주 위주로 추천하십시오.)
    4. **급등/테마주 포착 (surgingStocks)**: 강한 모멘텀을 보이는 테마주/급등주 2~3개 포착.
    5. **분석 근거 요약 (analysisBasis)**: 경제 지표, 뉴스, 전략 요약.

    [형식 지침]
    - 금액 표기: KRW, USD 명시.
    - **entryPrice**: 추천하는 구체적인 매수 가격(또는 매수 범위)을 제시하십시오.
    - **targetPrice**: 추천하는 구체적인 목표 매도 가격을 제시하십시오.
    - **riskSignals** 배열에 위 Rule에 걸린 사항을 반드시 포함하십시오.
    - **detailedAnalyses**: 반드시 새로운 4개 유닛(Unit 1 가설/팩터 설계, Unit 2 알고리즘 모델링, Unit 3 성과/백테스트 검증, Unit 4 최종 분석/의사결정) 각각에 대한 짧은 투자 예측(opinion: "매수", "매도", "보유" 등)과 그 이유(reason)를 배열 길이 4로 정확히 작성하십시오. (일부 유닛만 누락시키지 마십시오.)
    - **summaryOpinion**: 위 각 유닛들의 예측을 종합하여 R&D-Agent(Q)의 최종 종합 투자 의견을 작성하십시오.
    - **investmentAction**: 최종 행동 ("강력 매수", "매수", "보유", "비중 축소", "매도" 등)
    - **모든 종목의 rationale 필드에는 R&D-Agent(Q)의 4단계(Specification/Synthesis, Implementation, Validation, Analysis) 분석 요약을 포함하십시오.**
    - **chartData**는 반드시 과거 데이터 포인트 최소 3개(type: "past")와 미래 예측 데이터 포인트 최소 3개(type: "future")를 포함해야 합니다.
    - **chartData의 마지막 미래 예측 가격은 반드시 targetPrice와 동일한 값이어야 합니다.**
  `;

  const recommendationSchema = {
    type: Type.OBJECT,
    properties: {
      ticker: { type: Type.STRING },
      name: { type: Type.STRING },
      currentPrice: { type: Type.STRING },
      entryPrice: { type: Type.STRING },
      targetPrice: { type: Type.STRING },
      expectedReturn: { type: Type.STRING },
      convictionScore: { type: Type.NUMBER },
      period: { type: Type.STRING },
      rationale: { type: Type.STRING },
      summaryOpinion: { type: Type.STRING },
      investmentAction: { type: Type.STRING },
      stopLoss: { type: Type.STRING },
      weight: { type: Type.STRING },
      matchedStrategies: { type: Type.ARRAY, items: { type: Type.STRING } },
      detailedAnalyses: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            strategy: { type: Type.STRING },
            score: { type: Type.NUMBER },
            reason: { type: Type.STRING },
            opinion: { type: Type.STRING }
          },
          required: ["strategy", "score", "reason", "opinion"]
        }
      },
      indicators: { type: Type.OBJECT },
      fundamentals: {
        type: Type.OBJECT,
        properties: {
          per: { type: Type.STRING },
          pbr: { type: Type.STRING },
          cape: { type: Type.STRING },
          eps: { type: Type.STRING }
        }
      },
      technicals: {
        type: Type.OBJECT,
        properties: {
          rsi: { type: Type.STRING },
          macd: { type: Type.STRING },
          movingAverage50d: { type: Type.STRING },
          movingAverage200d: { type: Type.STRING }
        }
      },
      newsSentiment: { type: Type.STRING },
      riskSignals: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            level: { type: Type.STRING },
            message: { type: Type.STRING }
          },
          required: ["type", "level", "message"]
        }
      },
      chartData: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            price: { type: Type.NUMBER },
            type: { type: Type.STRING },
            volume: { type: Type.NUMBER }
          },
          required: ["date", "price", "type"]
        }
      },
      lastUpdated: { type: Type.STRING },
      rebalanceAction: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          adjustmentQuantity: { type: Type.STRING },
          finalQuantity: { type: Type.STRING },
          reason: { type: Type.STRING }
        },
        required: ["type", "adjustmentQuantity", "finalQuantity", "reason"]
      }
    },
    required: ["ticker", "name", "currentPrice", "entryPrice", "targetPrice", "expectedReturn", "convictionScore", "period", "rationale", "summaryOpinion", "investmentAction", "stopLoss", "weight", "matchedStrategies", "detailedAnalyses", "chartData"]
  };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      preAnalysis: {
        type: Type.OBJECT,
        properties: {
          liquidity: { type: Type.STRING },
          valuation: { type: Type.STRING },
          supplyDemand: { type: Type.STRING },
          industryCycle: { type: Type.STRING },
          narrativeVsNumbers: { type: Type.STRING },
          macroScenarios: { type: Type.STRING },
          collapseRisk: { type: Type.STRING }
        },
        required: ["liquidity", "valuation", "supplyDemand", "industryCycle", "narrativeVsNumbers", "macroScenarios", "collapseRisk"]
      },
      topPicks: { type: Type.ARRAY, items: recommendationSchema },
      surgingStocks: { type: Type.ARRAY, items: recommendationSchema },
      watchlistAnalysis: { type: Type.ARRAY, items: recommendationSchema },
      portfolioAnalysis: { type: Type.ARRAY, items: recommendationSchema },
      globalMarketSummary: { type: Type.STRING },
      strategyPerformanceSummary: { type: Type.OBJECT },
      analysisBasis: {
        type: Type.OBJECT,
        properties: {
          indicators: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.STRING },
                impact: { type: Type.STRING }
              },
              required: ["name", "value", "impact"]
            }
          },
          news: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                source: { type: Type.STRING },
                sentiment: { type: Type.STRING }
              },
              required: ["title", "source", "sentiment"]
            }
          },
          strategies: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["name", "description"]
            }
          }
        },
        required: ["indicators", "news", "strategies"]
      }
    },
    required: ["preAnalysis", "topPicks", "surgingStocks", "watchlistAnalysis", "portfolioAnalysis", "globalMarketSummary", "strategyPerformanceSummary", "analysisBasis"]
  };

  let retries = 2;
  while (retries >= 0) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          tools: [{ googleSearch: {} }],
          systemInstruction: '당신은 최고의 데이터 중심 팩터 & 머신러닝 퀀트 투자 전략가입니다. 반드시 Google Search를 사용하여 최신 시장 데이터와 유사한 경제 매크로 상황을 검색하고, 이를 Analysis Unit 판단에 강력하게 반영하십시오.'
        }
      });

      let responseText = '';
      try {
        responseText = response.text || '';
      } catch (e: any) {
        throw new Error(`응답 텍스트 추출 실패: ${e.message}`);
      }

      if (!responseText) {
        throw new Error("AI 응답이 비어있습니다.");
      }

      let parsedResponse: AnalysisResponse;
      try {
        parsedResponse = JSON.parse(responseText) as AnalysisResponse;
      } catch (e: any) {
        throw new Error(`JSON 파싱 실패: ${e.message}. 응답 일부: ${responseText.slice(0, 200)}`);
      }
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        parsedResponse.sources = chunks
          .map(chunk => chunk.web ? { title: chunk.web.title, uri: chunk.web.uri } : null)
          .filter(Boolean) as { title: string; uri: string }[];
      }
      return parsedResponse;
    } catch (error: any) {
      console.error(`Gemini 분석 에러 (남은 재시도: ${retries}):`, error);
      if (retries === 0) {
        throw new Error(`분석 실패: ${error.message || JSON.stringify(error)}`);
      }
      retries--;
      // 잠시 대기 후 재시도
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error("분석에 실패했습니다.");
};

export const streamChatWithAI = async (
  apiKey: string,
  message: string,
  history: ChatMessage[],
  context: AnalysisResponse | null,
  image?: string,
  market?: Market
) => {
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3.1-pro-preview";
  
  const perplexityInstruction = market === Market.US
    ? ` 특히 미국 주식 종목을 분석할 때는 https://www.perplexity.ai/finance 사이트에서 해당 종목(예: "site:perplexity.ai/finance [티커]")을 검색하여 그 내용을 적극적으로 참고하십시오.`
    : ``;

  const systemInstruction = `당신은 R&D-Agent(Q) 기반 다중 스마트 퀀트(Multi-Agent) 투자 분석 시스템입니다.
  답변 시 다음 4단계 유닛 프로세스(Specification, Implementation, Validation, Analysis)를 거쳐 분석하고, Self-Reflection을 통해 최종 결론을 도출하십시오.
  
  [R&D-Agent(Q) 파이프라인]
  1. Specification & Synthesis Unit: 최신 거시 트렌드 기반의 팩터(모멘텀, 변동성 등) 가설 생성
  2. Implementation Unit: LightGBM, Transformer, MASTER 등 다수 예측 모델 파이프라인 가상 구동
  3. Validation Unit: 팩터와 모델의 예측력(IC), Rank IC, 성과(ARR, MDD) 시뮬레이션 백테스트
  4. Analysis Unit: Bandit 알고리즘 기반 SOTA 모델 도출 및 자기 반성(Self-Reflection)으로 최종 투자 의견 도출

  [필수 리스크 관리 로직]
  1. 매수/매도 호가 스프레드 확대 및 수급 다이버전스 시 경고
  2. 환율 급등 시 보수적 관점
  3. 변동성 폭증 및 예측 팩터의 과열 시 차익 실현 권고
  4. 매크로(유가, 금) 및 뉴스 악재 발생 시 리스크 경고
  5. MDD(최대 낙폭) 예측치가 허용치 상회 시 비중 축소 권고
  
  이전 분석 결과에서 특정 종목에 대해 '매수' 또는 '강력 매수' 의견을 냈다면, 챗봇 답변에서도 그 기조를 일관되게 유지해야 합니다. 만약 새로운 악재가 발견되어 의견을 바꿔야 한다면, 왜 이전 분석과 달라졌는지 명확히 설명하십시오.
  반드시 googleSearch를 사용하여 최신 실시간 데이터(유가, 금값 등 포함)를 확인하고 답변하십시오.${perplexityInstruction}`;
  
  let contextStr = `[상황: ${context?.globalMarketSummary || "데이터 수집 중"}]\n`;
  if (context) {
    const allStocks = [
      ...(context.topPicks || []), 
      ...(context.surgingStocks || []), 
      ...(context.watchlistAnalysis || []), 
      ...(context.portfolioAnalysis || [])
    ];
    
    // 메시지에 언급된 종목 찾기
    const mentionedStocks = allStocks.filter(s => 
      message.toLowerCase().includes(s.name.toLowerCase()) || 
      message.toLowerCase().includes(s.ticker.toLowerCase())
    );
    
    if (mentionedStocks.length > 0) {
      contextStr += `\n[이전 분석 결과 (일관성 유지를 위해 반드시 참고)]\n`;
      mentionedStocks.forEach(s => {
        contextStr += `- 종목명: ${s.name} (${s.ticker})\n`;
        contextStr += `  이전 투자의견: ${s.investmentAction}\n`;
        contextStr += `  이전 분석요약: ${s.summaryOpinion || s.rationale}\n`;
      });
      contextStr += `\n위 이전 분석 결과의 기조를 최대한 유지하면서 심층 분석을 제공하십시오. 만약 의견이 바뀐다면 그 이유를 명확히 밝히십시오.\n`;
    }
  }

  const currentParts: any[] = [{ text: `${contextStr}\n질문: ${message}` }];
  
  if (image) {
    const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (match) {
      currentParts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2]
        }
      });
    }
  }

  const contents = [
    ...history.map(m => {
      const parts: any[] = [];
      if (m.text) parts.push({ text: m.text });
      if (m.image) {
        const match = m.image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2]
            }
          });
        }
      }
      return { role: m.role, parts };
    }),
    { role: 'user', parts: currentParts }
  ];
  const augmentedSystemInstruction = (systemInstruction || '') + '\n\n당신은 AI 트레이딩 어시스턴트 챗봇입니다. 질문을 받을 때마다 반드시 Google Search를 수행하여 "실시간 오늘 날짜 최신 뉴스(파업, 노사문제, 규제, 소송, 실적발표 등 포함)"를 상세히 수집하고, 이를 기반으로 최신 정보가 반영된 심층 분석 결과를 답변에 포함하십시오.';

  return ai.models.generateContentStream({ 
    model, 
    contents: contents as any, 
    config: { 
      systemInstruction: augmentedSystemInstruction, 
      tools: [{ googleSearch: {} }]
    } 
  });
};
