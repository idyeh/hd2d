import { create } from 'zustand'

const SAVE_KEY = 'hd2d-party-v1'
function loadRowan() {
  try { return localStorage.getItem(SAVE_KEY) === 'rowan' } catch { return false }
}

/** Recruitment persists; battle health resets for each encounter. */
export const useParty = create<{ rowan: boolean; recruitRowan: () => void; reset: () => void }>((set) => ({
  rowan: loadRowan(),
  recruitRowan: () => set({ rowan: true }),
  reset: () => set({ rowan: false }),
}))
useParty.subscribe((s) => {
  try { localStorage.setItem(SAVE_KEY, s.rowan ? 'rowan' : '') } catch { /* Best-effort saving. */ }
})
