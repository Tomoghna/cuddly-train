import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Crown,
  Eye,
  Layers3,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import { isValidStack, rankAfter, ranks, suits } from './gameRules.js'
import './App.css'

const palette = ['mint', 'violet', 'amber', 'rose']

function shuffleCards(cards) {
  const copy = [...cards]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]]
  }
  return copy
}

function buildDeck() {
  const cards = []

  for (const suit of suits) {
    for (const rank of ranks) {
      cards.push({
        id: `${rank}-${suit}-${Math.random().toString(36).slice(2, 9)}`,
        rank,
        suit,
        color: suit === '♥' || suit === '♦' ? 'red' : 'black',
        isJoker: false,
      })
    }
  }

  for (let index = 0; index < 4; index += 1) {
    cards.push({
      id: `joker-${index}-${Math.random().toString(36).slice(2, 9)}`,
      rank: 'JOKER',
      suit: '★',
      color: 'joker',
      isJoker: true,
    })
  }

  return shuffleCards(cards)
}

function createGameState(playerCount, jokerMode = 'seen', options = {}) {
  const safePlayerCount = Math.max(2, Math.min(4, Number(playerCount) || 2))
  const deck = buildDeck()
  const playerId = options.playerId || 'human'
  const players = Array.from({ length: safePlayerCount }, (_, index) => ({
    id: index === 0 ? playerId : options.aiIds?.[index] || `cpu-${index}`,
    name: index === 0 ? 'You' : `Computer ${index}`,
    initials: index === 0 ? 'AL' : `C${index}`,
    color: palette[index % palette.length],
    hand: [],
    isAI: index !== 0,
  }))

  for (let cardIndex = 0; cardIndex < 8; cardIndex += 1) {
    players.forEach((player) => {
      player.hand.push(deck.pop())
    })
  }

  const discard = [deck.pop() ?? { id: 'starter', rank: 'A', suit: '♠', color: 'black', isJoker: false }]
  const jokerReference = discard[0]
  const jokerLabel = `${rankAfter(jokerReference.rank)}${jokerReference.suit}`

  return {
    room: options.room || 'NOVA-4821',
    playerCount: safePlayerCount,
    jokerMode,
    jokerLabel,
    players,
    deck,
    discard,
    activeIndex: 0,
    phase: 'draw',
    stacks: [],
    winner: null,
    isSinglePlayer: Boolean(options.isSinglePlayer),
  }
}

