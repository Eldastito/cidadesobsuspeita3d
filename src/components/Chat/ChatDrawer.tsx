/**
 * Cidade Sob Suspeita 3D - Social Chat Drawer (High Density Theme)
 * Alive Chat vs Dead Graveyard Chat with Quick Accusations
 */

import React, { useEffect, useRef, useState } from 'react';
import { Hand, MessageSquare, Send, Skull, Users } from 'lucide-react';
import { ChatMessage, PrivatePlayerSnapshot } from '../../engine/types.ts';

interface ChatDrawerProps {
  snapshot: PrivatePlayerSnapshot | null;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onToggleHandRaise: () => void;
}

const QUICK_PHRASES = [
  'Suspeito sob observação! 🤔',
  'Afirmo minha inocência! ✋',
  'Relatório do Detetive? 🔍',
  'Intervenção da Bruxa? 🧙‍♀️',
  'Concentrar votos na rodada! 🗳️',
  'Atenção ao padrão de votos! 🤫',
];

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  snapshot,
  messages,
  onSendMessage,
  onToggleHandRaise,
}) => {
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'ALIVE' | 'DEAD'>('ALIVE');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isAlive = snapshot?.player.isAlive ?? true;

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleQuickPhrase = (phrase: string) => {
    onSendMessage(phrase);
  };

  const filteredMessages = messages.filter((m) => {
    if (activeTab === 'DEAD') {
      return m.isDeadChat;
    }
    return !m.isDeadChat;
  });

  return (
    <div className="bg-[#0F1116] border border-white/5 rounded-lg flex flex-col h-full min-h-[420px] shadow-lg overflow-hidden font-sans">
      {/* Header with Tabs and Hand Raise button */}
      <div className="px-3 py-2.5 bg-[#0F1116] border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('ALIVE')}
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
              activeTab === 'ALIVE'
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Users className="w-3 h-3" />
            <span>PRAÇA</span>
          </button>

          {!isAlive && (
            <button
              onClick={() => setActiveTab('DEAD')}
              className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
                activeTab === 'DEAD'
                  ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                  : 'text-purple-400 hover:text-purple-300'
              }`}
            >
              <Skull className="w-3 h-3" />
              <span>CEMITÉRIO</span>
            </button>
          )}
        </div>

        {/* Hand Raise toggle for alive players */}
        {isAlive && snapshot?.room.phase === 'DISCUSSION' && (
          <button
            onClick={onToggleHandRaise}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 transition-all ${
              snapshot.player.isAlive && snapshot.room.players.find(p => p.id === snapshot.player.id)?.hasRaisedHand
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-white/5 hover:bg-white/10 text-slate-400 border border-white/10'
            }`}
          >
            <Hand className="w-3 h-3" />
            <span>PEDIR FALA</span>
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs bg-black/20">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 text-[10px] font-mono uppercase tracking-widest text-center py-8">
            NENHUM REGISTRO TRANSMITIDO NO CANAL
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isMe = msg.senderId === snapshot?.player.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500 mb-0.5 px-0.5">
                  <span>{msg.senderNickname}</span>
                  {msg.isDeadChat && <span>[cemitério]</span>}
                </div>
                <div
                  className={`max-w-[88%] px-2.5 py-1.5 rounded text-xs leading-relaxed ${
                    isMe
                      ? 'bg-indigo-600 text-white border border-indigo-500/30'
                      : msg.isDeadChat
                      ? 'bg-purple-950/60 border border-purple-800/60 text-purple-200'
                      : 'bg-[#14171F] text-slate-200 border border-white/5'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Accusation Bar */}
      <div className="px-2.5 py-1.5 bg-[#0F1116] border-t border-white/5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {QUICK_PHRASES.map((phrase, i) => (
          <button
            key={i}
            onClick={() => handleQuickPhrase(phrase)}
            className="whitespace-nowrap px-2 py-0.5 rounded bg-black/40 hover:bg-white/5 text-[10px] font-mono text-slate-400 hover:text-slate-200 transition-colors border border-white/10"
          >
            {phrase}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} className="p-2 bg-[#0F1116] border-t border-white/5 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isAlive ? 'Transmitir no canal de debate...' : 'Canal póstumo dos espectadores...'}
          maxLength={150}
          className="flex-1 px-3 py-1.5 bg-black/40 border border-white/10 rounded text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-mono text-xs transition-colors flex items-center justify-center"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};

