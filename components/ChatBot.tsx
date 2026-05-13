
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, AnalysisResponse, Market } from '../types';
import { streamChatWithAI } from '../geminiService';
import Markdown from 'react-markdown';

interface ChatBotProps {
  apiKey: string;
  reportContext: AnalysisResponse | null;
  deepDiveRequest?: { ticker: string, name: string, timestamp: number } | null;
  market?: Market;
}

export const ChatBot: React.FC<ChatBotProps> = ({ apiKey, reportContext, deepDiveRequest, market }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const removeAttachedImage = () => {
    setAttachedImage(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Reset file input so the same file can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if ((!textToSend.trim() && !attachedImage) || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', text: textToSend, image: attachedImage || undefined };
    setMessages(prev => [...prev, userMsg]);
    
    const currentInput = textToSend;
    const currentImage = attachedImage || undefined;
    
    if (!overrideInput) {
      setInput('');
    }
    setAttachedImage(null);
    setIsLoading(true);

    try {
      const modelMsg: ChatMessage = { role: 'model', text: '' };
      setMessages(prev => [...prev, modelMsg]);

      const stream = await streamChatWithAI(apiKey, currentInput, messages, reportContext, currentImage, market);
      
      let fullText = '';
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          setMessages(prev => {
            const last = [...prev];
            last[last.length - 1].text = fullText;
            return last;
          });
        }
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => {
        const last = [...prev];
        last[last.length - 1].text = '죄송합니다. 실시간 정보를 가져오는 중 오류가 발생했습니다.';
        return last;
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (deepDiveRequest && apiKey) {
      const msg = `${deepDiveRequest.name}(${deepDiveRequest.ticker}) 종목에 대해 더 깊이 있는 심층 분석을 제공해줘. 펀더멘털, 기술적 지표, 최근 뉴스, 그리고 향후 전망을 자세히 설명해줘.`;
      handleSend(msg);
    }
  }, [deepDiveRequest, apiKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <section className="mt-20">
      <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden flex flex-col h-[600px]">
        {/* Header */}
        <div className="bg-slate-900 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center text-white font-black italic shadow-lg">A</div>
            <div>
              <h3 className="text-white font-black text-lg">전략 분석 AI 어시스턴트</h3>
              <p className="text-rose-400 text-[10px] font-bold uppercase tracking-widest">Real-time Financial Advisor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-emerald-500 text-[10px] font-black uppercase">Live Connected</span>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-10">
              <div className="text-4xl mb-4">💬</div>
              <p className="text-slate-900 font-black text-lg mb-2">분석 결과에 대해 무엇이든 물어보세요!</p>
              <p className="text-slate-400 text-sm font-medium leading-relaxed">
                "방금 추천한 삼성전자의 익절 근거가 뭐야?"<br/>
                "오늘 금리 전망과 환율 흐름은 어때?"<br/>
                "현재 비트코인 시세와 반도체 섹터의 상관관계는?"<br/>
                "이 차트 이미지를 분석해줄래?"
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-5 py-4 rounded-3xl font-bold text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-rose-600 text-white rounded-tr-none' 
                  : 'bg-white text-slate-800 border border-gray-100 rounded-tl-none'
              }`}>
                {msg.image && (
                  <div className="mb-3">
                    <img src={msg.image} alt="첨부된 이미지" className="max-w-full h-auto max-h-48 rounded-xl border border-white/20" />
                  </div>
                )}
                {msg.text ? (
                  <div className="markdown-body prose prose-sm max-w-none">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                ) : (isLoading && i === messages.length - 1 ? '답변을 생성하고 있습니다...' : '')}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 sm:p-6 bg-white border-t border-gray-100 flex flex-col gap-3">
          {attachedImage && (
            <div className="relative inline-block w-max">
              <img src={attachedImage} alt="첨부 미리보기" className="h-16 sm:h-20 w-auto rounded-xl border border-gray-200 shadow-sm" />
              <button 
                onClick={removeAttachedImage}
                className="absolute -top-2 -right-2 bg-rose-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shadow-md hover:bg-rose-600"
              >
                ×
              </button>
            </div>
          )}
          <div className="flex gap-2 sm:gap-3 items-center">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-slate-100 text-slate-600 rounded-xl sm:rounded-2xl hover:bg-slate-200 transition-colors shadow-sm shrink-0"
              title="이미지 첨부"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="질문을 입력하세요..."
              className="flex-1 min-w-0 bg-slate-50 border-2 border-transparent focus:border-rose-500 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-6 sm:py-4 focus:outline-none transition-all font-bold text-base sm:text-sm"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || (!input.trim() && !attachedImage)}
              className={`px-4 py-3 sm:px-8 sm:py-4 rounded-xl sm:rounded-2xl font-black text-base sm:text-sm transition-all shadow-lg shrink-0 ${
                isLoading || (!input.trim() && !attachedImage) ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-black active:scale-95'
              }`}
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