function App() {
  const [screen, setScreen] = useState('landing')
  const [playerCount, setPlayerCount] = useState(4)
  const [singlePlayerCount, setSinglePlayerCount] = useState(2)
  const [jokerMode, setJokerMode] = useState('seen')
  const [playerId] = useState(() => `player-${crypto.randomUUID().slice(0, 8)}`)
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || 'NOVA-4821')
  const [joinCode, setJoinCode] = useState('')
  const [game, setGame] = useState(() => createGameState(4, 'seen', { playerId }))
  const [selectedCardIds, setSelectedCardIds] = useState([])
  const [toast, setToast] = useState('')
  const [connected, setConnected] = useState(false)
  const [serverState, setServerState] = useState({ playerCount: 1, activePlayerId: null, phase: 'draw', scores: {} })
  const socketRef = useRef(null)

  const currentPlayer = game?.players[game.activeIndex]
  const currentHand = currentPlayer?.hand ?? []
  const isMyTurn = serverState.activePlayerId === playerId || (!serverState.activePlayerId && !(game?.isSinglePlayer && currentPlayer?.isAI))
  const canActThisTurn = isMyTurn && game?.phase === 'play'
  const canDrawThisTurn = isMyTurn && game?.phase === 'draw'

  const findBestAiStack = useCallback((hand) => {
    if (!Array.isArray(hand) || hand.length < 3) return null

    const maxSize = Math.min(4, hand.length)
    for (let size = maxSize; size >= 3; size -= 1) {
      const indexes = []
      const walk = (startIndex, selected) => {
        if (selected.length === size) {
          const stackCards = selected.map((indexValue) => hand[indexValue])
          if (isValidStack(stackCards)) {
            indexes.push([...selected])
          }
          return
        }

        for (let indexValue = startIndex; indexValue < hand.length; indexValue += 1) {
          walk(indexValue + 1, [...selected, indexValue])
        }
      }

      walk(0, [])
      if (indexes.length > 0) {
        return indexes[0].map((indexValue) => hand[indexValue])
      }
    }

    return null
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const socket = new WebSocket(import.meta.env.VITE_WS_URL || 'ws://localhost:3001')
    socketRef.current = socket

    const handleOpen = () => {
      setConnected(true)
      socket.send(JSON.stringify({ type: 'join', roomId: roomCode, playerId }))
    }

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        if (message.type === 'room_state' || message.type === 'game_action') {
          setServerState({
            playerCount: message.playerCount || 1,
            activePlayerId: message.activePlayerId || null,
            phase: message.phase || 'draw',
            scores: message.scores || {},
          })

          if (Array.isArray(message.players) && message.players.length > 0) {
            setGame((current) => {
              if (!current) return current
              const nextPlayers = current.players.map((player, index) => ({
                ...player,
                id: message.players[index]?.id || player.id,
                name: message.players[index]?.name || player.name,
                initials: message.players[index]?.initials || player.initials,
                color: message.players[index]?.color || player.color,
              }))

              return {
                ...current,
                room: message.roomId || current.room,
                playerCount: message.playerCount || current.playerCount,
                phase: message.phase || current.phase,
                activeIndex: message.activePlayerId ? nextPlayers.findIndex((player) => player.id === message.activePlayerId) : current.activeIndex,
                players: nextPlayers,
              }
            })
          } else {
            setGame((current) => ({
              ...current,
              phase: message.phase || current?.phase || 'draw',
              activeIndex: message.activePlayerId && current
                ? current.players.findIndex((player) => player.id === message.activePlayerId)
                : current?.activeIndex ?? 0,
            }))
          }
        }

        if (message.type === 'error') {
          setToast(message.message || 'The table rejected your move.')
        }
      } catch {
        setToast('Received an invalid room update.')
      }
    }

    socket.addEventListener('open', handleOpen)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', () => setConnected(false))
    socket.addEventListener('error', () => setConnected(false))

    return () => {
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('message', handleMessage)
      socket.close()
    }
  }, [playerId, roomCode])

  const sendAction = (type, payload = {}) => {
    if (!isMyTurn) {
      setToast('Wait for your turn before acting.')
      return false
    }

    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setToast('Reconnect to the table before playing.')
      return false
    }

    socket.send(JSON.stringify({ type, payload }))
    return true
  }

  const startGame = (countOverride = playerCount, modeOverride = jokerMode) => {
    const nextGame = createGameState(countOverride, modeOverride)
    nextGame.room = roomCode || 'NOVA-4821'
    setGame(nextGame)
    setSelectedCardIds([])
    setScreen('lobby')
  }

  const openTable = () => setScreen('table')

  const copyRoomCode = async () => {
    const target = (roomCode || game?.room || 'NOVA-4821').trim()
    try {
      await navigator.clipboard.writeText(target)
      setToast('Room code copied to clipboard.')
    } catch {
      setToast('Copy failed. Please copy the room code manually.')
    }
  }

  const toggleCardSelection = (cardId) => {
    setSelectedCardIds((current) =>
      current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId],
    )
  }

  const drawFromDeck = () => {
    if (!game || game.phase !== 'draw') {
      setToast('You need to draw before playing a stack.')
      return
    }
    if (!sendAction('draw')) return

    setGame((current) => {
      if (!current) return current
      const nextDeck = [...current.deck]
      const pickedCard = nextDeck.pop()
      if (!pickedCard) return current

      const updatedPlayers = current.players.map((player, index) =>
        index === current.activeIndex
          ? { ...player, hand: [...player.hand, pickedCard] }
          : player,
      )

      return {
        ...current,
        deck: nextDeck,
        players: updatedPlayers,
        phase: 'play',
      }
    })
    setToast('Card drawn from the deck.')
  }

  const drawFromDiscard = () => {
    if (!game || game.phase !== 'draw') {
      setToast('You can only pick from the discard pile on your draw turn.')
      return
    }
    if (!sendAction('draw')) return

    setGame((current) => {
      if (!current || current.discard.length === 0) return current
      const [pickedCard, ...remainingDiscard] = current.discard
      const updatedPlayers = current.players.map((player, index) =>
        index === current.activeIndex
          ? { ...player, hand: [...player.hand, pickedCard] }
          : player,
      )

      return {
        ...current,
        players: updatedPlayers,
        discard: remainingDiscard,
        phase: 'play',
      }
    })
    setToast('Card picked from the discard pile.')
  }

  const discardSelected = () => {
    if (!game || selectedCardIds.length !== 1) {
      setToast('Choose exactly one card to discard.')
      return
    }

    const chosenId = selectedCardIds[0]
    if (!sendAction('discard', { cardId: chosenId })) return

    setGame((current) => {
      if (!current) return current
      const active = current.players[current.activeIndex]
      const selectedCard = active.hand.find((card) => card.id === chosenId)
      if (!selectedCard) return current

      const remainingHand = active.hand.filter((card) => card.id !== chosenId)
      const nextPlayers = current.players.map((player, index) =>
        index === current.activeIndex ? { ...player, hand: remainingHand } : player,
      )
      const nextIndex = (current.activeIndex + 1) % nextPlayers.length
      const winner = remainingHand.length === 0 ? active.name : null

      return {
        ...current,
        players: nextPlayers,
        discard: [selectedCard, ...current.discard],
        activeIndex: winner ? current.activeIndex : nextIndex,
        phase: 'draw',
        winner,
      }
    })

    setSelectedCardIds([])
    if (currentHand.length <= 1) {
      setScreen('winner')
      setToast('You played your final card.')
    } else {
      setToast('Card discarded.')
    }
  }

  const playSelectedStack = () => {
    if (!game || selectedCardIds.length < 3) {
      setToast('Select at least 3 cards to make a stack.')
      return
    }

    const handSnapshot = currentHand
    const stackCards = handSnapshot.filter((card) => selectedCardIds.includes(card.id))
    if (!isValidStack(stackCards)) {
      setToast('Stacks must be 3+ cards in sequence or same rank.')
      return
    }
    if (!sendAction('play_stack', { cardIds: selectedCardIds, cards: stackCards })) return

    const remainingHand = handSnapshot.filter((card) => !selectedCardIds.includes(card.id))

    setGame((current) => {
      if (!current) return current
      const active = current.players[current.activeIndex]
      const updatedPlayers = current.players.map((player, index) =>
        index === current.activeIndex ? { ...player, hand: remainingHand } : player,
      )
      const winner = remainingHand.length === 0 ? active.name : null

      return {
        ...current,
        players: updatedPlayers,
        stacks: [...current.stacks, stackCards],
        activeIndex: winner ? current.activeIndex : (current.activeIndex + 1) % updatedPlayers.length,
        phase: 'draw',
        winner,
      }
    })

    setSelectedCardIds([])
    if (remainingHand.length === 0) {
      setScreen('winner')
      setToast('Stack complete. You won the round!')
    } else {
      setToast('Stack played. Turn passed to the next player.')
    }
  }

  const sortHand = () => {
    setGame((current) => {
      if (!current) return current
      const active = current.players[current.activeIndex]
      const sorted = [...active.hand].sort((left, right) => {
        const leftRank = ranks.indexOf(left.rank)
        const rightRank = ranks.indexOf(right.rank)
        if (leftRank !== rightRank) return leftRank - rightRank
        return suits.indexOf(left.suit) - suits.indexOf(right.suit)
      })

      const updatedPlayers = current.players.map((player, index) =>
        index === current.activeIndex ? { ...player, hand: sorted } : player,
      )

      return { ...current, players: updatedPlayers }
    })
  }

  const startSinglePlayer = (countOverride = singlePlayerCount) => {
    const seatedGame = createGameState(countOverride, 'blind', {
      room: 'SOLO-001',
      playerId,
      isSinglePlayer: true,
    })
    setGame(seatedGame)
    setSelectedCardIds([])
    setScreen('table')
  }

  useEffect(() => {
    if (!game || !game.isSinglePlayer || screen !== 'table') return undefined

    const activePlayer = game.players[game.activeIndex]
    if (!activePlayer || !activePlayer.isAI) return undefined

    const timer = window.setTimeout(() => {
      setGame((current) => {
        if (!current) return current
        const active = current.players[current.activeIndex]
        if (!active || !active.isAI) return current

        const nextPlayers = current.players.map((player) => ({ ...player, hand: [...player.hand] }))
        const nextDeck = [...current.deck]
        const nextDiscard = [...current.discard]
        const nextStacks = [...current.stacks]

        if (current.phase === 'draw') {
          const picked = nextDeck.pop() ?? nextDiscard.shift()
          if (!picked) return current
          nextPlayers[current.activeIndex] = {
            ...active,
            hand: [...active.hand, picked],
          }

          return {
            ...current,
            players: nextPlayers,
            deck: nextDeck,
            discard: nextDiscard,
            phase: 'play',
          }
        }

        const stackChoice = findBestAiStack(active.hand)
        if (stackChoice && stackChoice.length >= 3) {
          const remainingHand = active.hand.filter((card) => !stackChoice.some((stackCard) => stackCard.id === card.id))
          nextPlayers[current.activeIndex] = {
            ...active,
            hand: remainingHand,
          }
          nextStacks.push(stackChoice)

          if (remainingHand.length === 0) {
            setScreen('winner')
          }

          return {
            ...current,
            players: nextPlayers,
            stacks: nextStacks,
            activeIndex: remainingHand.length === 0 ? current.activeIndex : (current.activeIndex + 1) % nextPlayers.length,
            phase: 'draw',
            winner: remainingHand.length === 0 ? active.name : null,
          }
        }

        const discarded = active.hand[0]
        if (!discarded) return current

        const remainingHand = active.hand.filter((card) => card.id !== discarded.id)
        nextPlayers[current.activeIndex] = {
          ...active,
          hand: remainingHand,
        }
        nextDiscard.unshift(discarded)

        if (remainingHand.length === 0) {
          setScreen('winner')
        }

        return {
          ...current,
          players: nextPlayers,
          discard: nextDiscard,
          activeIndex: remainingHand.length === 0 ? current.activeIndex : (current.activeIndex + 1) % nextPlayers.length,
          phase: 'draw',
          winner: remainingHand.length === 0 ? active.name : null,
        }
      })
    }, 700)

    return () => window.clearTimeout(timer)
  }, [findBestAiStack, game, screen])

  const standings = game ? [...game.players].sort((left, right) => left.hand.length - right.hand.length) : []

  return (
    <main className="app-shell">
      {screen === 'landing' && (
        <section className="landing-shell">
          <div className="landing-card">
            <div className="brand-row">
              <div className="brand-mark">F</div>
              <div>
                <div className="brand-label">FISS</div>
                <div className="brand-subtitle">CARD TABLE</div>
              </div>
            </div>

            <div className="landing-grid">
              <div className="panel panel-strong">
                <div className="eyebrow">MULTIPLAYER</div>
                <button className="primary-button" onClick={() => setScreen('new-game')}>
                  <Plus size={16} /> New Game
                </button>
                <button className="secondary-button" onClick={() => setScreen('join-game')}>
                  <Users size={16} /> Join Game
                </button>
              </div>

              <div className="panel">
                <div className="eyebrow">SINGLEPLAYER</div>
                <label className="field full-width compact-field">
                  <span>Players</span>
                  <select value={singlePlayerCount} onChange={(event) => setSinglePlayerCount(Number(event.target.value))}>
                    <option value={2}>2 players</option>
                    <option value={3}>3 players</option>
                    <option value={4}>4 players</option>
                  </select>
                </label>
                <button className="primary-button accent" onClick={() => startSinglePlayer(singlePlayerCount)}>
                  <Play size={16} fill="currentColor" /> Play game
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {screen === 'new-game' && (
        <section className="setup-shell">
          <div className="setup-card">
            <div className="heading-row">
              <div>
                <div className="eyebrow">NEW GAME</div>
                <h1>Create a table</h1>
              </div>
              <button className="ghost-button" onClick={() => setScreen('landing')}>Back</button>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Number of players</span>
                <select value={playerCount} onChange={(event) => setPlayerCount(Number(event.target.value))}>
                  <option value={2}>2 players</option>
                  <option value={3}>3 players</option>
                  <option value={4}>4 players</option>
                </select>
              </label>

              <label className="field">
                <span>Joker mode</span>
                <select value={jokerMode} onChange={(event) => setJokerMode(event.target.value)}>
                  <option value="seen">Seen joker</option>
                  <option value="blind">Blind joker</option>
                </select>
              </label>
            </div>

            <label className="field full-width">
              <span>Room name</span>
              <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="NOVA-4821" />
            </label>

            <button className="primary-button full" onClick={() => startGame(playerCount, jokerMode)}>
              <Zap size={16} /> Start game
            </button>
          </div>
        </section>
      )}

      {screen === 'join-game' && (
        <section className="setup-shell">
          <div className="setup-card">
            <div className="heading-row">
              <div>
                <div className="eyebrow">JOIN GAME</div>
                <h1>Enter room code</h1>
              </div>
              <button className="ghost-button" onClick={() => setScreen('landing')}>Back</button>
            </div>

            <label className="field full-width">
              <span>Room ID</span>
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ROOM-1234" />
            </label>

            <button className="primary-button full" onClick={() => {
              const normalized = (joinCode || roomCode || 'NOVA-4821').trim().toUpperCase().replace(/\s+/g, '-')
              setRoomCode(normalized)
              const nextGame = createGameState(2, jokerMode)
              nextGame.room = normalized
              setGame(nextGame)
              setScreen('lobby')
            }}>
              <Send size={16} /> Start game
            </button>
          </div>
        </section>
      )}

      {screen === 'lobby' && game && (
        <section className="table-shell">
          <header className="topbar">
            <div className="brand-mark">F</div>
            <div className="brand-copy">
              <strong>FISS</strong>
              <small>PLAY TOGETHER</small>
            </div>
            <div className="topbar-divider" />
            <div className="workspace-name">Workspace / <b>{game.room}</b> <ChevronDown size={14} /></div>
            <div className="topbar-actions">
              <div className="connection">
                <span className={connected ? 'status-dot live' : 'status-dot'} /> {connected ? 'Live room' : 'Offline'}
              </div>
              <button className="icon-button" aria-label="Notifications">
                <Bell size={18} />
              </button>
              <button className="avatar avatar-small">AL</button>
            </div>
          </header>

          <div className="table-layout">
            <aside className="sidebar">
              <div className="side-label">GAME CONTROL</div>
              <nav>
                <button className="nav-item" onClick={openTable}>
                  <Layers3 size={17} /> Game table
                </button>
                <button className="nav-item selected">
                  <Users size={17} /> Room lobby
                </button>
                <button className="nav-item" onClick={() => setToast('Rules explained in the shared game guide.') }>
                  <Sparkles size={17} /> Game rules
                </button>
              </nav>

              <div className="side-label side-label-spaced">TABLE TOOLS</div>
              <nav>
                <button className="nav-item">
                  <ShieldCheck size={17} /> Safe room
                </button>
                <button className="nav-item">
                  <Settings size={17} /> Settings
                </button>
              </nav>

              <div className="sidebar-bottom">
                <div className="secure-note">
                  <ShieldCheck size={15} />
                  <span>
                    <b>Private room</b>
                    <small>Max 4 players</small>
                  </span>
                </div>
                <button className="profile-row">
                  <span className="avatar avatar-mint">AL</span>
                  <span>
                    <b>Alex Lee</b>
                    <small>Table host</small>
                  </span>
                  <MoreHorizontal size={17} />
                </button>
              </div>
            </aside>

            <div className="board-area">
              <div className="page-heading table-heading">
                <div>
                  <div className="eyebrow">ROOM LOBBY</div>
                  <h1>{game.room}</h1>
                  <p>Invite players, verify the table, and open the game when everyone is ready.</p>
                </div>
                <div className="heading-tools">
                  <button className="ghost-button" onClick={copyRoomCode}>
                    <Copy size={16} /> Copy room code
                  </button>
                  <button className="primary-button small" onClick={openTable}>
                    <Play size={16} fill="currentColor" /> Open table
                  </button>
                </div>
              </div>

              <div className="lobby-grid">
                <section className="panel room-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">INVITE PLAYERS</div>
                      <h2>Share this room</h2>
                    </div>
                    <div className="live-pill"><span className="status-dot live" /> PRIVATE</div>
                  </div>
                  <div className="room-code-wrap">
                    <span>{game.room}</span>
                    <button onClick={copyRoomCode} aria-label="Copy room code"><Copy size={17} /></button>
                  </div>
                  <p className="helper">Anyone with this room code can join. The game cap is four players.</p>
                  <div className="invite-field">
                    <input placeholder="friend@company.com" />
                    <button className="button button-dark"><Send size={15} /> Invite</button>
                  </div>
                </section>

                <section className="panel players-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">PLAYERS</div>
                      <h2>Ready check</h2>
                    </div>
                    <span className="player-count">{game.players.length} / 4</span>
                  </div>
                  {game.players.map((player) => (
                    <div className="lobby-player" key={player.id}>
                      <span className={`avatar avatar-${player.color}`}>{player.initials}</span>
                      <span>
                        <b>{player.name}</b>
                        <small>{player.name === 'You' ? 'Host' : 'Ready to play'}</small>
                      </span>
                      {player.name === 'You' ? <Crown size={16} className="host-icon" /> : <span className="ready-label"><Check size={14} /> Ready</span>}
                    </div>
                  ))}
                  <button className="primary-button full" onClick={openTable}><Zap size={16} /> Start game</button>
                </section>
              </div>
            </div>
          </div>
        </section>
      )}

      {screen === 'table' && game && (
        <section className="table-shell">
          <header className="topbar">
            <div className="brand-mark">F</div>
            <div className="brand-copy">
              <strong>FISS</strong>
              <small>PLAY TOGETHER</small>
            </div>
            <div className="topbar-divider" />
            <div className="workspace-name">Workspace / <b>{game.room}</b> <ChevronDown size={14} /></div>
            <div className="topbar-actions">
              <div className="connection">
                <span className={connected ? 'status-dot live' : 'status-dot'} /> {connected ? 'Live table' : 'Offline'}
              </div>
              <button className="icon-button" aria-label="Notifications">
                <Bell size={18} />
              </button>
              <button className="avatar avatar-small">AL</button>
            </div>
          </header>

          <div className="table-layout">
            <aside className="sidebar">
              <div className="side-label">GAME CONTROL</div>
              <nav>
                <button className="nav-item selected">
                  <Layers3 size={17} /> Game table
                </button>
                <button className="nav-item" onClick={() => setScreen('lobby')}>
                  <Users size={17} /> Lobby
                </button>
                <button className="nav-item" onClick={() => setToast('Rules explained in the shared game guide.') }>
                  <Sparkles size={17} /> Game rules
                </button>
              </nav>

              <div className="side-label side-label-spaced">TABLE TOOLS</div>
              <nav>
                <button className="nav-item">
                  <ShieldCheck size={17} /> Safe room
                </button>
                <button className="nav-item">
                  <Settings size={17} /> Settings
                </button>
              </nav>

              <div className="sidebar-bottom">
                <div className="secure-note">
                  <ShieldCheck size={15} />
                  <span>
                    <b>Private room</b>
                    <small>Max 4 players</small>
                  </span>
                </div>
                <button className="profile-row">
                  <span className="avatar avatar-mint">AL</span>
                  <span>
                    <b>Alex Lee</b>
                    <small>Table host</small>
                  </span>
                  <MoreHorizontal size={17} />
                </button>
              </div>
            </aside>

            <div className="board-area">
              <div className="page-heading table-heading">
                <div>
                  <div className="eyebrow">LIVE TABLE</div>
                  <h1>{game.room}</h1>
                  <p>Make your move. You are playing clockwise.</p>
                </div>
                <div className="heading-tools">
                  <button className="ghost-button">
                    <CircleHelp size={16} /> Rules
                  </button>
                  <button className="ghost-button icon-only">
                    <MoreHorizontal size={17} />
                  </button>
                </div>
              </div>

              <div className="score-strip">
                {game.players.map((player, index) => (
                  <div key={player.id} className={`score-player ${index === game.activeIndex ? 'is-you' : ''}`}>
                    <span className={`avatar avatar-${player.color}`}>{player.initials}</span>
                    <div>
                      <b>{player.name}</b>
                      <small>{player.hand.length} cards</small>
                    </div>
                    {index === game.activeIndex && <span className="turn-chip">TURN</span>}
                  </div>
                ))}

                <div className="score-meta">
                  <span>
                    <Eye size={15} /> Joker <b>{game.jokerLabel}</b>
                  </span>
                  <span>
                    <RefreshCw size={14} /> {game.phase === 'draw' ? 'Draw phase' : 'Play phase'}
                  </span>
                </div>
              </div>

              <div className="game-layout">
                <section className="game-board panel">
                  <div className="board-topline">
                    <span className="turn-indicator">
                      <span className="status-dot live" /> {isMyTurn ? 'Your turn' : 'Waiting for turn'}
                    </span>
                    <span className="turn-time">{game.phase === 'draw' ? 'Draw a card' : 'Build or discard a stack'}</span>
                  </div>

                  <div className="table-surface">
                    {game.players.slice(1).map((player, index) => (
                      <div key={player.id} className={`opponent opponent-${index === 0 ? 'top' : index === 1 ? 'left' : 'right'}`}>
                        <div className="avatar-label">
                          <span className={`avatar avatar-${player.color}`}>{player.initials}</span>
                          <b>{player.name}</b>
                        </div>
                        <span className="opponent-cards">{player.hand.length} cards</span>
                      </div>
                    ))}

                    <div className="deck-zone">
                      <button className="deck-stack" onClick={drawFromDeck} aria-label="Draw from deck" disabled={!canDrawThisTurn}>
                        <span />
                        <span />
                        <span className="playing-card back-card"><Layers3 size={23} /></span>
                      </button>
                      <small>{game.deck.length} cards</small>
                    </div>

                    <div className="discard-zone">
                      <div className="playing-card discard-card">
                        <span className="card-rank">{game.discard[0]?.rank ?? 'A'}</span>
                        <span className={`card-suit ${game.discard[0]?.color === 'red' ? 'red' : ''}`}>
                          {game.discard[0]?.suit ?? '♠'}
                        </span>
                      </div>
                      <small>Discard pile</small>
                    </div>
                  </div>

                  <div className="board-footer">
                    <button className="secondary-button" onClick={drawFromDiscard} disabled={!canDrawThisTurn}>Pick discard</button>
                    <button className="secondary-button" onClick={sortHand}>Sort hand</button>
                    <button className="primary-button small" onClick={playSelectedStack} disabled={!canActThisTurn || selectedCardIds.length < 3}>Play stack</button>
                  </div>
                </section>

                <aside className="side-panel">
                  <div className="panel activity-panel">
                    <div className="panel-heading">
                      <div>
                        <div className="eyebrow">ACTIVE STACKS</div>
                        <h2>Table</h2>
                      </div>
                    </div>
                    {game.stacks.length === 0 ? (
                      <p className="helper">No stacks yet. Select 3 or more cards to start one.</p>
                    ) : (
                      <div className="stack-list">
                        {game.stacks.map((stack, stackIndex) => (
                          <div className="stack-pill" key={`${stackIndex}-${stack.map((card) => card.id).join('-')}`}>
                            {stack.map((card) => `${card.rank}${card.suit}`).join(' · ')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="panel activity-panel">
                    <div className="panel-heading">
                      <div>
                        <div className="eyebrow">YOUR HAND</div>
                        <h2>{currentHand.length} cards</h2>
                      </div>
                    </div>
                    <div className="hand-grid">
                      {currentHand.map((card) => (
                        <button
                          key={card.id}
                          className={`hand-card ${selectedCardIds.includes(card.id) ? 'selected' : ''}`}
                          onClick={() => toggleCardSelection(card.id)}
                          type="button"
                        >
                          <span className="card-rank">{card.rank}</span>
                          <span className={`card-suit ${card.color === 'red' ? 'red' : ''}`}>{card.suit}</span>
                        </button>
                      ))}
                    </div>

                    <div className="hand-actions">
                      <button className="secondary-button" onClick={() => setSelectedCardIds([])}>Clear</button>
                      <button className="primary-button small" onClick={discardSelected} disabled={!canActThisTurn || selectedCardIds.length !== 1}>Discard selection</button>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>
      )}

      {screen === 'winner' && game && (
        <section className="setup-shell">
          <div className="setup-card winner-card">
            <div className="eyebrow">WINNER</div>
            <h1>{game.winner ?? 'Round complete'}</h1>
            <div className="winner-rankings">
              {standings.map((player, index) => (
                <div key={player.id} className={`winner-pill ${index === 0 ? 'first' : index === 1 ? 'second' : 'third'}`}>
                  {index + 1}st · {player.name} · {player.hand.length} cards left
                </div>
              ))}
            </div>
            <button className="primary-button full" onClick={() => setScreen('landing')}>
              <Crown size={16} /> Back to lobby
            </button>
          </div>
        </section>
      )}

      {screen !== 'landing' && screen !== 'new-game' && screen !== 'join-game' && screen !== 'table' && screen !== 'lobby' && screen !== 'winner' && (
        <div className="toast">Game state is loading...</div>
      )}

      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </main>
  )
}

export default App
