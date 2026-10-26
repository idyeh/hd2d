// Run with: node --test tests/battle.test.mjs
// Exercise the production stores with a deterministic clock; audio is an output-only adapter.
// The project's TypeScript dependency handles extensionless browser imports without adding a runner.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = new Map()

function harness() {
  let now = 0
  let sequence = 0
  const jobs = new Map()
  const storage = new Map()
  const sounds = []
  const setTimeout = (fn, delay) => {
    const id = ++sequence
    jobs.set(id, { fn, at: now + delay })
    return id
  }
  const clearTimeout = (id) => jobs.delete(id)
  const nextJob = () => [...jobs.entries()].sort((a, b) => a[1].at - b[1].at)[0]
  const tick = (ms) => {
    const end = now + ms
    let next
    while ((next = nextJob()) && next[1].at <= end) {
      jobs.delete(next[0])
      now = next[1].at
      next[1].fn()
    }
    now = end
  }
  const next = () => {
    const job = nextJob()
    assert.ok(job, 'expected a pending battle beat')
    tick(job[1].at - now)
  }
  const math = Object.create(Math)
  math.random = () => 0
  const localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  const load = (path, imports = {}) => {
    if (!source.has(path)) {
      source.set(path, ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText)
    }
    const module = { exports: {} }
    const resolve = (id) => Object.hasOwn(imports, id) ? imports[id] : require(id)
    new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', 'Math', 'localStorage', source.get(path))(
      resolve, module, module.exports, setTimeout, clearTimeout, math, localStorage,
    )
    return module.exports
  }
  const inventory = load('../src/game/inventory.ts')
  const party = load('../src/game/party.ts')
  const api = load('../src/game/battle.ts', {
    './inventory': inventory,
    './party': party,
    './audio': { sound: new Proxy({}, { get: (_, name) => () => sounds.push(name) }) },
  })
  const battle = api.useBattle
  const start = (handlers = { onWin() {} }) => {
    battle.getState().start(handlers)
    tick(api.BATTLE_ENTER_MS)
  }
  const round = (action) => {
    battle.getState().act(action)
    next()
    const enemyBeat = battle.getState().event
    next()
    return enemyBeat
  }
  return { ...api, party: party.useParty, load, storage, inventory: inventory.useInventory, battle, sounds, tick, next, start, round, jobs }
}

test('inactive and entering encounters reject actions, retry and leave', () => {
  const h = harness()
  const b = h.battle
  b.getState().act({ type: 'attack' })
  b.getState().retry()
  b.getState().leave()
  assert.equal(b.getState().active, false)
  assert.equal(b.getState().enemy.hp, 90)
  assert.equal(h.jobs.size, 0)
  b.getState().start({ onWin() {} })
  assert.equal(b.getState().transition, 'entering')
  b.getState().act({ type: 'item', id: 'herb' })
  assert.equal(h.inventory.getState().count('herb'), 3)
  h.tick(h.BATTLE_ENTER_MS - 1)
  b.getState().act({ type: 'attack' })
  assert.equal(b.getState().enemy.hp, 90)
  h.tick(1)
  assert.equal(b.getState().transition, 'ready')
  assert.equal(b.getState().session, 1)
})

test('one action owns its entire player and enemy presentation window', () => {
  const h = harness()
  h.start()
  h.battle.getState().act({ type: 'attack' })
  const first = h.battle.getState().event
  assert.equal(first.kind, 'attack')
  assert.equal(first.target, 'enemy')
  h.battle.getState().act({ type: 'attack' })
  assert.equal(h.battle.getState().enemy.hp, 80)
  assert.equal(h.battle.getState().event.id, first.id)
  h.next()
  assert.equal(h.battle.getState().event.kind, 'buffet')
  assert.equal(h.battle.getState().player.hp, 42)
  assert.equal(h.battle.getState().phase, 'busy')
  h.next()
  assert.equal(h.battle.getState().phase, 'command')
  assert.equal(h.battle.getState().turn, 2)
  assert.equal(h.battle.getState().event, null)
})

test('guarded enemy attacks retain their move identity and prepare a counter', () => {
  const h = harness()
  h.start()
  const beat = h.round({ type: 'defend' })
  assert.equal(beat.kind, 'buffet')
  assert.equal(beat.guarded, true)
  assert.equal(beat.outcome, 'guarded')
  assert.equal(h.battle.getState().player.hp, 47)
  assert.equal(h.battle.getState().player.counter, true)
  h.battle.getState().act({ type: 'attack' })
  assert.equal(h.battle.getState().event.kind, 'counter')
  assert.equal(h.battle.getState().enemy.hp, 75)
  assert.equal(h.battle.getState().enemy.shield, 2)
  assert.equal(h.battle.getState().player.counter, false)
})

