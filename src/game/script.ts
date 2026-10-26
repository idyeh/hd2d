// Every conversation in "The Last Lantern". Each one depends on the story stage, and every
// stage keeps its directions in both the day and night versions and on repeat talks — so the
// player can always ask again and learn where to go.
import type { Conversation, Line } from './state'
import { useGame } from './state'
import { atLeast, hasItem, useStory } from './story'
import { useInventory, useToasts } from './inventory'
import { useBattle } from './battle'
import { useParty } from './party'
import { sound } from './audio'

export interface TalkContext {
  night: boolean
  visits: number
}

const say = (speaker: string, text: string): Line => ({ speaker, text })
const narrate = (text: string): Line => ({ speaker: '', text })

function giveItem(id: 'wingdust' | 'scale', label = 'Obtained') {
  useInventory.getState().add(id, 1)
  useToasts.getState().push(id, id === 'scale' ? 'Gloam Scale' : 'Glimmering Wing-dust', label)
  sound.pickup()
}

// ---------------------------------------------------------------- Elder Rowan

export function rowanTalk(ctx: TalkContext): Conversation {
  const conversation = rowanStoryTalk(ctx)
  if (useParty.getState().rowan) return conversation
  return {
    ...conversation,
    lines: [...conversation.lines, say('Elder Rowan', 'You need not face the dark alone. Shall I lend you my staff and healing arts?')],
    choices: [{ id: 'join', label: 'Join me, Rowan.' }, { id: 'later', label: 'I will come back for you.' }],
    onDone: (choice) => {
      conversation.onDone?.(choice)
      if (choice === 'join') {
        useParty.getState().recruitRowan()
        useGame.getState().showBanner('Elder Rowan joined', 'Rowan attacks with his staff and tends your wounds in battle')
      }
    },
  }
}

function rowanStoryTalk({ night }: TalkContext): Conversation {
  const { stage, ending } = useStory.getState()
  const R = (t: string) => say('Elder Rowan', t)
  switch (stage) {
    case 'intro':
    case 'arrive':
      return {
        lines: [
          R('Well now — a traveller! What brings you up the Highroad to Elmbrook?'),
          narrate('You hand over the sealed letter. Rowan’s eyes widen at the wax: a heron, wings spread.'),
          R('The Heron Wardens… I have not seen that seal since I was a boy. Let me read it.'),
          narrate('He breaks the seal and reads in silence. Along the road, the lanterns flicker, though there is no wind.'),
          R('“Rowan — a gloam moth has woken in the Whisperwood. It follows starving light downriver. Keep the Last Lantern fed, or every flame lit from it will fail. — Warden Ilse.”'),
          R('Every lantern in Elmbrook was lit from the Last Lantern at Riverside Mill. For three nights they have burned low, and I told myself it was bad oil.'),
          R('Brann Ashdown keeps the Lantern. He went to the mill two days ago… and has not come back.'),
          R('His daughter Mira tends the garden, south-east of this well. She should hear this from someone kind. Will you find her?'),
          R('Night is coming. Watch how the lanterns struggle — then you will understand.'),
        ],
        onDone: () => {
          if (useInventory.getState().remove('letter', 1)) useToasts.getState().push('letter', 'Sealed Letter', 'Delivered')
          useStory.getState().setStage('warned')
          // Let the player see the problem: dusk falls and the lanterns gutter.
          useGame.setState({ night: true })
        },
      }
    case 'warned':
      return {
        lines: [
          ...(night ? [R('Look at them — the lanterns barely hold the dark tonight.')] : []),
          R('Mira is at the fenced garden, just south-east of this well. Tell her about her father.'),
          R('Then go to Riverside Mill: east along the road, over the bridge. The Last Lantern stands in the mill yard.'),
        ],
      }
    case 'helping':
      return {
        lines: [
          R('Brann always kept spare lantern oil at home, and he wrote everything about the Lantern in his journal.'),
          R('The Ashdown cottage is the one with the slate roof, north of the plaza. When you are ready, the mill is east, over the bridge.'),
        ],
      }
    case 'confront':
      return {
        lines: [
          R('A gloam moth on the Last Lantern itself… Feed the flame, or drive the creature off — but do not let it go out.'),
          R('The mill is east along the road, over the bridge. Go carefully.'),
        ],
      }
    case 'resolved':
      return ending === 'fireflies'
        ? {
            lines: [
              R('You fed it? …And it stayed? Look — the lanterns burn green-gold, and the fireflies have come back to the creek.'),
              R('My grandmother said the first keepers made a pact with the gloam: light for light. I thought it was only a story.'),
              R('Brann is home, the flame is safe, and Elmbrook will remember the traveller who kept it. Thank you.'),
            ],
            onDone: () => useStory.getState().finish(),
          }
        : {
            lines: [
              R('You drove it off — and Brann is safe! Look at the lanterns. I have never seen them burn so bright.'),
              R('…Though listen. The creek is quiet tonight. Not a single firefly.'),
              R('Perhaps that is the price of a bright night. Elmbrook owes you all the same. Thank you, traveller.'),
            ],
            onDone: () => useStory.getState().finish(),
          }
    case 'ended':
      return {
        lines:
          ending === 'fireflies'
            ? [R('Green-gold lanterns and fireflies in every street. The old pact holds, thanks to you.')]
            : [R('The brightest lanterns in the valley… and a quieter creek. Rest well, traveller.')],
      }
  }
}

