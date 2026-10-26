// Story overlays: the opening card, the objective tracker and the ending card with replay.
import { useEffect, useRef, useState } from 'react'
import { ENDINGS, objectiveFor, useStory } from '../game/story'
import { useInventory } from '../game/inventory'
import { runtime, useGame } from '../game/state'
import { consumePress } from '../game/input'
import { sound } from '../game/audio'
import { getBody, placeBody } from '../game/world/collision'
import { useParty } from '../game/party'
import { PLAYER_SPAWN } from '../game/world/layout'

/** Start over: story, bag and searched spots, time of day, and the player back at the road. */
export function newGame() {
  const g = useGame.getState()
  useParty.getState().reset()
  useStory.getState().reset()
  useInventory.getState().reset()
  useGame.setState({ visits: {}, night: false, dialogue: null, inventoryOpen: false, menuOpen: false })
  // Elsewhere (the mill, an interior), a reload is the simplest clean restart.
  if (g.sceneId !== 'elmbrook' || g.area !== 'outdoor') {
    location.reload()
    return
  }
  runtime.tod = 0
  const body = getBody('player')
  if (body) placeBody(body, PLAYER_SPAWN.x, PLAYER_SPAWN.z)
  // The controller is paused under the intro card, so move the camera's target directly too.
  Object.assign(runtime.player, { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, facing: PLAYER_SPAWN.facing, moving: false })
  runtime.forceFacing = PLAYER_SPAWN.facing
  runtime.cameraCut = true
}

/** Confirm-style key handling for full-screen cards (E / Enter / Space). */
function useConfirmKey(active: boolean, onConfirm: () => void, onCancel?: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const confirm = e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space'
      if ((confirm || e.code === 'Escape') && e.repeat) {
        e.preventDefault()
        consumePress(confirm ? 'interact' : 'menu')
        return
      }
      const target = e.target instanceof Element ? e.target : null
      if ((e.code === 'Enter' || e.code === 'Space') && target?.closest('button, input, select, textarea, a[href]')) {
        consumePress('interact')
        return // Preserve the selected button's native activation (including Play again).
      }
      if (confirm) {
        e.preventDefault()
        consumePress('interact')
        onConfirm()
      } else if (e.code === 'Escape' && onCancel) {
        e.preventDefault()
        consumePress('menu')
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
}

export function IntroCard() {
  const stage = useStory((s) => s.stage)
  const ready = useGame((s) => s.ready)
  const open = ready && stage === 'intro'
  const begin = () => {
    useStory.getState().begin()
    useGame.getState().showBanner('Elmbrook', 'A village at the edge of the Whisperwood')
    sound.chime()
  }
  useConfirmKey(open, begin)
  if (!open) return null
  return (
    <div className="story-card intro" role="dialog" aria-label="The Last Lantern">
      <div className="story-inner">
        <p className="kicker">An Elmbrook tale</p>
        <h1>The Last Lantern</h1>
        <div className="banner-rule" />
        <p>
          Three days ago, in Port Calder, a stranger in a heron-grey cloak pressed a sealed letter into your hands.
          <em> “For Elder Rowan of Elmbrook — before the lanterns fail.”</em>
        </p>
        <p>The Highroad has brought you, at last, to the edge of the Whisperwood.</p>
        <p className="goal">
          <span>Objective</span>
          Deliver the sealed letter to Elder Rowan.
        </p>
        <button className="story-btn" onClick={begin} autoFocus>
          Begin <kbd>E</kbd>
        </button>
      </div>
    </div>
  )
}

export function ObjectiveTracker() {
  const stage = useStory((s) => s.stage)
  const sceneId = useGame((s) => s.sceneId)
  // Re-evaluate when the bag changes (the cottage step depends on what you carry).
  useInventory((s) => s.slots)
  const obj = objectiveFor(stage, sceneId, (id) => useInventory.getState().has(id))
  const [flash, setFlash] = useState(0)
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (!obj) return
    if (last.current !== null && last.current !== obj.text) {
      setFlash((f) => f + 1)
      sound.chime()
    }
    last.current = obj.text
  }, [obj?.text])
  if (!obj) return null
  return (
    <section key={flash} className={flash ? 'objective updated' : 'objective'} aria-live="polite" aria-label="Current objective">
      <h2>The Last Lantern</h2>
      <p className="objective-text">{obj.text}</p>
      <p className="objective-detail">{obj.detail}</p>
    </section>
  )
}

export function EndingCard() {
  const show = useStory((s) => s.showEnding)
  const ending = useStory((s) => s.ending)
  const battles = useStory((s) => s.battles)
  const looted = useInventory((s) => s.looted)
  const [confirmReplay, setConfirmReplay] = useState(false)
  useEffect(() => {
    if (!show) setConfirmReplay(false)
  }, [show])
  const close = () => useStory.getState().dismissEnding()
  const replay = () => {
    useStory.getState().dismissEnding()
    newGame()
  }
  useConfirmKey(show, close, close)
  if (!show || !ending) return null
  const e = ENDINGS[ending]
  const searched = Object.keys(looted).filter((k) => k.startsWith('cottage-')).length
  return (
    <div className="story-card ending" role="dialog" aria-label="Ending">
      <div className="story-inner">
        <p className="kicker">The Last Lantern</p>
        <h1>{e.title}</h1>
        <div className="banner-rule" />
        <p>{e.summary}</p>
        <ul className="recap">
          <li>Delivered Warden Ilse’s letter to Elder Rowan</li>
          <li>Searched {searched} of 4 places in Ashdown Cottage</li>
          <li>Freed Brann from the mill storehouse</li>
          <li>
            {ending === 'fireflies'
              ? 'Fed the starving gloam moth — no blade drawn'
              : `Drove off the gloam moth${battles > 1 ? ` (after ${battles} attempts)` : ''}`}
          </li>
        </ul>
        <p className="other">
          {ending === 'fireflies'
            ? 'Another path ends with the brightest lanterns in the valley — at a price.'
            : 'Another path ends with green-gold lanterns and a night full of fireflies.'}
        </p>
        <div className="story-actions">
          <button className="story-btn" onClick={close} autoFocus>
            Keep exploring <kbd>E</kbd>
          </button>
          <button
            className="story-btn secondary"
            onClick={() => (confirmReplay ? replay() : setConfirmReplay(true))}
          >
            {confirmReplay ? 'Click again to start over' : 'Play again'}
          </button>
        </div>
      </div>
    </div>
  )
}