test('flour survives a gathering turn and a missed burst still emits burst', () => {
  const h = harness()
  h.inventory.getState().add('flour')
  h.start()
  h.battle.setState((s) => ({ enemy: { ...s.enemy, step: 1 }, next: 'gather' }))
  h.battle.getState().act({ type: 'item', id: 'flour' })
  assert.equal(h.battle.getState().event.kind, 'blind')
  h.next()
  assert.equal(h.battle.getState().event.kind, 'gather')
  assert.equal(h.battle.getState().enemy.blinded, true)
  h.next()
  h.battle.getState().act({ type: 'attack' })
  h.next()
  assert.equal(h.battle.getState().event.kind, 'burst')
  assert.equal(h.battle.getState().event.outcome, 'miss')
  assert.equal(h.battle.getState().player.hp, 50)
  assert.equal(h.battle.getState().enemy.blinded, false)
  h.tick(1349)
  assert.equal(h.battle.getState().phase, 'busy')
  h.next()
  assert.equal(h.battle.getState().phase, 'command')
})

test('a break cancels the charged burst, skips one enemy action and doubles the next attack', () => {
  const h = harness()
  h.start()
  h.battle.setState((s) => ({ enemy: { ...s.enemy, shield: 1, step: 2 }, next: 'burst' }))
  h.battle.getState().act({ type: 'attack' })
  assert.equal(h.battle.getState().event.kind, 'attack')
  assert.equal(h.battle.getState().event.breaks, true)
  assert.equal(h.battle.getState().next, 'buffet')
  h.next()
  assert.equal(h.battle.getState().event.kind, 'break')
  assert.equal(h.battle.getState().player.hp, 50)
  assert.equal(h.battle.getState().enemy.breakTurns, 1)
  h.next()
  h.battle.getState().act({ type: 'attack' })
  assert.equal(h.battle.getState().enemy.hp, 60)
  h.next()
  assert.equal(h.battle.getState().enemy.shield, 4)
  assert.equal(h.battle.getState().enemy.breakTurns, 0)
  assert.equal(h.battle.getState().event.kind, 'buffet')
  assert.equal(h.battle.getState().player.hp, 42)
})

test('breaking the flexible move does not silently change the announced intent', () => {
  const h = harness()
  h.start()
  h.battle.setState((s) => ({ enemy: { ...s.enemy, hp: 50, shield: 1, step: 4 }, next: 'buffet' }))
  h.round({ type: 'attack' })
  assert.equal(h.battle.getState().enemy.hp, 40)
  assert.equal(h.battle.getState().next, 'buffet')
  const beat = h.round({ type: 'attack' })
  assert.equal(beat.kind, 'buffet')
  assert.equal(h.battle.getState().enemy.hp, 20)
})

test('healing and drink light publish distinct events and clamp healing', () => {
  const h = harness()
  h.start()
  h.battle.setState((s) => ({ player: { ...s.player, hp: 40 }, enemy: { ...s.enemy, hp: 20, step: 4 }, next: 'drink' }))
  h.battle.getState().act({ type: 'item', id: 'herb' })
  assert.equal(h.battle.getState().event.kind, 'heal')
  assert.equal(h.battle.getState().event.target, 'player')
  assert.equal(h.battle.getState().player.hp, 50)
  assert.equal(h.inventory.getState().count('herb'), 2)
  h.next()
  assert.equal(h.battle.getState().event.kind, 'drink')
  assert.equal(h.battle.getState().event.target, 'enemy')
  assert.equal(h.battle.getState().enemy.hp, 34)
})

test('missing and noncombat items neither consume a turn nor schedule a timer', () => {
  const h = harness()
  h.start()
  h.battle.getState().act({ type: 'item', id: 'oil' })
  h.battle.getState().act({ type: 'item', id: 'letter' })
  assert.equal(h.battle.getState().phase, 'command')
  assert.equal(h.battle.getState().event, null)
  assert.equal(h.inventory.getState().count('letter'), 1)
  assert.equal(h.jobs.size, 0)
})

test('retry restores the original bag, resets presentation and rejects active restarts', () => {
  const h = harness()
  let retries = 0
  h.inventory.getState().add('oil')
  h.start({ onWin() {}, onRetry() { retries++ } })
  h.battle.setState((s) => ({ player: { ...s.player, hp: 1 } }))
  h.battle.getState().act({ type: 'item', id: 'oil' })
  assert.equal(h.battle.getState().event.kind, 'fire')
  h.battle.getState().start({ onWin() {}, onRetry() { throw new Error('active restart replaced callbacks') } })
  assert.equal(h.battle.getState().session, 1)
  h.next()
  h.next()
  assert.equal(h.battle.getState().phase, 'lost')
  assert.equal(h.inventory.getState().count('oil'), 0)
  h.battle.getState().retry()
  assert.equal(retries, 1)
  assert.equal(h.inventory.getState().count('oil'), 1)
  assert.equal(h.battle.getState().session, 2)
  assert.equal(h.battle.getState().transition, 'entering')
  assert.equal(h.battle.getState().hitEnemy, 0)
  assert.equal(h.battle.getState().hitPlayer, 0)
  assert.equal(h.battle.getState().event, null)
  assert.deepEqual(h.battle.getState().pops, [])
  h.battle.getState().retry()
  assert.equal(retries, 1)
  h.tick(h.BATTLE_ENTER_MS)
  assert.equal(h.battle.getState().phase, 'command')
  assert.equal(h.battle.getState().player.hp, 50)
  assert.equal(h.jobs.size, 0)
})