// ---------------------------------------------------------------- Mira

export function miraTalk({ night }: TalkContext): Conversation {
  const { stage, ending, metBrann } = useStory.getState()
  const M = (t: string) => say('Mira', t)
  const cottage = 'Our cottage is the one with the slate roof, north of the plaza.'
  const mill = 'The mill is east along the road, over the bridge.'
  switch (stage) {
    case 'intro':
    case 'arrive':
      return {
        lines: night
          ? [
              M('Shh… the fireflies. There are fewer every night — and the lanterns keep dimming.'),
              M('If you are looking for Elder Rowan, he keeps watch by the well in the plaza, just north of here.'),
            ]
          : [
              M('Oh! Hello! Are you here for the harvest festival? You are a little early.'),
              M('I am Mira. If you are looking for Elder Rowan, he is by the well in the plaza, just north of here.'),
            ],
      }
    case 'warned':
      return {
        lines: [
          M('You have spoken to Elder Rowan? Is it… about Father?'),
          M('He went to tend the Last Lantern at the mill and promised he would be back for supper. That was two days ago.'),
          M('The lanterns have been dying every night since. I keep telling myself he is just busy.'),
          M('Please — will you go to the mill? Take the lantern oil from the chest at the foot of our bed, and Father’s journal from the bookshelf.'),
          M(`${cottage} ${mill}`),
        ],
        onDone: () => useStory.getState().setStage('helping'),
      }
    case 'helping': {
      const oil = hasItem('oil')
      const journal = hasItem('journal')
      const need = !oil && !journal
        ? 'The oil is in the chest at the foot of the bed, and Father’s journal is on the bookshelf.'
        : !oil
          ? 'You still need the oil — it is in the chest at the foot of the bed.'
          : !journal
            ? 'Father’s journal is on the bookshelf by the window. He wrote everything about the Lantern in it.'
            : null
      return {
        lines: [
          ...(night ? [M('It is so dark tonight… the lanterns barely glow.')] : []),
          ...(need ? [M(need), M(cottage)] : [M('You have the oil and the journal? Thank you.')]),
          M(`${mill} Please hurry.`),
        ],
      }
    }
    case 'confront':
      return {
        lines: metBrann
          ? [
              M('Father is trapped in the storehouse? But he is alive! Oh, thank goodness…'),
              M('Please, do whatever you must about that moth. It is at the Lantern in the mill yard — east, over the bridge.'),
            ]
          : [M(`Please find Father. ${mill}`)],
      }
    case 'resolved':
    case 'ended':
      return {
        lines:
          ending === 'fireflies'
            ? [
                M('Father came home covered in flour and moth dust, laughing! And look — fireflies everywhere!'),
                ...(stage === 'resolved' ? [M('Elder Rowan will want to hear everything. He is by the well.')] : []),
              ]
            : [
                M('Father is home. The lanterns are so bright now… I miss the fireflies, a little.'),
                ...(stage === 'resolved' ? [M('Elder Rowan will want to hear everything. He is by the well.')] : []),
              ],
      }
  }
}

