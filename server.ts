import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import 'dotenv/config';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Set up token cache map instead of global variable
  const tokenCache = new Map<string, { token: string, expiry: number }>();

  async function getKisToken(appKey: string, appSecret: string, baseUrl: string) {
    const cacheKey = appKey + baseUrl;
    const cached = tokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      return cached.token;
    }

    try {
      const response = await fetch(`${baseUrl}/oauth2/tokenP`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: appKey,
          appsecret: appSecret
        })
      });

      const data = await response.json() as any;
      if (data.access_token) {
        tokenCache.set(cacheKey, {
          token: data.access_token,
          expiry: Date.now() + (data.expires_in * 1000) - 60000 // 1 minute buffer
        });
        return data.access_token;
      } else {
        throw new Error(data.error_description || 'Failed to get token');
      }
    } catch (error) {
      console.error('Failed to get KIS Token:', error);
      throw error;
    }
  }

  // API routes
  app.post('/api/broker/balance', async (req, res) => {
    try {
      const { broker, credentials } = req.body;
      
      if (!broker || !credentials) {
        return res.status(400).json({ error: 'Broker or credentials missing.' });
      }

      if (broker === 'kiwoom') {
        const { proxyUrl } = credentials;
        if (!proxyUrl) {
          return res.status(400).json({ error: '로컬 프록시 서버 URL이 필요합니다.' });
        }
        
        try {
          const kiwoomRes = await fetch(proxyUrl, { method: 'GET' });
          const data = await kiwoomRes.json() as any;
          if (!data.holdings) {
             return res.status(400).json({ error: '로컬 프록시의 응답 형식이 올바르지 않습니다. ({ holdings: [...] } 배열 구조 필요)' });
          }
          return res.json({ holdings: data.holdings });
        } catch (error: any) {
          return res.status(400).json({ error: `프록시 서버 연결 실패: ${error.message} (프로그램 실행 또는 포트 확인)` });
        }
      }

      if (broker === 'kis') {
        const { appKey, appSecret, accountNumber, isVirtual } = credentials;

        if (!appKey || !appSecret || !accountNumber) {
          return res.status(400).json({ error: '한국투자증권 API Key, Secret 또는 계좌번호가 누락되었습니다.' });
        }

        const baseUrl = isVirtual 
          ? 'https://openapivts.koreainvestment.com:29443' 
          : 'https://openapi.koreainvestment.com:9443';
        const trId = isVirtual ? 'VTTC8434R' : 'TTTC8434R';

        const token = await getKisToken(appKey, appSecret, baseUrl);
        
        const accountPrefix = accountNumber.substring(0, 8);
        const accountSuffix = accountNumber.substring(8) || '01';

        const queryParams = new URLSearchParams({
          CANO: accountPrefix,
          ACNT_PRDT_CD: accountSuffix,
          AFHR_FLPR_YN: 'N',
          OFL_YN: '',
          INQR_DVSN: '01',
          UNPR_DVSN: '01',
          FUND_STTL_ICLD_YN: 'N',
          FNCG_AMT_AUTO_RDPT_YN: 'N',
          PRCS_DVSN: '00',
          CTX_AREA_FK100: '',
          CTX_AREA_NK100: ''
        });

        const response = await fetch(`${baseUrl}/uapi/domestic-stock/v1/trading/inquire-balance?${queryParams}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'authorization': `Bearer ${token}`,
            'appkey': appKey,
            'appsecret': appSecret,
            'tr_id': trId
          }
        });

        const data = await response.json() as any;
        
        if (data.rt_cd && data.rt_cd !== '0') {
            return res.status(400).json({ error: data.msg1 || 'Failed to fetch balance' });
        }
        
        // format response
        const holdings = data.output1 || [];
        const formattedHoldings = holdings.map((h: any) => ({
          ticker: h.pdno,
          name: h.prdt_name,
          quantity: parseInt(h.hldg_qty, 10),
          purchasePrice: parseFloat(h.pchs_avg_pric),
          currentPrice: parseFloat(h.prpr),
          profitM: parseFloat(h.evlu_pfls_amt),
          profitR: parseFloat(h.evlu_pfls_rt)
        }));

        return res.json({ holdings: formattedHoldings });
      }

      return res.status(400).json({ error: '지원하지 않는 증권사입니다.' });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  app.post('/api/broker/stock-info', async (req, res) => {
    try {
      const { broker, credentials, ticker } = req.body;
      
      if (!broker || !credentials || !ticker) {
        return res.status(400).json({ error: 'Broker, credentials, or ticker missing.' });
      }

      if (broker === 'kiwoom') {
          // Just return empty if kiwoom doesn't support
          return res.json({});
      }

      if (broker === 'kis') {
        const { appKey, appSecret, isVirtual } = credentials;

        if (!appKey || !appSecret) {
          return res.status(400).json({ error: '한국투자증권 API Key, Secret가 누락되었습니다.' });
        }

        const baseUrl = isVirtual 
          ? 'https://openapivts.koreainvestment.com:29443' 
          : 'https://openapi.koreainvestment.com:9443';
        
        const isOverseas = /^[A-Za-z]+$/.test(ticker);
        
        const token = await getKisToken(appKey, appSecret, baseUrl);

        if (isOverseas) {
          // 해외 주식 현재가 검색
          const trId = 'FHKST03010100'; // 해외주식 현재가 상세 tr_id (실전) - 모의도 동일하게 적용
          
          const queryParams = new URLSearchParams({
            AUTH: '',
            EXCD: 'NAS', // 기본 나스닥으로 설정, NYSE 등일 수 있으나 KIS API 특성상 종목코드에 따라 응답이 오기도 함
            SYMB: ticker
          });

          const response = await fetch(`${baseUrl}/uapi/overseas-price/v1/quotations/price?${queryParams}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'authorization': `Bearer ${token}`,
              'appkey': appKey,
              'appsecret': appSecret,
              'tr_id': trId
            }
          });

          const data = await response.json() as any;
          if (data.rt_cd && data.rt_cd !== '0') {
             // NAS 조회 실패시 NYSE 로 재시도
             const retryParams = new URLSearchParams({
               AUTH: '',
               EXCD: 'NYS',
               SYMB: ticker
             });
             const retryRes = await fetch(`${baseUrl}/uapi/overseas-price/v1/quotations/price?${retryParams}`, {
                 method: 'GET',
                 headers: {
                   'Content-Type': 'application/json',
                   'authorization': `Bearer ${token}`,
                   'appkey': appKey,
                   'appsecret': appSecret,
                   'tr_id': trId
                 }
             });
             const retryData = await retryRes.json() as any;
             if (retryData.output) {
                const info = retryData.output;
                return res.json({ 
                  price: parseFloat(info.last),
                  per: parseFloat(info.per || '0'),
                  pbr: parseFloat(info.pbr || '0'),
                  eps: parseFloat(info.eps || '0'),
                  bps: 0,
                  roe: 0
                });
             }

             // NYS도 실패시 AMS (Amex) 로 재시도
             const retryParams2 = new URLSearchParams({
               AUTH: '',
               EXCD: 'AMS',
               SYMB: ticker
             });
             const retryRes2 = await fetch(`${baseUrl}/uapi/overseas-price/v1/quotations/price?${retryParams2}`, {
                 method: 'GET',
                 headers: {
                   'Content-Type': 'application/json',
                   'authorization': `Bearer ${token}`,
                   'appkey': appKey,
                   'appsecret': appSecret,
                   'tr_id': trId
                 }
             });
             const retryData2 = await retryRes2.json() as any;
             if (retryData2.output) {
                const info = retryData2.output;
                return res.json({ 
                  price: parseFloat(info.last),
                  per: parseFloat(info.per || '0'),
                  pbr: parseFloat(info.pbr || '0'),
                  eps: parseFloat(info.eps || '0'),
                  bps: 0,
                  roe: 0
                });
             }

             return res.status(400).json({ error: data.msg1 || retryData.msg1 || retryData2.msg1 || 'Failed to fetch overseas stock info' });
          }

          const info = data.output;
          if (!info) return res.json({});

          return res.json({ 
            price: parseFloat(info.last),
            per: parseFloat(info.per || '0'),
            pbr: parseFloat(info.pbr || '0'),
            eps: parseFloat(info.eps || '0'),
            bps: 0,
            roe: 0
          });

        } else {
          // 국내 주식 현재가 검색
          const trId = 'FHKST01010100';

          const queryParams = new URLSearchParams({
            FID_COND_MRKT_DIV_CODE: 'J',
            FID_INPUT_ISCD: ticker
          });

          const response = await fetch(`${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price?${queryParams}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'authorization': `Bearer ${token}`,
              'appkey': appKey,
              'appsecret': appSecret,
              'tr_id': trId
            }
          });

          const data = await response.json() as any;
          
          if (data.rt_cd && data.rt_cd !== '0') {
              return res.status(400).json({ error: data.msg1 || 'Failed to fetch stock info' });
          }
          
          const info = data.output;
          if (!info) return res.json({});

          return res.json({ 
            price: parseFloat(info.stck_prpr),
            per: parseFloat(info.per),
            pbr: parseFloat(info.pbr),
            eps: parseFloat(info.eps),
            bps: parseFloat(info.bps),
            roe: 0
          });
        }
      }

      return res.status(400).json({ error: '지원하지 않는 증권사입니다.' });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
