/**
 * Cidade Sob Suspeita 3D — Loja de skins (Kokolas)
 * Cosméticos sem vantagem competitiva; moedas ganhas exclusivamente jogando.
 * Preço e propriedade são validados no servidor — aqui é só a vitrine.
 */

import React, { useState } from 'react';
import { Check, Lock, ShoppingBag, Sparkles } from 'lucide-react';
import { CHARACTER_SKINS, DEFAULT_SKIN_ID, PLAZA_THEMES } from '../../engine/skins.ts';
import { getStoredSkin, ProfileData, setStoredSkin, ShopNotice } from '../../services/gameClient.ts';

interface ShopPanelProps {
  profileData: ProfileData | null;
  shopNotice: ShopNotice | null;
  onBuy: (itemId: string) => void;
}

export const ShopPanel: React.FC<ShopPanelProps> = ({ profileData, shopNotice, onBuy }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [equipped, setEquipped] = useState(getStoredSkin());

  const profile = profileData?.profile;
  const kokolas = profile?.kokolas ?? 0;
  const owned = new Set([DEFAULT_SKIN_ID, 'padrao', ...(profile?.ownedSkins ?? [])]);

  const equip = (skinId: string) => {
    setStoredSkin(skinId);
    setEquipped(skinId);
  };

  return (
    <div className="bg-ink-900/80 border border-white/5 rounded-2xl backdrop-blur overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
          <ShoppingBag className="w-3.5 h-3.5 text-lantern-300" />
          Loja da Vila
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-lantern-400/15 border border-lantern-400/30 text-lantern-300 text-xs font-bold flex items-center gap-1">
          🪙 {kokolas} <span className="text-[9px] font-semibold opacity-80">kokolas</span>
        </span>
      </button>

      {isOpen && (
        <div className="p-3 pt-0 space-y-3">
          <p className="text-[10px] text-slate-500">
            Kokolas são ganhas jogando: 🪙10 por partida + 🪙15 por vitória. Cosméticos não dão
            vantagem nenhuma — só estilo.
          </p>

          {shopNotice && (
            <p
              key={shopNotice.key}
              className={`narrator-caption text-[11px] px-2.5 py-1.5 rounded-lg border ${
                shopNotice.accepted
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {shopNotice.accepted ? '✅ Compra feita! Bom proveito.' : shopNotice.message}
            </p>
          )}

          {/* Skins de personagem */}
          <div>
            <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600 mb-1.5">
              Trajes do morador
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {CHARACTER_SKINS.map(skin => {
                const isOwned = owned.has(skin.id);
                const isEquipped = equipped === skin.id;
                return (
                  <div
                    key={skin.id}
                    className="p-2 rounded-xl bg-ink-950/60 border border-white/5 space-y-1"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                        style={{ backgroundColor: skin.swatch }}
                      />
                      <span className="text-[11px] font-semibold text-white truncate">{skin.name}</span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-tight min-h-[22px]">{skin.description}</p>
                    {isOwned ? (
                      <button
                        onClick={() => equip(skin.id)}
                        disabled={isEquipped}
                        className={`w-full py-1 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1 ${
                          isEquipped
                            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                            : 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200'
                        }`}
                      >
                        {isEquipped ? (
                          <>
                            <Check className="w-3 h-3" /> Equipada
                          </>
                        ) : (
                          'Equipar'
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => onBuy(skin.id)}
                        disabled={kokolas < skin.price}
                        className="w-full py-1 rounded-lg bg-lantern-400/90 hover:bg-lantern-300 disabled:opacity-35 disabled:cursor-not-allowed text-ink-950 text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                      >
                        {kokolas < skin.price && <Lock className="w-3 h-3" />}
                        🪙 {skin.price}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Temas da praça */}
          <div>
            <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600 mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Temas da praça (o anfitrião aplica na sala)
            </span>
            <div className="grid grid-cols-1 gap-1.5">
              {PLAZA_THEMES.filter(t => t.price > 0).map(theme => {
                const isOwned = owned.has(theme.id);
                return (
                  <div
                    key={theme.id}
                    className="p-2 rounded-xl bg-ink-950/60 border border-white/5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                          style={{ backgroundColor: theme.swatch }}
                        />
                        {theme.name}
                      </span>
                      <p className="text-[9px] text-slate-500 leading-tight">{theme.description}</p>
                    </div>
                    {isOwned ? (
                      <span className="px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold shrink-0 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Seu
                      </span>
                    ) : (
                      <button
                        onClick={() => onBuy(theme.id)}
                        disabled={kokolas < theme.price}
                        className="px-2.5 py-1 rounded-lg bg-lantern-400/90 hover:bg-lantern-300 disabled:opacity-35 text-ink-950 text-[10px] font-bold transition-colors shrink-0"
                      >
                        🪙 {theme.price}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {!profile && (
            <p className="text-[10px] text-slate-500">
              Jogue sua primeira partida para abrir sua carteira de Kokolas!
            </p>
          )}
        </div>
      )}
    </div>
  );
};