// ---------------------------------------------------------------- Brann

/** Brann behind the storehouse door, before the moth is dealt with. */
export function storehouseTalk(): Conversation {
  const { stage, metBrann } = useStory.getState()
  const B = (t: string) => say('Brann', t)
  if (atLeast(stage, 'resolved'))
    return { lines: [narrate('The storehouse door stands open. Sacks of flour are stacked to the rafters.')] }
  if (metBrann)
    return {
      lines: [
        B('Still here! The moth is on the Lantern in the yard.'),
        B('Feed it oil and it may calm — my journal says so. Or drive it off. Just don’t let the flame die!'),
      ],
    }
  return {
    lines: [
      narrate('You knock on the storehouse door.'),
      B('Who’s there? Don’t open that door! …Oh. You’re not the moth.'),
      B('I’m Brann — Mira’s father. I came to feed the Last Lantern and found a gloam moth the size of a cart drinking its flame.'),
      B('Every time I go near, it drives me back. I’ve been stuck in here two days with nothing but flour.'),
      B('My journal says a starving gloam can be fed and calmed — if you have oil. Or drive it off, if you have the nerve.'),
      B('Whatever you do, don’t let the flame die. It’s in the yard, south of the mill door.'),
    ],
    onDone: () => useStory.getState().meetBrann(),
  }
}

/** Brann as an NPC after the moth is dealt with. */
export function brannTalk({ visits }: TalkContext): Conversation {
  const { ending, stage, brannHome } = useStory.getState()
  const B = (t: string) => say('Brann', t)
  // In the mill yard he's still tending the flame; he follows the player home afterwards.
  if (!brannHome)
    return {
      lines: [
        ending === 'fireflies'
          ? B('You fed it! Forty years I’ve kept that Lantern and never seen it burn green. Look at it — sleeping like a cat.')
          : B('You drove it off single-handed! Listen to that flame roar — it’ll light every lamp from here to the Highroad.'),
        B('Go on ahead and tell Elder Rowan. I’ll see the Lantern settled, then follow you home to Mira.'),
      ],
    }
  const report = stage === 'resolved' ? [B('Go and tell Elder Rowan — he’ll be pacing by the well.')] : []
  if (ending === 'fireflies')
    return {
      lines: [
        visits === 0
          ? B('You fed it! Forty years I’ve kept that Lantern and never seen it burn green. The moth sleeps on it like a cat.')
          : B('Mira hasn’t stopped chasing fireflies since I got home.'),
        ...report,
      ],
    }
  return {
    lines: [
      visits === 0
        ? B('You drove it off single-handed! The Lantern’s roaring now — it’ll light every lamp from here to the Highroad.')
        : B('Brightest lanterns in the valley. Strange how quiet the creek is, mind.'),
      ...report,
    ],
  }
}

// ---------------------------------------------------------------- The Last Lantern & the moth

