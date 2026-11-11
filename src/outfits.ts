/**
 * Rider outfits sold in the garage (jersey, pants, gloves, helmet). "Aux couleurs de la moto"
 * is free and follows the bike being ridden; the 10 others are fixed colour sets.
 */
export interface Outfit {
  id: string;
  name: string;
  price: number;
  /** null = colours of the bike. */
  colors: { jersey: string; accent: string; trim: string; pants: string; helmet: string; text: string } | null;
}

export const OUTFITS: Outfit[] = [
  { id: 'moto', name: 'Aux couleurs de la moto', price: 0, colors: null },
  { id: 'feu', name: 'Rouge Feu', price: 400, colors: { jersey: '#d8261f', accent: '#1a1a1e', trim: '#ffffff', pants: '#2a2a2e', helmet: '#d8261f', text: '#ffffff' } },
  { id: 'ocean', name: 'Bleu Océan', price: 550, colors: { jersey: '#1f6fd6', accent: '#ffffff', trim: '#ffd21f', pants: '#1a3a6a', helmet: '#1f6fd6', text: '#ffffff' } },
  { id: 'citron', name: 'Jaune Citron', price: 700, colors: { jersey: '#ffd21f', accent: '#1a1a1e', trim: '#1a1a1e', pants: '#2a2a2e', helmet: '#ffd21f', text: '#1a1a1e' } },
  { id: 'jungle', name: 'Vert Jungle', price: 900, colors: { jersey: '#2fa84f', accent: '#0f3a1e', trim: '#d8ff3a', pants: '#1f3a26', helmet: '#2fa84f', text: '#ffffff' } },
  { id: 'orange', name: 'Orange Volcan', price: 1100, colors: { jersey: '#ff7a1a', accent: '#1f2a44', trim: '#ffffff', pants: '#1f2a44', helmet: '#ff7a1a', text: '#ffffff' } },
  { id: 'violet', name: 'Violet Galaxie', price: 1350, colors: { jersey: '#7a3fd1', accent: '#14d1c0', trim: '#ffffff', pants: '#2a1a4a', helmet: '#7a3fd1', text: '#ffffff' } },
  { id: 'rose', name: 'Rose Flash', price: 1700, colors: { jersey: '#e84a8a', accent: '#ffffff', trim: '#1a1a1e', pants: '#3a1a2a', helmet: '#e84a8a', text: '#ffffff' } },
  { id: 'arctique', name: 'Blanc Arctique', price: 2000, colors: { jersey: '#f2f4f8', accent: '#4fb3ff', trim: '#1a1a1e', pants: '#d0d6e0', helmet: '#f2f4f8', text: '#1a3a6a' } },
  { id: 'nuit', name: 'Noir Minuit', price: 2700, colors: { jersey: '#1e1e24', accent: '#14d1c0', trim: '#14d1c0', pants: '#141418', helmet: '#1e1e24', text: '#14d1c0' } },
  { id: 'or', name: 'Or Champion', price: 4000, colors: { jersey: '#e2b23a', accent: '#1a1a1e', trim: '#fff4c0', pants: '#1a1a1e', helmet: '#f6c23a', text: '#1a1a1e' } },
];

export function outfitById(id: string): Outfit {
  return OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
}
