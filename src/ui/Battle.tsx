// The diorama camera orbits in; control returns only after the closing animation finishes.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  BATTLE_EFFECT_MS,
  BATTLE_ENTER_MS,
  BATTLE_EXIT_MS,
  battleItems,
  MOVES,
  useBattle,
  type Action,
  type BattleEvent,
  type Pop,
} from '../game/battle'
import { ITEMS } from '../game/inventory'
import { itemIconUrl } from '../gfx/itemIcons'
import { battleIconUrl, type BattleIcon } from '../gfx/battleIcons'
import { getMothSprites } from '../gfx/mothSprite'
import { DIR_ROWS, FRAME_H, FRAME_W, LOOKS, buildCharacterSheet } from '../gfx/characterSprites'
import { consumePress } from '../game/input'
import { BattleEffects } from './BattleEffects'
import './battle.css'

const portraits: Partial<Record<'player' | 'rowan', { front: string; side: string }>> = {}
function playerPortraits(look: 'player' | 'rowan' = 'player') {
  const cached = portraits[look]
  if (cached) return cached
  const texture = buildCharacterSheet(LOOKS[look])
  const crop = (row: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = FRAME_W
    canvas.height = FRAME_H
    canvas
      .getContext('2d')!
      .drawImage(texture.image as HTMLCanvasElement, 0, row * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H)
    return canvas.toDataURL()
  }
  const result = { front: crop(DIR_ROWS.indexOf('down')), side: crop(DIR_ROWS.indexOf('right')) }
  portraits[look] = result
  texture.dispose()
  return result
}

function Bar({ value, max, kind, label }: { value: number; max: number; kind: 'hp' | 'enemy'; label: string }) {
  return (
    <div
      className={`bar ${kind}`}
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div style={{ width: `${(100 * value) / max}%` }} />
    </div>
  )
}

type MenuEntry = {
  key: string
  label: string
  detail: string
  action?: Action
  submenu?: true
  disabled?: boolean
  icon?: string
}

const COMMAND_ICONS: Record<string, BattleIcon> = {
  attack: 'attack',
  defend: 'defend',
  items: 'items',
  continue: 'continue',
  retry: 'retry',
  back: 'back',
}

function CommandIcon({ command }: { command: string }) {
  const mask = `url("${battleIconUrl(COMMAND_ICONS[command] ?? 'items')}")`
  return <span className="command-icon" style={{ maskImage: mask, WebkitMaskImage: mask }} aria-hidden />
}

function FloatingPop({ pop }: { pop: Pop }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1500)
    return () => clearTimeout(timer)
  }, [])
  return visible ? <span className={`pop ${pop.kind}`}>{pop.text}</span> : null
}

