import type { CSSProperties } from 'react'
import type { BattleEvent } from '../game/battle'

/** Effects use the arena's anchors so impacts stay aligned across screen sizes. */
export function BattleEffects({ event }: { event: BattleEvent }) {
  const heavy = event.kind === 'burst'
  const attack = event.kind === 'attack' || event.kind === 'counter'
  const enemyAttack = event.kind === 'buffet' || heavy
  return (
    <div
      className={`battle-fx fx-${event.kind}${event.guarded ? ' guarded' : ''}${event.outcome === 'miss' ? ' missed' : ''}${event.target === 'rowan' ? ' target-rowan' : ''}`}
      aria-hidden
    >
      {attack && (
        <div className="fx-at-enemy">
          <i className="blade-trail" />
          <i className="blade-trail second" />
          <div className="impact-star" />
        </div>
      )}
      {event.kind === 'buffet' && (
        <>
          <div className="wind-source" />
          {[0, 1, 2].map((i) => (
            <i className="wind-arc" key={i} style={{ '--i': i } as CSSProperties} />
          ))}
          <div className="fx-at-player">
            <div className="wind-impact" />
          </div>
        </>
      )}
      {heavy && (
        <>
          <div className="fx-at-enemy">
            <div className="gloam-core" />
            <div className="gloam-orbit" />
          </div>
          <div className="burst-wave" />
          <div className="burst-wave second" />
          <div className="burst-wash" />
          <div className="fx-at-player">
            <div className="burst-impact" />
          </div>
        </>
      )}
      {event.kind === 'gather' && (
        <div className="fx-at-enemy">
          <div className="gather-ring" />
          <div className="gather-ring second" />
          <div className="gather-star" />
        </div>
      )}
      {(event.kind === 'heal' || event.kind === 'drink') && (
        <div className={event.target === 'enemy' ? 'fx-at-enemy' : 'fx-at-player'}>
          <div className="healing-ring" />
          <div className="healing-column" />
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} className="healing-spark" style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
      {event.kind === 'defend' && (
        <div className="fx-at-player">
          <div className="guard-dome" />
          <div className="guard-rune">◇</div>
        </div>
      )}
      {event.kind === 'fire' && (
        <>
          <div className="fire-projectile" />
          <div className="fx-at-enemy">
            <div className="fire-bloom" />
            <div className="fire-ring" />
          </div>
        </>
      )}
      {event.kind === 'blind' && (
        <div className="fx-at-enemy">
          {Array.from({ length: 7 }, (_, i) => (
            <i key={i} className="flour-cloud" style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
      {(event.breaks || event.kind === 'break') && (
        <div className="fx-at-enemy">
          <div className="break-ring" />
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} className="shield-shard" style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
      {enemyAttack && event.guarded && (
        <div className="fx-at-player">
          <div className="guard-dome impact" />
          <div className="guard-rune">◇</div>
        </div>
      )}
      {(attack || enemyAttack || event.kind === 'fire') && (
        <div className={event.target === 'enemy' ? 'fx-at-enemy' : 'fx-at-player'}>
          {Array.from({ length: heavy ? 12 : 7 }, (_, i) => (
            <i key={i} className="hit-spark" style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
    </div>
  )
}
