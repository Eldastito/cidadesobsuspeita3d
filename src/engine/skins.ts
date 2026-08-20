/**
 * Cidade Sob Suspeita 3D — Catálogo de skins e economia Kokola
 * Cosméticos SEM vantagem competitiva (PRD 18: nada de dinheiro real
 * ou pay-to-win). Kokolas são ganhas exclusivamente jogando.
 * Preços e propriedade são validados SEMPRE no servidor.
 */

/** Recompensas em Kokolas (só para humanos com perfil). */
export const KOKOLA_REWARDS = {
  matchCompleted: 10,
  victoryBonus: 15,
} as const;

export type SkinEffect = 'none' | 'gold' | 'neon' | 'ghost' | 'shadow' | 'harlequin' | 'lava' | 'royal';

export interface CharacterSkin {
  id: string;
  name: string;
  description: string;
  /** Preço em Kokolas (0 = todos já possuem). */
  price: number;
  /** Efeito de material aplicado ao rig 3D. */
  effect: SkinEffect;
  /** Cor de destaque para o card da loja (hex CSS). */
  swatch: string;
}

export const DEFAULT_SKIN_ID = 'padrao';

export const CHARACTER_SKINS: CharacterSkin[] = [
  {
    id: DEFAULT_SKIN_ID,
    name: 'Morador Padrão',
    description: 'O traje honesto de quem não deve nada... será?',
    price: 0,
    effect: 'none',
    swatch: '#c0563e',
  },
  {
    id: 'sombra',
    name: 'Manto Sombrio',
    description: 'Tecido escuro como a consciência de um assassino.',
    price: 60,
    effect: 'shadow',
    swatch: '#232633',
  },
  {
    id: 'neon',
    name: 'Neon Noturno',
    description: 'Brilha na escuridão — discrição não é o seu forte.',
    price: 80,
    effect: 'neon',
    swatch: '#22d3ee',
  },
  {
    id: 'arlequim',
    name: 'Arlequim',
    description: 'Metade riso, metade suspeita.',
    price: 90,
    effect: 'harlequin',
    swatch: '#d06a8c',
  },
  {
    id: 'dourado',
    name: 'Dourado Real',
    description: 'Reluzente dos pés à cabeça. A vila inteira nota você.',
    price: 120,
    effect: 'gold',
    swatch: '#f5b942',
  },
  {
    id: 'lava',
    name: 'Coração de Lava',
    description: 'Arde por dentro como um segredo mal guardado.',
    price: 140,
    effect: 'lava',
    swatch: '#f97316',
  },
  {
    id: 'fantasma',
    name: 'Fantasma Chique',
    description: 'Translúcido em vida — treino para o cemitério.',
    price: 160,
    effect: 'ghost',
    swatch: '#dce6f5',
  },
  {
    id: 'realeza',
    name: 'Púrpura da Realeza',
    description: 'Veludo púrpura com detalhes dourados. Digno de um Prefeito.',
    price: 200,
    effect: 'royal',
    swatch: '#7c3aed',
  },
];

export interface PlazaTheme {
  id: string;
  name: string;
  description: string;
  price: number;
  swatch: string;
}

export const DEFAULT_PLAZA_THEME = 'padrao';

/** Temas da praça — a "skin do jogo", escolhida pelo anfitrião. */
export const PLAZA_THEMES: PlazaTheme[] = [
  {
    id: DEFAULT_PLAZA_THEME,
    name: 'Vila Clássica',
    description: 'A praça de sempre, com suas lamparinas e segredos.',
    price: 0,
    swatch: '#f5b942',
  },
  {
    id: 'junina',
    name: 'Festa Junina',
    description: 'Bandeirinhas coloridas entre os postes e clima de arraial.',
    price: 150,
    swatch: '#ef4444',
  },
  {
    id: 'inverno',
    name: 'Inverno na Vila',
    description: 'Neve caindo devagar sobre os telhados e a praça.',
    price: 150,
    swatch: '#bfdbfe',
  },
];

export function findCharacterSkin(id: string | undefined): CharacterSkin {
  return CHARACTER_SKINS.find(s => s.id === id) || CHARACTER_SKINS[0];
}

export function findPlazaTheme(id: string | undefined): PlazaTheme {
  return PLAZA_THEMES.find(t => t.id === id) || PLAZA_THEMES[0];
}

/** Item comprável (skin de personagem ou tema de praça) por id. */
export function findShopItem(id: string): { kind: 'skin' | 'theme'; price: number } | null {
  const skin = CHARACTER_SKINS.find(s => s.id === id);
  if (skin) return { kind: 'skin', price: skin.price };
  const theme = PLAZA_THEMES.find(t => t.id === id);
  if (theme) return { kind: 'theme', price: theme.price };
  return null;
}