export function BattleScreen() {
  const b = useBattle()
  const [menu, setMenu] = useState<'main' | 'items'>('main')
  const [sel, setSel] = useState(0)
  const [frame, setFrame] = useState(0)
  const [effect, setEffect] = useState<BattleEvent | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const moth = useMemo(() => getMothSprites().urls, [])
  const hero = useMemo(() => playerPortraits(), [])
  const rowan = useMemo(() => playerPortraits('rowan'), [])

  useEffect(() => {
    if (!b.active) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus({ preventScroll: true })
    const controls = document.querySelector('.topbar') as HTMLElement | null
    const wasInert = controls?.inert
    if (controls) controls.inert = true
    return () => {
      if (controls) controls.inert = wasInert ?? false
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [b.active, b.session])

  useEffect(() => {
    if (!b.active) return
    setFrame(0)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setFrame((f) => 1 - f), 220)
    return () => clearInterval(timer)
  }, [b.active, b.session])

  useEffect(() => {
    setMenu('main')
    setSel(0)
  }, [b.phase, b.turn, b.session])

  useEffect(() => {
    if (!b.active || !b.event) {
      setEffect(null)
      return
    }
    setEffect(b.event)
    const timer = setTimeout(() => setEffect(null), BATTLE_EFFECT_MS[b.event.kind])
    return () => clearTimeout(timer)
  }, [b.active, b.event])

  const entries: MenuEntry[] =
    b.phase === 'won'
      ? [{ key: 'continue', label: 'Return to the Lantern', detail: 'The light is yours to restore.' }]
      : b.phase === 'lost'
        ? [
            { key: 'retry', label: 'Try again', detail: 'Face the moth with your items restored.' },
            { key: 'back', label: 'Step back', detail: 'Return to the Lantern and choose again.' },
          ]
        : menu === 'main'
          ? [
              b.player.counter
                ? {
                    key: 'attack',
                    label: 'Counter-strike',
                    detail: '15–20 damage · removes 2 shields',
                    action: { type: 'attack' },
                  }
                : {
                    key: 'attack',
                    label: 'Attack',
                    detail: '10–13 damage · removes 1 shield',
                    action: { type: 'attack' },
                  },
              {
                key: 'defend',
                label: 'Defend',
                detail: 'Take 40% damage · ready a counter',
                action: { type: 'defend' },
              },
              { key: 'items', label: 'Items', detail: 'Healing supplies & elemental tricks', submenu: true },
            ]
          : (() => {
              const list = battleItems()
              return list.length
                ? list.map<MenuEntry>((it) => ({
                    key: it.id,
                    label: `${ITEMS[it.id].name} ×${it.qty}`,
                    detail: it.def.effect,
                    action: { type: 'item', id: it.id },
                    icon: itemIconUrl(it.id),
                  }))
                : [{ key: 'none', label: 'No usable items', detail: '', disabled: true }]
            })()
  const selected = Math.min(sel, entries.length - 1)
  const locked = b.phase === 'busy' || b.transition !== 'ready'
  const choose = (index: number) => {
    const entry = entries[index]
    if (!entry || entry.disabled || locked) return
    if (b.phase === 'won') return b.leave()
    if (b.phase === 'lost') return entry.key === 'retry' ? b.retry() : b.leave()
    if (entry.submenu) {
      setMenu('items')
      setSel(0)
    } else if (entry.action) b.act(entry.action)
  }

  useEffect(() => {
    if (!b.active) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      const confirm = ['KeyE', 'KeyZ', 'Enter', 'Space'].includes(ev.code)
      const down = ev.code === 'ArrowDown' || ev.code === 'KeyS'
      const up = ev.code === 'ArrowUp' || ev.code === 'KeyW'
      if (confirm || down || up || ev.code === 'Escape' || ev.code === 'Backspace') {
        ev.preventDefault()
        consumePress('interact')
        consumePress('menu')
        if (ev.repeat || locked) return
      } else if (ev.code === 'Tab') {
        const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        if (!buttons.length) {
          ev.preventDefault()
          return
        }
        const first = buttons[0],
          last = buttons[buttons.length - 1]
        if (ev.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          ev.preventDefault()
          last.focus()
        } else if (!ev.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
          ev.preventDefault()
          first.focus()
        }
        return
      }
      if (down) setSel((s) => (Math.min(s, entries.length - 1) + 1) % entries.length)
      else if (up) setSel((s) => (Math.min(s, entries.length - 1) - 1 + entries.length) % entries.length)
      else if (confirm) {
        const focused = document.activeElement as HTMLElement | null
        if (focused?.classList.contains('battle-back')) focused.click()
        else choose(selected)
      } else if ((ev.code === 'Escape' || ev.code === 'Backspace') && menu === 'items') {
        setMenu('main')
        setSel(2)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!b.active) return null
  const broken = b.enemy.breakTurns > 0
  const intent = MOVES[b.next]
  const charging = b.next === 'burst' && !broken && b.phase !== 'won' && b.phase !== 'lost'
  const effectClass = effect ? ` effect-${effect.kind}${effect.guarded ? ' effect-guarded' : ''}` : ''
  const terminal = b.phase === 'won' || b.phase === 'lost'
  const style = { '--enter-ms': `${BATTLE_ENTER_MS}ms`, '--exit-ms': `${BATTLE_EXIT_MS}ms` } as CSSProperties
  return (
    <div
      ref={panel}
      key={b.session}
      className={`battle ${b.transition}${effectClass}${charging ? ' charging' : ''}${broken ? ' enemy-broken' : ''} outcome-${b.phase}`}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label="Battle with the gloam moth"
      tabIndex={-1}
    >
      <div className="battle-veil" aria-hidden />
      <div className="battle-aperture" aria-hidden />
      <div className="battle-letterbox top" aria-hidden />
      <div className="battle-letterbox bottom" aria-hidden />
      <div className="encounter-title" aria-hidden>
        <span>The Last Lantern</span>
        <strong>Gloam Moth</strong>
        <i>A hunger older than the flame</i>
      </div>
      <header className="battle-heading">
        <div>
          <span className="battle-eyebrow">The Last Lantern</span>
          <p>
            Riverside Mill <span> / </span> A light in the gloam
          </p>
        </div>
        <div className="battle-turn">
          <small>Encounter</small>
          <span>Turn {String(b.turn).padStart(2, '0')}</span>
        </div>
      </header>
      <div className="battle-arena">
        <div className="arena-horizon" aria-hidden />
        <div className="arena-floor" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <div className="arena-motes" aria-hidden>
          {Array.from({ length: 16 }, (_, i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <div className={`battle-intent ${intent.danger}${terminal ? ' hidden' : ''}`} aria-live="polite">
          <span className="intent-symbol" aria-hidden>
            {broken ? '◇' : intent.danger === 'high' ? '✦' : '◈'}
          </span>
          <div>
            <small>{broken ? 'Opening' : 'Next move'}</small>
            <strong>{broken ? 'Guard broken' : MOVES[b.next].name}</strong>
            <p>
              {broken
                ? 'Vulnerable — strike for double damage.'
                : b.next === 'gather'
                  ? 'A heavy attack follows. Prepare your guard.'
                  : b.next === 'burst'
                    ? 'Heavy attack incoming — Defend or Break.'
                    : b.next === 'drink'
                      ? 'The moth will draw strength from the flame.'
                      : 'A sweep of cold wind from its wings.'}
            </p>
          </div>
        </div>
        <div className="battle-enemy">
          <div className="enemy-aura" aria-hidden />
          <div className={`moth${broken ? ' broken' : ''}${b.phase === 'won' ? ' fled' : ''}`}>
            <div
              key={effect?.id ?? 0}
              className={`moth-motion ${effect?.target === 'enemy' ? `react-${effect.kind}` : ''}${effect?.kind === 'buffet' || effect?.kind === 'burst' ? ` cast-${effect.kind}` : ''}`}
            >
              <img
                src={moth[frame]}
                alt="A great ivory and violet moth with luminous lantern markings"
                draggable={false}
              />
            </div>
          </div>
          {b.pops
            .filter((p) => p.who === 'enemy')
            .map((p) => (
              <FloatingPop key={p.key} pop={p} />
            ))}
          <div className="enemy-info">
            <span className="enemy-epithet">Feaster on the Last Light</span>
            <div className="enemy-name">
              Gloam Moth {broken && <span className="break-tag">BREAK</span>}
              <span className="enemy-hp">
                {b.enemy.hp} <small>/ {b.enemy.max}</small>
              </span>
            </div>
            <Bar value={b.enemy.hp} max={b.enemy.max} kind="enemy" label="Gloam moth health" />
            <div className="shields" aria-label={`${b.enemy.shield} shield points`}>
              {Array.from({ length: b.enemy.maxShield }, (_, i) => (
                <span key={i} className={i < b.enemy.shield ? 'pip on' : 'pip'} />
              ))}
              <span className="shield-label">Guard</span>
              <span className="weak">
                <img src={itemIconUrl('oil')} width={20} height={20} alt="" /> Weak to fire
              </span>
            </div>
          </div>
        </div>
        <div
          className={`battle-traveller${b.player.defending ? ' guarding' : ''}${b.player.hp <= 0 ? ' fallen' : ''}`}
        >
          <div className="traveller-shadow" aria-hidden />
          <div
            key={effect?.id ?? 0}
            className={`traveller-motion ${effect && (effect.target === 'player' || (!effect.actor && ['attack', 'counter', 'fire', 'blind', 'defend'].includes(effect.kind))) ? `react-${effect.outcome === 'miss' ? 'miss' : effect.kind}` : ''}`}
          >
            <img src={hero.side} alt="Traveller facing the moth" draggable={false} />
          </div>
          {b.player.defending && <div className="traveller-guard" aria-hidden />}
          {b.pops
            .filter((p) => p.who === 'player')
            .map((p) => (
              <FloatingPop key={p.key} pop={p} />
            ))}
          <span className="traveller-label">Traveller</span>
        </div>
        {b.rowan && (
          <div className={`battle-traveller battle-companion${b.rowan.hp <= 0 ? ' fallen' : ''}`}>
            <div className="traveller-shadow" aria-hidden />
            <div key={effect?.id ?? 0} className={`traveller-motion ${effect && (effect.actor === 'rowan' || effect.target === 'rowan') ? `react-${effect.kind}` : ''}`}>
              <img src={rowan.side} alt="Elder Rowan fighting alongside the traveller" draggable={false} />
            </div>
            {b.pops.filter((p) => p.who === 'rowan').map((p) => <FloatingPop key={p.key} pop={p} />)}
            <span className="traveller-label">Elder Rowan</span>
            <Bar value={b.rowan.hp} max={b.rowan.max} kind="hp" label="Elder Rowan health" />
            <span className="companion-health">{b.rowan.hp} / {b.rowan.max} HP</span>
          </div>
        )}
        {effect && <BattleEffects key={effect.id} event={effect} />}
        {terminal && (
          <div className={`battle-result ${b.phase}`} role="status">
            <span>{b.phase === 'won' ? 'The flame endures' : 'A light still waits'}</span>
            <strong>{b.phase === 'won' ? 'Victory' : 'Overwhelmed'}</strong>
          </div>
        )}
      </div>
      <div className="battle-console">
        <section className="hero" aria-label="Traveller status">
          <img className="portrait" src={hero.front} alt="" />
          <div className="hero-info">
            <div className="hero-name">Traveller</div>
            <div className="hero-condition">
              {b.player.defending
                ? 'Guard raised'
                : b.player.counter
                  ? 'Counter-strike ready'
                  : b.player.hp <= 0 ? 'Down — Rowan fights on' : b.rowan ? `Rowan: ${b.rowan.hp > 0 ? `${b.rowan.heals} heals left · auto support` : 'Down'}` : 'Lantern Warden’s envoy'}
            </div>
            <Bar value={b.player.hp} max={b.player.max} kind="hp" label="Traveller health" />
            <div className="hp-num">
              {b.player.hp}
              <span> / {b.player.max} HP</span>
            </div>
          </div>
        </section>
        <div className="battle-narration">
          <span>{terminal ? 'The encounter ends' : locked ? 'The battle unfolds' : 'Choose your next move'}</span>
          <p className="battle-msg" aria-live="polite">
            {b.message}
          </p>
          <small>{b.phase === 'command' && !locked ? '↑ ↓ Choose · E / Enter Confirm' : ' '}</small>
        </div>
        <nav
          className={`commands${locked ? ' busy' : ''}${menu === 'items' ? ' item-menu' : ''}`}
          aria-label="Battle commands"
        >
          <div className="menu-title">
            {terminal ? 'Continue your story' : menu === 'items' ? 'Satchel' : 'Your move'}
            {menu === 'items' && !terminal && (
              <button
                className="battle-back"
                onClick={() => {
                  setMenu('main')
                  setSel(2)
                }}
                disabled={locked}
              >
                ← Back
              </button>
            )}
          </div>
          <div className="command-list">
            {entries.map((entry, i) => (
              <button
                key={entry.key}
                data-battle-command={i}
                className={`${i === selected ? 'on' : ''}${entry.disabled ? ' off' : ''}`}
                disabled={locked || entry.disabled}
                onPointerEnter={() => setSel(i)}
                onFocus={() => setSel(i)}
                onClick={() => choose(i)}
              >
                {entry.icon ? (
                  <img src={entry.icon} width={28} height={28} alt="" />
                ) : (
                  <CommandIcon command={entry.key} />
                )}
                <span>
                  {entry.label}
                  <small>{entry.detail}</small>
                </span>
                <b aria-hidden>›</b>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