test('victory waits for the exit and calls the story once without restoring used items', () => {
  const h = harness()
  let wins = 0
  h.inventory.getState().add('oil')
  h.start({ onWin() { wins++ } })
  h.battle.setState((s) => ({ enemy: { ...s.enemy, hp: 1 } }))
  h.battle.getState().act({ type: 'item', id: 'oil' })
  h.next()
  assert.equal(h.battle.getState().phase, 'won')
  assert.equal(h.battle.getState().event.kind, 'recoil')
  h.battle.getState().leave()
  h.battle.getState().leave()
  h.battle.getState().retry()
  h.battle.getState().act({ type: 'attack' })
  assert.equal(h.battle.getState().active, true)
  assert.equal(h.battle.getState().transition, 'leaving')
  h.tick(h.BATTLE_EXIT_MS - 1)
  assert.equal(wins, 0)
  h.tick(1)
  assert.equal(wins, 1)
  assert.equal(h.battle.getState().active, false)
  assert.equal(h.inventory.getState().count('oil'), 0)
  h.battle.getState().leave()
  h.tick(5000)
  assert.equal(wins, 1)
})

test('retreat restores items after its exit, before a callback starts a new encounter', () => {
  const h = harness()
  let retreats = 0
  h.inventory.getState().add('oil')
  h.start({ onWin() {}, onRetreat() {
    retreats++
    assert.equal(h.inventory.getState().count('oil'), 1)
    h.battle.getState().start({ onWin() {} })
  } })
  h.battle.setState((s) => ({ player: { ...s.player, hp: 1 } }))
  h.round({ type: 'item', id: 'oil' })
  h.battle.getState().leave()
  assert.equal(h.inventory.getState().count('oil'), 0)
  h.tick(h.BATTLE_EXIT_MS)
  assert.equal(retreats, 1)
  assert.equal(h.battle.getState().session, 2)
  assert.equal(h.battle.getState().active, true)
  assert.equal(h.battle.getState().transition, 'entering')
  h.tick(h.BATTLE_ENTER_MS + 5000)
  assert.equal(h.battle.getState().phase, 'command')
  assert.equal(h.battle.getState().transition, 'ready')
  assert.equal(h.battle.getState().player.hp, 50)
  assert.equal(h.inventory.getState().count('oil'), 1)
})


test('recruitment persists, reloads and resets', () => {
  const h = harness()
  assert.equal(h.party.getState().rowan, false)
  h.party.getState().recruitRowan()
  assert.equal(h.storage.get('hd2d-party-v1'), 'rowan')
  assert.equal(h.load('../src/game/party.ts').useParty.getState().rowan, true)
  h.start()
  assert.equal(h.battle.getState().rowan.hp, 36)
  h.party.getState().reset()
  assert.equal(h.load('../src/game/party.ts').useParty.getState().rowan, false)
})

test('Rowan acts after the player and breaks a charged burst', () => {
  const h = harness()
  h.party.getState().recruitRowan()
  h.start()
  h.battle.setState((s) => ({ enemy: { ...s.enemy, shield: 2, step: 2 }, next: 'burst' }))
  h.battle.getState().act({ type: 'attack' })
  h.next()
  assert.equal(h.battle.getState().event.actor, 'rowan')
  assert.equal(h.battle.getState().event.breaks, true)
  assert.equal(h.battle.getState().enemy.hp, 74)
  assert.equal(h.battle.getState().next, 'buffet')
  h.battle.getState().act({ type: 'attack' })
  assert.equal(h.battle.getState().enemy.hp, 74)
  h.next()
  assert.equal(h.battle.getState().event.kind, 'break')
  assert.equal(h.battle.getState().player.hp, 50)
  h.next()
  assert.equal(h.battle.getState().phase, 'command')
  assert.equal(h.battle.getState().turn, 2)
})

