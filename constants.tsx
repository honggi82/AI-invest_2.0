
import React from 'react';
import { StrategyType, Strategy } from './types';

export const STRATEGIES: Strategy[] = [
  {
    id: StrategyType.VALUE,
    title: '가치투자 전략',
    description: '시장의 오해로 저평가된 우량주를 발굴합니다.',
    keyPoints: [
      '저평가 지표 확인 (PER, PBR)',
      'CAPE(경기조정 PER) 활용',
      'ROE 10-15% 이상 유지',
      '부채비율 100% 미만'
    ],
    icon: '💎'
  },
  {
    id: StrategyType.MOMENTUM,
    title: '추세추종 전략',
    description: '강하게 상승하는 주도주에 올라타 수익을 극대화합니다.',
    keyPoints: [
      '매출/이익 성장률 20% 이상',
      '이동평균선 정배열 상태',
      '거래량 동반 신고가 돌파',
      'OBV 및 수급 우상향'
    ],
    icon: '🚀'
  },
  {
    id: StrategyType.SWING,
    title: '스윙 트레이딩',
    description: '박스권 내 변동성을 활용하여 단기 수익을 챙깁니다.',
    keyPoints: [
      '볼린저 밴드 하단 매수 신호',
      '스토캐스틱 골든크로스',
      '주요 지지/저항선 매매',
      '외국인/기관 수급 유입 확인'
    ],
    icon: '📊'
  },
  {
    id: StrategyType.MACRO,
    title: '매크로 탑다운',
    description: '경제 사이클과 금리 방향에 맞춰 유망 섹터를 선점합니다.',
    keyPoints: [
      '금리 및 CPI 물가지수 분석',
      '환율 및 원자재 가격 추이',
      '섹터별 대장주 집중 공략',
      '경기 선행 지표 활용'
    ],
    icon: '🌍'
  }
];
