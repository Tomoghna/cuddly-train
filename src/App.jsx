import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Crown,
  Layers3,
  Play,
  Plus,
  RefreshCw,
  Send,
  Users,
  Zap,
} from 'lucide-react'
import {
  advanceTurnIndex,
  canDiscardThisTurn,
  canExtendStack,
  canOpenNewStackForPlayer,
  canPlayerAct,
  getJokerLabel,
  getStandings,
  findAiStackMove,
  isValidStack,
  ranks,
  suits,
} from './gameRules.js'
import { getReconnectDelay, getWebSocketUrl } from './websocketRecovery.js'
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
  const jokerLabel = getJokerLabel(jokerReference)

  return {
    room: options.room || 'NOVA-4821',
    playerCount: safePlayerCount,
    maxPlayers: safePlayerCount,
    jokerMode,
    jokerLabel,
    players,
    deck,
    discard,
    activeIndex: 0,
    phase: 'draw',
    hasDrawnThisTurn: false,
    stacks: [],
    winner: null,
    isSinglePlayer: Boolean(options.isSinglePlayer),
  }
}

function App() {
  const [screen, setScreen] = useState('landing')
  const [playerCount, setPlayerCount] = useState(4)
  const [singlePlayerCount, setSinglePlayerCount] = useState(2)
  const [singlePlayerJokerMode, setSinglePlayerJokerMode] = useState('blind')
  const [jokerMode, setJokerMode] = useState('seen')
  const [playerId] = useState(() => `player-${crypto.randomUUID().slice(0, 8)}`)
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || 'NOVA-4821')
  const [roomCodeInput, setRoomCodeInput] = useState(roomCode)
  const [joinCode, setJoinCode] = useState('')
  const [game, setGame] = useState(() => createGameState(4, 'seen', { playerId }))
  const [selectedCardIds, setSelectedCardIds] = useState([])
  const [toast, setToast] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [serverState, setServerState] = useState({ playerCount: 1, activePlayerId: null, phase: 'draw', scores: {} })
  const socketRef = useRef(null)
  const joinedRef = useRef(false)
  const retryNowRef = useRef(null)
  const pendingRoomConfigurationRef = useRef(null)

  const currentPlayer = game?.players[game.activeIndex]
  const myPlayer = game?.players.find((player) => player.id === playerId)
  const currentHand = myPlayer?.hand ?? []
  const isMyTurn = serverState.activePlayerId === playerId || (!serverState.activePlayerId && !(game?.isSinglePlayer && currentPlayer?.isAI))
  const canActThisTurn = Boolean(game && currentPlayer && canPlayerAct(game, playerId)) || (isMyTurn && game?.phase === 'play')
  const isConnected = connectionStatus === 'connected'
  const canDrawThisTurn = isConnected && isMyTurn && game?.phase === 'draw'
  const canPlayStack = Boolean(isConnected && game?.phase === 'play' && game?.hasDrawnThisTurn && isMyTurn)
  const canDiscard = game ? isConnected && canDiscardThisTurn(game) && isMyTurn : false
  const connectionLabel = {
    connecting: 'Connecting',
    connected: 'Live',
    reconnecting: `Reconnecting${reconnectAttempt ? ` (${reconnectAttempt})` : ''}`,
    offline: 'Offline',
    error: 'Connection error',
  }[connectionStatus]
  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let disposed = false
    let reconnectTimer
    let retryCount = 0
    let retryStopped = false
    let socket = null

    const isCurrentSocket = (candidate) => socketRef.current === candidate

    const scheduleReconnect = (immediate = false) => {
      if (disposed || retryStopped || !navigator.onLine) {
        setConnectionStatus(retryStopped ? 'error' : 'offline')
        return
      }
      if (reconnectTimer) clearTimeout(reconnectTimer)
      const delay = immediate ? 0 : getReconnectDelay(retryCount)
      retryCount += 1
      setReconnectAttempt(retryCount)
      setConnectionStatus('reconnecting')
      reconnectTimer = window.setTimeout(connect, delay)
    }

    const handleOnline = () => {
      if (!socketRef.current || socketRef.current.readyState >= WebSocket.CLOSING) {
        scheduleReconnect(true)
      }
    }

    const handleOffline = () => {
      joinedRef.current = false
      setConnectionStatus('offline')
      if (reconnectTimer) clearTimeout(reconnectTimer)
      const currentSocket = socketRef.current
      socketRef.current = null
      currentSocket?.close()
    }

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        if (message.type === 'room_state' || message.type === 'game_action') {
          if (!Array.isArray(message.players) || !message.players.some((player) => player.id === playerId)) {
            return
          }
          joinedRef.current = true
          retryCount = 0
          setReconnectAttempt(0)
          setConnectionStatus('connected')
          const pendingConfiguration = pendingRoomConfigurationRef.current
          if (pendingConfiguration?.roomId === message.roomId && socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: 'configure_room',
              payload: pendingConfiguration.payload,
            }))
            pendingRoomConfigurationRef.current = null
          }
          setServerState({
            playerCount: message.playerCount || 1,
            activePlayerId: message.activePlayerId || null,
            phase: message.phase || 'draw',
            scores: message.scores || {},
            hasDrawnThisTurn: Boolean(message.hasDrawnThisTurn),
          })

          if (Array.isArray(message.players) && message.players.length > 0) {
            setGame((current) => {
              if (!current) return current
              const nextPlayers = message.players.map((serverPlayer) => ({
                id: serverPlayer.id,
                name: serverPlayer.name,
                initials: serverPlayer.initials,
                color: serverPlayer.color,
                hand: serverPlayer.id === playerId
                  ? serverPlayer.hand ?? []
                  : Array.from({ length: serverPlayer.handCount ?? 0 }, (_, index) => ({ id: `hidden-${serverPlayer.id}-${index}` })),
                isAI: false,
              }))

              return {
                ...current,
                room: message.roomId || current.room,
                playerCount: message.playerCount || current.playerCount,
                maxPlayers: message.maxPlayers || current.maxPlayers,
                phase: message.phase || current.phase,
                hasDrawnThisTurn: Boolean(message.hasDrawnThisTurn),
                activeIndex: message.activePlayerId ? nextPlayers.findIndex((player) => player.id === message.activePlayerId) : current.activeIndex,
                players: nextPlayers,
                deck: Array.from({ length: message.deckCount ?? 0 }, (_, index) => ({ id: `deck-${index}` })),
                discard: message.discard ?? current.discard,
                stacks: message.stacks ?? current.stacks,
                winner: message.winner ?? null,
                jokerMode: message.jokerMode || current.jokerMode,
                jokerLabel: message.jokerLabel || current.jokerLabel,
                started: Boolean(message.started),
                isSinglePlayer: false,
              }
            })
            if (message.winner) {
              setScreen('winner')
            } else if (message.started) {
              setScreen((currentScreen) => currentScreen === 'lobby' ? 'table' : currentScreen)
            }
          }
        }

        if (message.type === 'error') {
          setToast(message.message || 'The table rejected your move.')
          if (!joinedRef.current) {
            retryStopped = ['ROOM_FULL', 'INVALID_ROOM_ID', 'INVALID_PLAYER_ID'].includes(message.code)
            joinedRef.current = false
            setConnectionStatus(retryStopped ? 'error' : 'reconnecting')
            socket?.close()
          }
        }
      } catch {
        setToast('Received an invalid room update.')
      }
    }

    function connect() {
      if (disposed || retryStopped || !navigator.onLine) {
        if (!navigator.onLine) setConnectionStatus('offline')
        return
      }
      if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) return
      setConnectionStatus(retryCount === 0 ? 'connecting' : 'reconnecting')
      joinedRef.current = false
      try {
        socket = new WebSocket(getWebSocketUrl(window.location, import.meta.env.VITE_WS_URL))
      } catch {
        socketRef.current = null
        scheduleReconnect()
        return
      }
      socketRef.current = socket
      socket.addEventListener('open', () => {
        if (!isCurrentSocket(socket)) return
        socket.send(JSON.stringify({ type: 'join', roomId: roomCode, playerId }))
      })
      socket.addEventListener('message', (event) => {
        if (isCurrentSocket(socket)) handleMessage(event)
      })
      socket.addEventListener('error', () => {
        if (isCurrentSocket(socket)) {
          setConnectionStatus('reconnecting')
          socket.close()
        }
      })
      socket.addEventListener('close', () => {
        if (!isCurrentSocket(socket)) return
        joinedRef.current = false
        socketRef.current = null
        scheduleReconnect()
      })
    }

    const retryNow = () => {
      retryStopped = false
      retryCount = 0
      setReconnectAttempt(0)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
        const currentSocket = socketRef.current
        socketRef.current = null
        joinedRef.current = false
        currentSocket.close()
        scheduleReconnect(true)
      } else {
        scheduleReconnect(true)
      }
    }
    retryNowRef.current = retryNow
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    connect()
    return () => {
      disposed = true
      joinedRef.current = false
      clearTimeout(reconnectTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      retryNowRef.current = null
      if (socket) socket.close()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [playerId, roomCode])

  const sendAction = (type, payload = {}) => {
    if (!isMyTurn) {
      setToast('Wait for your turn before acting.')
      return false
    }

    const socket = socketRef.current
    if (!joinedRef.current || !socket || socket.readyState !== WebSocket.OPEN) {
      setToast('Wait until the room connection is restored before playing.')
      return false
    }

    socket.send(JSON.stringify({ type, payload }))
    return true
  }

  const sendRoomControl = (type, payload = {}) => {
    const socket = socketRef.current
    if (!joinedRef.current || !socket || socket.readyState !== WebSocket.OPEN) {
      setToast('Wait until the room connection is restored before configuring it.')
      return false
    }
    socket.send(JSON.stringify({ type, payload }))
    return true
  }

  const startGame = (countOverride = playerCount, modeOverride = jokerMode) => {
    const nextRoomCode = (roomCodeInput || 'NOVA-4821').trim().toUpperCase().replace(/\s+/g, '-')
    const configuration = { playerCount: countOverride, jokerMode: modeOverride }
    const nextGame = createGameState(countOverride, modeOverride, { playerId })
    nextGame.room = nextRoomCode
    setGame(nextGame)
    setSelectedCardIds([])
    setRoomCodeInput(nextRoomCode)
    if (nextRoomCode === roomCode && joinedRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
      if (sendRoomControl('configure_room', configuration)) {
        pendingRoomConfigurationRef.current = null
      }
    } else {
      pendingRoomConfigurationRef.current = { roomId: nextRoomCode, payload: configuration }
      if (nextRoomCode !== roomCode) setRoomCode(nextRoomCode)
    }
    setScreen('lobby')
  }

  const openTable = () => {
    sendRoomControl('start_game')
  }

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

  const findStackToExtend = (stackCards) => {
    if (!game || !Array.isArray(stackCards) || stackCards.length === 0) return null
    return game.stacks.find((stack) => Array.isArray(stack.cards) && canExtendStack(stack.cards, stackCards)) ?? null
  }

  const drawFromDeck = () => {
    if (!game || game.phase !== 'draw') {
      setToast('You need to draw before playing a stack.')
      return
    }
    if (!canDrawThisTurn) {
      setToast('It is not your turn to draw.')
      return
    }
    if (!sendAction('draw', { source: 'deck' })) return
    setToast('Card drawn from the deck.')
  }

  const drawFromDiscard = () => {
    if (!game || game.phase !== 'draw') {
      setToast('You can only pick from the discard pile on your draw turn.')
      return
    }
    if (!canDrawThisTurn) {
      setToast('It is not your turn to draw.')
      return
    }
    if (!sendAction('draw', { source: 'discard' })) return
    setToast('Card picked from the discard pile.')
  }

  const discardSelected = () => {
    if (!game || selectedCardIds.length !== 1) {
      setToast('Choose exactly one card to discard.')
      return
    }
    if (!canDiscard) {
      setToast('You must draw before you can discard this turn.')
      return
    }

    const chosenId = selectedCardIds[0]
    if (!sendAction('discard', { cardId: chosenId })) return
    setSelectedCardIds([])
    setToast('Card discarded.')
  }

  const playSelectedStack = () => {
    if (!game || game.phase !== 'play' || !game.hasDrawnThisTurn) {
      setToast('You must draw before playing a stack.')
      return
    }

    if (!canActThisTurn) {
      setToast('You can only play stacks on your turn.')
      return
    }

    if (selectedCardIds.length < 3) {
      setToast('Select at least 3 cards to make a stack.')
      return
    }

    const handSnapshot = currentHand
    const stackCards = handSnapshot.filter((card) => selectedCardIds.includes(card.id))
    if (!isValidStack(stackCards)) {
      setToast('Stacks must be 3+ cards in sequence or same rank.')
      return
    }

    const existingStack = findStackToExtend(stackCards)
    if (!existingStack && !canOpenNewStackForPlayer(game.stacks, currentPlayer.id)) {
      setToast('You can only open up to 2 stacks in a round.')
      return
    }

    if (existingStack && !canExtendStack(existingStack.cards, stackCards)) {
      setToast('Those cards do not correctly extend the selected stack.')
      return
    }

    if (!sendAction('play_stack', { cardIds: selectedCardIds })) return
    setSelectedCardIds([])
    if (existingStack) {
      setToast('Cards added to the table stack.')
    } else {
      setToast('Stack played. Turn passed to the next player.')
    }
  }

  const sortHand = () => {
    setGame((current) => {
      if (!current) return current
      const active = current.players.find((player) => player.id === playerId)
      if (!active) return current
      const sorted = [...active.hand].sort((left, right) => {
        const leftRank = ranks.indexOf(left.rank)
        const rightRank = ranks.indexOf(right.rank)
        if (leftRank !== rightRank) return leftRank - rightRank
        return suits.indexOf(left.suit) - suits.indexOf(right.suit)
      })

      const updatedPlayers = current.players.map((player) =>
        player.id === playerId ? { ...player, hand: sorted } : player,
      )

      return { ...current, players: updatedPlayers }
    })
  }

  const startSinglePlayer = (countOverride = singlePlayerCount) => {
    const seatedGame = createGameState(countOverride, singlePlayerJokerMode, {
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
          const stackMove = findAiStackMove(active.hand, current.stacks, active.id)
          if (stackMove) {
            const remainingHand = active.hand.filter((card) =>
              !stackMove.cards.some((stackCard) => stackCard.id === card.id),
            )
            nextPlayers[current.activeIndex] = { ...active, hand: remainingHand }
            if (stackMove.stackIndex >= 0) {
              nextStacks[stackMove.stackIndex] = {
                ...nextStacks[stackMove.stackIndex],
                cards: [...nextStacks[stackMove.stackIndex].cards, ...stackMove.cards],
              }
            } else {
              nextStacks.push({ ownerId: active.id, cards: stackMove.cards })
            }

            const winner = remainingHand.length === 0 ? active.name : null
            if (winner) setScreen('winner')
            return {
              ...current,
              players: nextPlayers,
              stacks: nextStacks,
              activeIndex: winner ? current.activeIndex : advanceTurnIndex(nextPlayers.length, current.activeIndex),
              phase: 'draw',
              hasDrawnThisTurn: false,
              winner,
            }
          }

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
            hasDrawnThisTurn: true,
          }
        }

        if (current.hasDrawnThisTurn) {
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
            activeIndex: remainingHand.length === 0 ? current.activeIndex : advanceTurnIndex(nextPlayers.length, current.activeIndex),
            phase: 'draw',
            hasDrawnThisTurn: false,
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
          activeIndex: remainingHand.length === 0 ? current.activeIndex : advanceTurnIndex(nextPlayers.length, current.activeIndex),
          phase: 'draw',
          hasDrawnThisTurn: false,
          winner: remainingHand.length === 0 ? active.name : null,
        }
      })
    }, 700)

    return () => window.clearTimeout(timer)
  }, [game, screen])

  const standings = game ? getStandings(game.players) : []
  const activePlayer = game?.players?.[game.activeIndex] ?? null

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
                <label className="field full-width compact-field">
                  <span>Joker</span>
                  <select value={singlePlayerJokerMode} onChange={(event) => setSinglePlayerJokerMode(event.target.value)}>
                    <option value="seen">Seen joker</option>
                    <option value="blind">Blind joker</option>
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
              <input value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())} placeholder="NOVA-4821" />
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
              setRoomCodeInput(normalized)
              setRoomCode(normalized)
              const nextGame = createGameState(2, jokerMode, { playerId })
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
        <section className="lobby-screen">
          <header className="game-header">
            <button className="game-brand" onClick={() => setScreen('landing')} aria-label="Back to home">F</button>
            <div className="game-room-title">{game.room}</div>
            <div className={`connection connection-compact ${isConnected ? 'is-online' : ''}`}>
              <span className={`status-dot ${isConnected ? 'live' : ''}`} />
              <span>{connectionLabel}</span>
              {!isConnected && <button className="connection-retry" onClick={() => retryNowRef.current?.()} aria-label="Retry connection"><RefreshCw size={14} /></button>}
            </div>
          </header>
          <section className="lobby-card">
            <div className="lobby-heading">
              <span className="eyebrow">TABLE READY</span>
              <h1>Gather your crew</h1>
              <p>Share the room code to invite players.</p>
            </div>
            <button className="room-code-button" onClick={copyRoomCode}>
              <span>{game.room}</span><Copy size={17} />
            </button>
            <div className="lobby-player-list">
              {game.players.map((player) => (
                <div className="lobby-player" key={player.id}>
                  <span className={`avatar avatar-${player.color}`}>{player.initials}</span>
                  <span className="lobby-player-name">{player.name}</span>
                  {player.id === playerId && <Crown size={15} className="host-icon" />}
                </div>
              ))}
              {Array.from({ length: Math.max(0, game.maxPlayers - game.players.length) }, (_, index) => (
                <div className="lobby-seat" key={`empty-${index}`}><Users size={15} /> Waiting for player</div>
              ))}
            </div>
            <button className="primary-button full lobby-start" onClick={openTable}>
              <Play size={17} fill="currentColor" /> Deal in
            </button>
          </section>
        </section>
      )}

      {screen === 'table' && game && (
        <section className="game-screen">
          <header className="game-header">
            <button className="game-brand" onClick={() => setScreen('lobby')} aria-label="Room lobby">F</button>
            <div className="game-room-title">{game.room}</div>
            <div className={`connection connection-compact ${isConnected ? 'is-online' : ''}`}>
              <span className={`status-dot ${isConnected ? 'live' : ''}`} />
              <span>{connectionLabel}</span>
              {!isConnected && <button className="connection-retry" onClick={() => retryNowRef.current?.()} aria-label="Retry connection"><RefreshCw size={14} /></button>}
            </div>
          </header>

          <section className="game-table">
            <div className="opponent-row">
              {game.players.filter((player) => player.id !== playerId).map((player) => (
                <div key={player.id} className={`opponent-seat ${player.id === game.players[game.activeIndex]?.id ? 'active' : ''}`}>
                  <span className={`avatar avatar-${player.color}`}>{player.initials}</span>
                  <span className="opponent-info">
                    <b>{player.name}</b>
                    <small><span className="mini-card-back" /> × {player.hand.length}</small>
                  </span>
                  {player.id === game.players[game.activeIndex]?.id && <span className="seat-turn">TURN</span>}
                </div>
              ))}
            </div>

            <div className="felt-table">
              <div className="felt-glow" />
              <div className={`turn-badge ${isMyTurn ? 'my-turn' : ''}`} aria-live="polite">
                <span className="turn-pulse" />
                {game.winner ? `${game.winner} wins!` : isMyTurn ? (game.phase === 'draw' ? 'Your turn · draw a card' : 'Your turn · make a play') : `${activePlayer?.name ?? 'Player'} is playing`}
              </div>

              <div className="table-piles">
                <div className="pile-group">
                  <button className={`deck-stack ${canDrawThisTurn ? 'draw-ready' : ''}`} onClick={drawFromDeck} aria-label={`Draw from deck, ${game.deck.length} cards`} disabled={!canDrawThisTurn}>
                    <span /><span /><span className="playing-card back-card"><Layers3 size={24} /></span>
                  </button>
                  <span className="pile-count">{game.deck.length} in deck</span>
                </div>
                <div className="pile-divider" />
                <button className={`discard-pile ${canDrawThisTurn ? 'draw-ready' : ''}`} onClick={drawFromDiscard} aria-label="Draw from discard pile" disabled={!canDrawThisTurn || game.discard.length === 0}>
                  <span className={`playing-card discard-card ${game.discard[0]?.color === 'red' ? 'red-card' : ''}`}>
                    <span className="playing-card-corner">{game.discard[0]?.rank ?? 'A'}<small>{game.discard[0]?.suit ?? '♠'}</small></span>
                    <span className="card-center-suit">{game.discard[0]?.suit ?? '♠'}</span>
                    <span className="playing-card-corner corner-bottom">{game.discard[0]?.rank ?? 'A'}<small>{game.discard[0]?.suit ?? '♠'}</small></span>
                  </span>
                  <span className="pile-count">Discard</span>
                </button>
              </div>

              {game.stacks.length > 0 && (
                <div className="table-stacks" aria-label="Played stacks">
                  {game.stacks.map((stack, stackIndex) => (
                    <div className="table-stack" key={`${stack.ownerId ?? 'stack'}-${stackIndex}-${stack.cards.map((card) => card.id).join('-')}`}>
                      <span className="stack-owner">{stack.ownerId === playerId ? 'YOU' : game.players.find((player) => player.id === stack.ownerId)?.name ?? 'TABLE'}</span>
                      <div className="stack-mini-cards">
                        {stack.cards.map((card) => (
                          <span className={`stack-mini-card ${card.color === 'red' ? 'red-card' : ''}`} key={card.id}>
                            {card.rank}<small>{card.suit}</small>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="felt-ornament" aria-hidden="true">F</div>
            </div>

            <section className="player-hand" aria-label="Your hand">
              <div className="hand-heading">
                <div className="you-label"><span className={`avatar avatar-${myPlayer?.color ?? 'mint'}`}>{myPlayer?.initials ?? 'YOU'}</span><b>Your hand</b><span className="hand-count">{currentHand.length}</span></div>
                <button className="sort-button" onClick={sortHand}>Sort</button>
              </div>
              <div className="hand-scroll">
                {currentHand.map((card, index) => (
                  <button
                    key={card.id}
                    className={`hand-card ${card.color === 'red' ? 'red-card' : ''} ${selectedCardIds.includes(card.id) ? 'selected' : ''}`}
                    style={{ '--card-index': index }}
                    onClick={() => toggleCardSelection(card.id)}
                    aria-pressed={selectedCardIds.includes(card.id)}
                    type="button"
                  >
                    <span className="playing-card-corner">{card.rank}<small>{card.suit}</small></span>
                    <span className="card-center-suit">{card.suit}</span>
                    <span className="playing-card-corner corner-bottom">{card.rank}<small>{card.suit}</small></span>
                  </button>
                ))}
              </div>
              <div className="action-dock">
                {game.phase === 'draw' ? (
                  <>
                    <button className="action-button secondary-action" onClick={drawFromDiscard} disabled={!canDrawThisTurn || game.discard.length === 0}>Take discard</button>
                    <button className="action-button primary-action" onClick={drawFromDeck} disabled={!canDrawThisTurn}><Layers3 size={17} /> Draw card</button>
                  </>
                ) : (
                  <>
                    <button className="action-button secondary-action" onClick={() => setSelectedCardIds([])} disabled={selectedCardIds.length === 0}>Clear</button>
                    <button className="action-button secondary-action" onClick={discardSelected} disabled={!canDiscard || selectedCardIds.length !== 1}>Discard</button>
                    <button className="action-button primary-action" onClick={playSelectedStack} disabled={!canPlayStack || selectedCardIds.length < 3}>Play stack <span>{selectedCardIds.length || ''}</span></button>
                  </>
                )}
              </div>
            </section>
          </section>
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