test('Rowan heals with limited charges, without consuming inventory', () => {
  const h = harness()
  h.party.getState().recruitRowan()
  h.start()
  h.battle.setState((s) => ({ player: { ...s.player, hp: 15 } }))
  h.battle.getState().act({ type: 'defend' })
  h.next()
  assert.equal(h.battle.getState().event.actor, 'rowan')
  assert.equal(h.battle.getState().event.kind, 'heal')
  assert.equal(h.battle.getState().player.hp, 33)
  assert.equal(h.battle.getState().rowan.heals, 2)
  assert.equal(h.inventory.getState().count('herb'), 3)
  h.next()
  h.next()
  h.battle.setState((s) => ({ rowan: { ...s.rowan, heals: 0 }, player: { ...s.player, hp: 15 } }))
  h.battle.getState().act({ type: 'defend' })
  h.next()
  assert.equal(h.battle.getState().event.kind, 'attack')
  assert.equal(h.battle.getState().player.hp, 15)
})

test('enemy targets Rowan on alternate rounds; fallen Rowan stops acting', () => {
  const h = harness()
  h.party.getState().recruitRowan()
  h.start()
  h.battle.setState((s) => ({ turn: 2, rowan: { ...s.rowan, hp: 1 } }))
  h.battle.getState().act({ type: 'defend' })
  h.next()
  h.next()
  assert.equal(h.battle.getState().event.target, 'rowan')
  assert.equal(h.battle.getState().rowan.hp, 0)
  assert.equal(h.battle.getState().player.hp, 50)
  h.next()
  assert.equal(h.battle.getState().phase, 'command')
  h.battle.getState().act({ type: 'attack' })
  h.next()
  assert.equal(h.battle.getState().event.kind, 'gather')
})

test('Rowan continues and can win after the hero falls', () => {
  const h = harness()
  h.party.getState().recruitRowan()
  h.start()
  h.battle.setState((s) => ({ player: { ...s.player, hp: 1 }, rowan: { ...s.rowan, heals: 0 }, enemy: { ...s.enemy, hp: 19 } }))
  h.battle.getState().act({ type: 'attack' })
  h.next()
  h.next()
  assert.equal(h.battle.getState().player.hp, 0)
  h.next()
  assert.equal(h.battle.getState().event.actor, 'rowan')
  h.next()
  assert.equal(h.battle.getState().phase, 'won')
  assert.equal(h.battle.getState().enemy.hp, 0)
})

test('party defeat and retry restore both allies and healing charges', () => {
  const h = harness()
  h.party.getState().recruitRowan()
  h.start()
  h.battle.setState((s) => ({ player: { ...s.player, hp: 1 }, rowan: { ...s.rowan, hp: 0, heals: 0 } }))
  h.round({ type: 'defend' })
  assert.equal(h.battle.getState().phase, 'lost')
  h.battle.getState().retry()
  h.tick(h.BATTLE_ENTER_MS)
  assert.equal(h.battle.getState().player.hp, 50)
  assert.equal(h.battle.getState().rowan.hp, 36)
  assert.equal(h.battle.getState().rowan.heals, 3)
  assert.equal(h.party.getState().rowan, true)
})

test('optional recruitment preserves letter delivery and is not offered twice', () => {
  const h = harness()
  const story = h.load('../src/game/story.ts', { './inventory': { useInventory: h.inventory } })
  let banner = ''
  const script = h.load('../src/game/script.ts', {
    './state': { useGame: { setState() {}, getState: () => ({ showBanner: (name) => { banner = name } }) } },
    './story': story,
    './inventory': { useInventory: h.inventory, useToasts: { getState: () => ({ push() {} }) } },
    './battle': { useBattle: h.battle },
    './party': { useParty: h.party },
    './audio': { sound: {} },
  })
  story.useStory.getState().begin()
  const first = script.rowanTalk({ night: false, visits: 0 })
  assert.ok(first.choices.some((c) => c.id === 'join'))
  first.onDone('later')
  assert.equal(story.useStory.getState().stage, 'warned')
  assert.equal(h.inventory.getState().count('letter'), 0)
  assert.equal(h.party.getState().rowan, false)
  script.rowanTalk({ night: true, visits: 1 }).onDone('join')
  assert.equal(h.party.getState().rowan, true)
  assert.equal(banner, 'Elder Rowan joined')
  assert.equal(script.rowanTalk({ night: true, visits: 2 }).choices, undefined)
})

test('a surviving Rowan eventually loses when knocked out without waiting for input', () => {
  const h = harness()
  h.party.getState().recruitRowan()
  h.start()
  h.battle.setState((s) => ({ player: { ...s.player, hp: 1 }, rowan: { ...s.rowan, hp: 1, heals: 0 } }))
  h.battle.getState().act({ type: 'attack' })
  for (let i = 0; i < 20 && h.battle.getState().phase !== 'lost'; i++) h.next()
  assert.equal(h.battle.getState().phase, 'lost')
  assert.equal(h.battle.getState().rowan.hp, 0)
  assert.equal(h.battle.getState().player.hp, 0)
  assert.equal(h.jobs.size, 0)
})