/** The great lantern in the mill yard: before resolution, the moth is on it. */
export function lanternTalk(): Conversation {
  const { stage, ending } = useStory.getState()
  if (ending === 'fireflies')
    return {
      lines: [
        narrate('The Last Lantern burns a steady green-gold. The gloam moth sleeps wrapped around its crown, glowing softly.'),
      ],
    }
  if (ending === 'bright')
    return { lines: [narrate('The Last Lantern blazes, bright as noon. Moths of every ordinary kind circle it happily.')] }

  if (stage === 'intro' || stage === 'arrive')
    return {
      lines: [
        narrate('An enormous moth clings to the great lantern, wings trembling with every sip of flame.'),
        narrate('Whatever this is, Elder Rowan in Elmbrook may know. You still carry his letter.'),
      ],
    }

  const oil = hasItem('oil')
  const journal = hasItem('journal')
  const G = (t: string) => say('Gloam Moth', t)
  return {
    lines: [
      narrate('The gloam moth turns its dusty, lantern-bright eyes toward you. Beneath it the flame is no bigger than a candle’s.'),
      G('…hungry… so hungry…'),
      ...(journal
        ? [narrate('You remember Brann’s journal: “A starving gloam will take oil freely given, and guard the flame that fed it. Drive one off by force and it takes the night’s small lights with it.”')]
        : []),
    ],
    choices: [
      { id: 'offer', label: oil ? 'Offer it the lantern oil' : 'Offer it lantern oil (you have none)', disabled: !oil },
      { id: 'fight', label: 'Drive it away from the Lantern' },
      { id: 'leave', label: 'Step back for now' },
    ],
    onDone: (choice) => {
      if (choice === 'offer') offerOil()
      else if (choice === 'fight') fightMoth()
    },
  }
}

function offerOil() {
  useInventory.getState().remove('oil', 1)
  useStory.getState().resolve('fireflies')
  sound.chime()
  useGame.getState().openDialogue('lantern', 'Gloam Moth', [
    narrate('You uncork the flask and pour the oil into the Lantern’s reservoir.'),
    say('Gloam Moth', '…given… freely…'),
    narrate('The moth drinks. The flame climbs, steadies, and turns a soft green-gold.'),
    narrate('It folds its wings around the Lantern’s crown and glows like a hundred fireflies. A pinch of shining dust drifts into your palm.'),
    narrate('Behind you, the storehouse door creaks open.'),
  ], { onDone: () => giveItem('wingdust', 'Gift') })
}

export function fightMoth() {
  if (useBattle.getState().active) return
  useGame.setState({ dialogue: null, inventoryOpen: false, menuOpen: false, prompt: null })
  useStory.getState().countBattle()
  useBattle.getState().start({
    onRetry: () => useStory.getState().countBattle(),
    onWin: () => {
      useStory.getState().resolve('bright')
      useInventory.getState().addGold(40)
      useToasts.getState().push('gold', '40 gold', 'Victory')
      giveItem('scale')
      const usedOil = !hasItem('oil')
      useGame.getState().openDialogue('lantern', 'Brann', [
        narrate('The gloam moth reels away over the river and vanishes into the dark of the Whisperwood.'),
        say('Brann', usedOil ? 'You did it! Stand back — I keep a cask for emergencies.' : 'You did it! Quick — give me that oil!'),
        narrate(usedOil ? 'Brann pours his reserve into the reservoir.' : 'Brann pours your oil into the reservoir.'),
        narrate('The flame roars up, bright as noon. Somewhere downriver, the lamps of Elmbrook flare in answer.'),
      ], {
        onDone: () => {
          if (!usedOil) useInventory.getState().remove('oil', 1)
        },
      })
    },
  })
}

export function millDoorTalk(): Conversation {
  const { ending, stage } = useStory.getState()
  if (ending)
    return {
      lines: [
        useStory.getState().brannHome
          ? narrate('The waterwheel turns again. The mill is quiet — Brann has gone home to Mira.')
          : narrate('The waterwheel turns again. Brann has left the door open; the Lantern’s light spills across the yard.'),
      ],
    }
  return {
    lines: [
      narrate('The mill door is barred. A note is pinned to it: “Delivering flour to Elmbrook. Back soon. — Brann.”'),
      narrate('The flour on the step is scuffed by something large and winged.'),
      ...(atLeast(stage, 'warned') ? [narrate('Brann never made that delivery. Perhaps he is still somewhere nearby — the storehouse by the road?')] : []),
    ],
  }
}
