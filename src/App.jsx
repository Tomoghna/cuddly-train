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
  canSeeJoker,
  canDiscardThisTurn,
  canPlayStackThisTurn,
  canExtendStack,
  canOpenNewStackForPlayer,
  canPlayerAct,
  getRelativeSeat,
  getJokerLabel,
  getStandings,
  findAiStackMove,
  isValidStack,
  markJokers,
  ranks,
  suits,
} from './gameRules.js'
import { getReconnectDelay, getWebSocketUrl } from './websocketRecovery.js'
import './App.css'

const palette = ['mint', 'violet', 'amber', 'rose']
const INITIAL_HAND_SIZE = 8
const DEAL_CARD_INTERVAL_MS = 140
const DEAL_FLIGHT_DURATION_MS = 560

const pipLayouts = {
  A: [[50, 50]],
  2: [[50, 22], [50, 78]],
  3: [[50, 20], [50, 50], [50, 80]],
  4: [[29, 22], [71, 22], [29, 78], [71, 78]],
  5: [[29, 22], [71, 22], [50, 50], [29, 78], [71, 78]],
  6: [[29, 20], [71, 20], [29, 50], [71, 50], [29, 80], [71, 80]],
  7: [[29, 18], [71, 18], [29, 42], [71, 42], [50, 30], [29, 72], [71, 72]],
  8: [[29, 16], [71, 16], [29, 38], [71, 38], [29, 62], [71, 62], [29, 84], [71, 84]],
  9: [[29, 15], [71, 15], [29, 36], [71, 36], [50, 50], [29, 64], [71, 64], [29, 85], [71, 85]],
  10: [[29, 14], [71, 14], [29, 32], [71, 32], [29, 50], [71, 50], [29, 68], [71, 68], [29, 86], [71, 86]],
}

function CourtCardArt({ rank, suit }) {
  const suitColor = suit === '♥' || suit === '♦' ? '#b9343b' : '#263f36'
  const crownColor = rank === 'K' ? '#d5a744' : rank === 'Q' ? '#bd7c9a' : '#688e79'

  return (
    <svg className={`court-art court-${rank.toLowerCase()}`} viewBox="0 0 64 76" aria-hidden="true">
      <rect x="2" y="2" width="60" height="72" rx="7" fill="#f3e7c9" stroke="#b89961" strokeWidth="1.5" />
      <path d="M7 7h50v62H7z" fill="none" stroke="#d4bd8e" strokeWidth="1" />
      <path d="M10 10h44v26H10z" fill={suitColor} opacity=".12" />
      <path d="M15 57c2-10 8-15 17-15s15 5 17 15v8H15z" fill={crownColor} stroke="#765b43" strokeWidth="1.5" />
      <path d="M20 31c0-10 5-16 12-16s12 6 12 16v8c0 8-5 13-12 13s-12-5-12-13z" fill="#f1c99b" stroke="#765b43" strokeWidth="1.5" />
      <path d="M18 29 20 17l7 5 5-10 6 10 8-5 2 15-5-6-4 4-5-5-5 5-5-4z" fill={crownColor} stroke="#765b43" strokeWidth="1.5" />
      <circle cx="27" cy="33" r="1.3" fill="#29332e" />
      <circle cx="37" cy="33" r="1.3" fill="#29332e" />
      <path d="M28 42q4 3 8 0" fill="none" stroke="#8b4e47" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 57 9 49m38 0-8 8" fill="none" stroke="#765b43" strokeWidth="2" />
      <path d="M32 57v9" stroke="#f3e7c9" strokeWidth="1.5" />
      <text x="32" y="72" textAnchor="middle" fill={suitColor} fontSize="8" fontWeight="700">{suit}</text>
      <path d="M11 12 53 64" stroke="#fff" strokeWidth="1" opacity=".35" />
    </svg>
  )
}

function CardArtwork({ card }) {
  const isFaceCard = ['J', 'Q', 'K'].includes(card.rank)
  const pips = pipLayouts[card.rank] ?? []

  return (
    <>
      <span className="playing-card-corner">{card.rank}<small>{card.suit}</small></span>
      {isFaceCard ? (
        <CourtCardArt rank={card.rank} suit={card.suit} />
      ) : (
        <span className={`card-pips pip-count-${card.rank}`} aria-hidden="true">
          {pips.map(([left, top], index) => (
            <span className="card-pip" key={`${left}-${top}-${index}`} style={{ left: `${left}%`, top: `${top}%` }}>
              {card.suit}
            </span>
          ))}
        </span>
      )}
      <span className="playing-card-corner corner-bottom">{card.rank}<small>{card.suit}</small></span>
    </>
  )
}

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

  return markJokers(shuffleCards(cards))
}

function createGameState(playerCount, jokerMode = 'seen', options = {}) {
  const safePlayerCount = Math.max(2, Math.min(4, Number(playerCount) || 2))
  const deck = buildDeck()
  const playerId = options.playerId || 'human'
  const playerName = options.playerName || 'You'
  const players = Array.from({ length: safePlayerCount }, (_, index) => ({
    id: index === 0 ? playerId : options.aiIds?.[index] || `cpu-${index}`,
    name: index === 0 ? playerName : `Computer ${index}`,
    initials: index === 0 ? getPlayerInitials(playerName) : `C${index}`,
    color: palette[index % palette.length],
    hand: [],
    isAI: index !== 0,
  }))

  for (let cardIndex = 0; cardIndex < INITIAL_HAND_SIZE; cardIndex += 1) {
    players.forEach((player) => {
      player.hand.push(deck.pop())
    })
  }

  const jokerReference = deck[0]
  const discard = []
  const jokerLabel = getJokerLabel(jokerReference)

  return {
    room: options.room || 'NOVA-4821',
    playerCount: safePlayerCount,
    maxPlayers: safePlayerCount,
    jokerMode,
    jokerLabel,
    jokerReference,
    jokerVisible: jokerMode === 'seen',
    jokerSeenBy: jokerMode === 'seen' ? players.map((player) => player.id) : [],
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

function getPlayerInitials(name) {
  const words = name.trim().split(/\s+/)
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join('') : name.slice(0, 2)).toUpperCase()
}

function App() {
  const [screen, setScreen] = useState('landing')
  const [playerCount, setPlayerCount] = useState(4)
  const [singlePlayerCount, setSinglePlayerCount] = useState(2)
  const [singlePlayerJokerMode, setSinglePlayerJokerMode] = useState('blind')
  const [jokerMode, setJokerMode] = useState('seen')
  const [playerId] = useState(() => `player-${crypto.randomUUID().slice(0, 8)}`)
  const [playerName, setPlayerName] = useState('')
  const playerNameRef = useRef(playerName)
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
  const previousRoomStateRef = useRef(null)
  const [discardAnimation, setDiscardAnimation] = useState(null)
  const [isDealing, setIsDealing] = useState(false)
  const handScrollRef = useRef(null)

  useEffect(() => {
    if (screen !== 'table') return undefined

    const startTimer = window.setTimeout(() => setIsDealing(true), 0)
    const dealDuration = INITIAL_HAND_SIZE * (game?.players.length ?? 1) * DEAL_CARD_INTERVAL_MS + DEAL_FLIGHT_DURATION_MS
    const endTimer = window.setTimeout(() => setIsDealing(false), dealDuration)
    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(endTimer)
    }
  }, [screen, game?.players.length])

  const currentPlayer = game?.players[game.activeIndex]
  const myPlayer = game?.players.find((player) => player.id === playerId)
  const currentHand = myPlayer?.hand ?? []

  useEffect(() => {
    if (screen !== 'table' || !handScrollRef.current) return
    const scrollContainer = handScrollRef.current
    scrollContainer.scrollTo({
      left: Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth),
      behavior: 'smooth',
    })
  }, [screen, currentHand.length])
  const isMyTurn = serverState.activePlayerId === playerId || (!serverState.activePlayerId && !(game?.isSinglePlayer && currentPlayer?.isAI))
  const canActThisTurn = Boolean(game && currentPlayer && canPlayerAct(game, playerId)) || (isMyTurn && game?.phase === 'play')
  const isConnected = connectionStatus === 'connected'
  const canDrawThisTurn = isConnected && isMyTurn && game?.phase === 'draw'
  const canPlayStack = Boolean(isConnected && canPlayStackThisTurn(game) && isMyTurn)
  const canDiscard = game ? isConnected && canDiscardThisTurn(game) && isMyTurn : false
  const connectionLabel = {
    connecting: 'Connecting',
    connected: 'Live',
    reconnecting: `Reconnecting${reconnectAttempt ? ` (${reconnectAttempt})` : ''}`,
    offline: 'Offline',
    error: import.meta.env.PROD && !import.meta.env.VITE_WS_URL ? 'Server URL not set' : 'Connection error',
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
          const previousRoomState = previousRoomStateRef.current
          const discardedCard = message.discard?.[0]
          if (
            previousRoomState?.roomId === message.roomId
            && previousRoomState?.started
            && message.started
            && message.phase === 'draw'
            && message.activePlayerId !== previousRoomState.activePlayerId
            && discardedCard?.id
            && discardedCard.id !== previousRoomState.discardCardId
          ) {
            setDiscardAnimation({
              cardId: discardedCard.id,
              seat: getRelativeSeat(message.players, playerId, previousRoomState.activePlayerId),
            })
          }
          previousRoomStateRef.current = {
            roomId: message.roomId,
            started: Boolean(message.started),
            activePlayerId: message.activePlayerId,
            discardCardId: discardedCard?.id ?? null,
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
                jokerLabel: message.jokerLabel ?? null,
                jokerReference: message.jokerReference ?? null,
                jokerVisible: Boolean(message.jokerVisible),
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
      const webSocketUrl = getWebSocketUrl(window.location, import.meta.env.VITE_WS_URL, import.meta.env.PROD)
      if (!webSocketUrl) {
        retryStopped = true
        setConnectionStatus('error')
        return
      }
      try {
        socket = new WebSocket(webSocketUrl)
      } catch {
        socketRef.current = null
        scheduleReconnect()
        return
      }
      socketRef.current = socket
      socket.addEventListener('open', () => {
        if (!isCurrentSocket(socket)) return
        socket.send(JSON.stringify({ type: 'join', roomId: roomCode, playerId, name: playerNameRef.current }))
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
    const normalizedPlayerName = playerNameRef.current.trim()
    if (!normalizedPlayerName) {
      setToast('Enter your name before creating a table.')
      return
    }
    playerNameRef.current = normalizedPlayerName
    setPlayerName(normalizedPlayerName)
    const nextRoomCode = (roomCodeInput || 'NOVA-4821').trim().toUpperCase().replace(/\s+/g, '-')
    const configuration = { playerCount: countOverride, jokerMode: modeOverride }
    const nextGame = createGameState(countOverride, modeOverride, { playerId, playerName: normalizedPlayerName })
    nextGame.room = nextRoomCode
    setGame(nextGame)
    setSelectedCardIds([])
    setRoomCodeInput(nextRoomCode)
    if (nextRoomCode === roomCode && joinedRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
      sendRoomControl('set_player_name', { name: normalizedPlayerName })
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
      setToast('You already drew a card this turn.')
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
    if (!game || !canPlayStackThisTurn(game)) {
      setToast('Play a stack before drawing a card.')
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
    const jokerUnknown = game.jokerMode === 'blind' && !canSeeJoker(game.jokerMode, playerId, game.jokerSeenBy)
    if (!jokerUnknown && !isValidStack(stackCards)) {
      setToast('Stacks must be 3+ cards in sequence or same rank.')
      return
    }

    const existingStack = jokerUnknown ? null : findStackToExtend(stackCards)
    if (!jokerUnknown && !existingStack && !canOpenNewStackForPlayer(game.stacks, currentPlayer.id)) {
      setToast('You can only open up to 2 stacks in a round.')
      return
    }

    if (!jokerUnknown && existingStack && !canExtendStack(existingStack.cards, stackCards)) {
      setToast('Those cards do not correctly extend the selected stack.')
      return
    }

    if (!sendAction('play_stack', { cardIds: selectedCardIds })) return
    if (game.isSinglePlayer && game.jokerMode === 'blind') {
      setGame((current) => current && ({
        ...current,
        jokerVisible: true,
        jokerSeenBy: [...new Set([...(current.jokerSeenBy ?? []), playerId])],
      }))
    }
    setSelectedCardIds([])
    if (existingStack) {
      setToast('Cards added to the table stack.')
    } else if (jokerUnknown) {
      setToast('Stack played. The joker is now revealed to you.')
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
              jokerSeenBy: current.jokerMode === 'blind'
                ? [...new Set([...(current.jokerSeenBy ?? []), active.id])]
                : current.jokerSeenBy,
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
  const opponents = game?.players
    .filter((player) => player.id !== playerId)
    .map((player) => ({
      ...player,
      seat: getRelativeSeat(game.players, playerId, player.id),
    })) ?? []
  const jokerIsVisible = game && (
    game.jokerVisible || canSeeJoker(game.jokerMode, playerId, game.jokerSeenBy)
  )

  return (
    <main className="app-shell">
      {screen === 'landing' && (
        <section className="landing-shell">
          <div className="landing-card">
            <header className="landing-hero">
              <div className="hero-arch" aria-hidden="true">
                <span className="hero-playing-card hero-card-left">A<small>♠</small></span>
                <span className="hero-playing-card hero-card-right">K<small>♥</small></span>
                <span className="hero-playing-card hero-card-center">J<small>♣</small></span>
                <span className="hero-spark hero-spark-one">✦</span>
                <span className="hero-spark hero-spark-two">✧</span>
              </div>
              <h1 className="hero-wordmark" aria-label="FISS">
                <span>F</span><span>I</span><span>S</span><span>S</span>
              </h1>
              <div className="brand-subtitle">YOUR CARD TABLE</div>
              <div className="hero-status"><span /> READY WHEN YOU ARE</div>
            </header>

            <div className="landing-copy">
              <div className="eyebrow">THE NEXT HAND STARTS HERE</div>
              <h2>Make your move.</h2>
              <p>Bring your friends or take on the table solo.</p>
            </div>

            <div className="landing-grid">
              <section className="panel panel-strong multiplayer-panel">
                <div className="eyebrow">PLAY WITH FRIENDS</div>
                <button className="primary-button" onClick={() => setScreen('new-game')}>
                  <Plus size={16} /> Create a table
                </button>
                <button className="secondary-button" onClick={() => setScreen('join-game')}>
                  <Users size={16} /> Join with a code
                </button>
              </section>

              <section className="panel single-player-panel">
                <div className="eyebrow">GO SOLO</div>
                <label className="field full-width compact-field">
                  <span>Table size</span>
                  <select value={singlePlayerCount} onChange={(event) => setSinglePlayerCount(Number(event.target.value))}>
                    <option value={2}>2 players</option>
                    <option value={3}>3 players</option>
                    <option value={4}>4 players</option>
                  </select>
                </label>
                <label className="field full-width compact-field">
                  <span>Joker rules</span>
                  <select value={singlePlayerJokerMode} onChange={(event) => setSinglePlayerJokerMode(event.target.value)}>
                    <option value="seen">Seen joker</option>
                    <option value="blind">Blind joker</option>
                  </select>
                </label>
                <button className="primary-button accent" onClick={() => startSinglePlayer(singlePlayerCount)}>
                  <Play size={16} fill="currentColor" /> Deal me in
                </button>
              </section>
            </div>
            <footer className="landing-footer"><span>FISS</span> · GOOD CARDS. GOOD COMPANY.</footer>
          </div>
        </section>
      )}

      {screen === 'new-game' && (
        <section className="setup-shell room-setup-shell">
          <div className="setup-card room-setup-card">
            <header className="setup-topbar">
              <div className="setup-brand">
                <span className="setup-brand-mark">F</span>
                <span className="setup-brand-copy"><b>FISS</b><small>CARD TABLE</small></span>
              </div>
              <button className="ghost-button" onClick={() => setScreen('landing')}>Back</button>
            </header>

            <div className="setup-heading">
              <div className="eyebrow">CREATE A TABLE</div>
              <h1>Create your table</h1>
              <p>Set the table size and choose a room name to share.</p>
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
              <span>Your name</span>
              <input
                value={playerName}
                onChange={(event) => {
                  const name = event.target.value.slice(0, 24)
                  playerNameRef.current = name
                  setPlayerName(name)
                }}
                maxLength={24}
                autoComplete="nickname"
                placeholder="Enter your name"
              />
            </label>

            <label className="field full-width">
              <span>Room name</span>
              <input className="room-code-field" value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())} placeholder="NOVA-4821" />
            </label>

            <button className="primary-button full setup-submit" onClick={() => startGame(playerCount, jokerMode)}>
              <Zap size={16} /> Create room
            </button>
          </div>
        </section>
      )}

      {screen === 'join-game' && (
        <section className="setup-shell room-setup-shell">
          <div className="setup-card room-setup-card">
            <header className="setup-topbar">
              <div className="setup-brand">
                <span className="setup-brand-mark">F</span>
                <span className="setup-brand-copy"><b>FISS</b><small>CARD TABLE</small></span>
              </div>
              <button className="ghost-button" onClick={() => setScreen('landing')}>Back</button>
            </header>

            <div className="setup-heading">
              <div className="eyebrow">JOIN A TABLE</div>
              <h1>Join a room</h1>
              <p>Enter the room code your friend shared with you.</p>
            </div>

            <label className="field full-width">
              <span>Your name</span>
              <input
                value={playerName}
                onChange={(event) => {
                  const name = event.target.value.slice(0, 24)
                  playerNameRef.current = name
                  setPlayerName(name)
                }}
                maxLength={24}
                autoComplete="nickname"
                placeholder="Enter your name"
              />
            </label>

            <label className="field full-width">
              <span>Room code</span>
              <input className="room-code-field" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ROOM-1234" />
            </label>

            <button className="primary-button full setup-submit" onClick={() => {
              const normalizedPlayerName = playerNameRef.current.trim()
              if (!normalizedPlayerName) {
                setToast('Enter your name before joining a table.')
                return
              }
              playerNameRef.current = normalizedPlayerName
              setPlayerName(normalizedPlayerName)
              const normalized = (joinCode || roomCode || 'NOVA-4821').trim().toUpperCase().replace(/\s+/g, '-')
              setRoomCodeInput(normalized)
              if (normalized === roomCode && joinedRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
                sendRoomControl('set_player_name', { name: normalizedPlayerName })
              }
              setRoomCode(normalized)
              const nextGame = createGameState(2, jokerMode, { playerId, playerName: normalizedPlayerName })
              nextGame.room = normalized
              setGame(nextGame)
              setScreen('lobby')
            }}>
              <Send size={16} /> Join room
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

          <section className={`game-table${isDealing ? ' is-dealing' : ''}`}>
            {isDealing && (
              <div className="deal-flight" aria-hidden="true">
                {Array.from({ length: INITIAL_HAND_SIZE * game.players.length }, (_, index) => {
                  const recipientIndex = index % game.players.length
                  const recipient = game.players[recipientIndex]
                  const seat = getRelativeSeat(game.players, playerId, recipient.id)
                  const recipientSeat = seat === 'bottom' ? 'hand' : seat ?? 'top'
                  return (
                    <span
                      className={`deal-flight-card deal-to-${recipientSeat}`}
                      key={index}
                      style={{ '--deal-delay': `${index * DEAL_CARD_INTERVAL_MS}ms` }}
                    />
                  )
                })}
              </div>
            )}
            <div className="opponent-row" aria-label="Opponents">
              {opponents.map((player) => (
                <div key={player.id} className={`opponent-seat seat-${player.seat} ${player.id === game.players[game.activeIndex]?.id ? 'active' : ''}`}>
                  <span className={`avatar avatar-${player.color}`}>{player.initials}</span>
                  <span className="opponent-info">
                    <b>{player.name}</b>
                    <span className="opponent-card-backs" role="img" aria-label={`${player.hand.length} cards face down`}>
                      {player.hand.map((card, index) => (
                        <span
                          className="opponent-card-back"
                          key={card.id}
                          style={{
                            left: `${Math.min(index * 5, 45)}px`,
                            zIndex: index,
                            '--card-index': index,
                            '--deal-delay': `${(index * game.players.length + game.players.findIndex((dealPlayer) => dealPlayer.id === player.id)) * DEAL_CARD_INTERVAL_MS}ms`,
                          }}
                          aria-hidden="true"
                        />
                      ))}
                    </span>
                  </span>
                  {player.id === game.players[game.activeIndex]?.id && <span className="seat-turn">TURN</span>}
                </div>
              ))}
            </div>

            <div className={`felt-table${game.stacks.length ? ' has-stacks' : ''}`}>
              <div className="felt-glow" />
              <div className={`turn-badge ${isMyTurn ? 'my-turn' : ''}`} aria-live="polite">
                <span className="turn-pulse" />
                {game.winner ? `${game.winner} wins!` : isMyTurn ? (game.phase === 'draw' ? 'Your turn · draw or play a stack' : 'Your turn · discard a card') : `${activePlayer?.name ?? 'Player'} is playing`}
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
                  {game.discard[0] ? (
                    <span
                      key={game.discard[0].id}
                      className={`playing-card discard-card ${game.discard[0].color === 'red' ? 'red-card' : ''} ${discardAnimation?.cardId === game.discard[0].id ? `discard-throwing from-${discardAnimation.seat}` : ''}`}
                    >
                      <CardArtwork card={game.discard[0]} />
                    </span>
                  ) : <span className="empty-discard-card">Empty</span>}
                  <span className="pile-count">{game.discard.length ? 'Discard' : 'Empty discard'}</span>
                </button>
              </div>
              <div className="joker-indicator" aria-live="polite">
                {jokerIsVisible && game.jokerReference
                  ? `Bottom card: ${game.jokerReference.rank}${game.jokerReference.suit} · Jokers: ${game.jokerLabel}`
                  : 'Joker hidden until you play a stack'}
              </div>

              {game.stacks.length > 0 && (
                <div className="table-stacks" aria-label="Played stacks">
                  {game.stacks.map((stack, stackIndex) => {
                    const owner = game.players.find((player) => player.id === stack.ownerId)
                    const ownerName = owner?.id === playerId ? 'You' : owner?.name ?? 'Unknown player'

                    return (
                      <div className="table-stack" role="group" key={`${stack.ownerId ?? 'stack'}-${stackIndex}-${stack.cards.map((card) => card.id).join('-')}`} aria-label={`Stack played by ${ownerName}`}>
                        <div className="table-stack-player">
                          <span className={`stack-player-marker avatar-${owner?.color ?? 'mint'}`}>{owner?.initials ?? '?'}</span>
                          <span className="stack-player-name">{ownerName}</span>
                        </div>
                        <div className="stack-mini-cards">
                          {stack.cards.map((card) => (
                            <span className={`stack-mini-card ${card.color === 'red' ? 'red-card' : ''}`} key={card.id}>
                              {card.rank}<small>{card.suit}</small>
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="felt-ornament" aria-hidden="true">F</div>
            </div>

            <section className="player-hand" aria-label="Your hand">
              <div className="hand-heading">
                <div className="you-label"><span className={`avatar avatar-${myPlayer?.color ?? 'mint'}`}>{myPlayer?.initials ?? 'YOU'}</span><b>Your hand</b><span className="hand-count">{currentHand.length}</span></div>
                <button className="sort-button" onClick={sortHand}>Sort</button>
              </div>
              <div className="hand-scroll" ref={handScrollRef}>
                {currentHand.map((card, index) => (
                  <button
                    key={card.id}
                    className={`hand-card ${card.color === 'red' ? 'red-card' : ''} ${selectedCardIds.includes(card.id) ? 'selected' : ''}`}
                    style={{
                      '--card-index': index,
                      '--deal-delay': `${(index * game.players.length + Math.max(0, game.players.findIndex((dealPlayer) => dealPlayer.id === playerId))) * DEAL_CARD_INTERVAL_MS}ms`,
                    }}
                    onClick={() => toggleCardSelection(card.id)}
                    aria-pressed={selectedCardIds.includes(card.id)}
                    aria-label={`${card.rank} of ${card.suit}`}
                    type="button"
                  >
                    <CardArtwork card={card} />
                  </button>
                ))}
              </div>
              <div className="action-dock">
                {game.phase === 'draw' ? (
                  <>
                    <button className="action-button secondary-action" onClick={drawFromDiscard} disabled={!canDrawThisTurn || game.discard.length === 0}>Take discard</button>
                    <button className="action-button primary-action" onClick={drawFromDeck} disabled={!canDrawThisTurn}><Layers3 size={17} /> Draw card</button>
                    <button className="action-button secondary-action" onClick={playSelectedStack} disabled={!canPlayStack || selectedCardIds.length < 3}>Play stack <span>{selectedCardIds.length || ''}</span></button>
                  </>
                ) : (
                  <>
                    <button className="action-button secondary-action" onClick={() => setSelectedCardIds([])} disabled={selectedCardIds.length === 0}>Clear</button>
                    <button className="action-button secondary-action" onClick={discardSelected} disabled={!canDiscard || selectedCardIds.length !== 1}>Discard</button>
                  </>
                )}
              </div>
            </section>
          </section>
        </section>
      )}

      {screen === 'winner' && game && (
        <section className="winner-screen">
          <header className="game-header">
            <button className="game-brand" onClick={() => setScreen('landing')} aria-label="Back to home">F</button>
            <div className="game-room-title">{game.room}</div>
            <div className="connection connection-compact is-online">
              <span className="status-dot live" />
              <span>Round complete</span>
            </div>
          </header>

          <div className="winner-portrait">
            <div className="winner-confetti" aria-hidden="true">
              {Array.from({ length: 36 }, (_, index) => (
                <span
                  key={index}
                  className={`confetti-piece confetti-${index % 6}`}
                  style={{
                    '--confetti-index': index,
                    '--confetti-x': `${(index * 37) % 100}%`,
                    '--confetti-delay': `${(index % 12) * 45}ms`,
                    '--confetti-drift': `${((index * 29) % 180) - 90}px`,
                  }}
                />
              ))}
            </div>

            <div className="popper popper-left" aria-hidden="true"><span /><span /><span /><span /><span /></div>
            <div className="popper popper-right" aria-hidden="true"><span /><span /><span /><span /><span /></div>

            <main className="winner-card">
              <div className="winner-crown" aria-hidden="true"><Crown size={28} /></div>
              <div className="eyebrow">WINNER</div>
              <h1>{game.winner ?? 'Round complete'}</h1>
              <p className="winner-subtitle">The table belongs to you</p>

              <div className="winner-rankings">
                {standings.map((player, index) => (
                  <div key={player.id} className={`winner-pill ${index === 0 ? 'first' : index === 1 ? 'second' : 'third'}`}>
                    <span className={`winner-avatar avatar avatar-${player.color}`}>{player.initials}</span>
                    <span className="winner-place">{index + 1}</span>
                    <b>{player.name}</b>
                    <small>{player.hand.length} cards left</small>
                  </div>
                ))}
              </div>

              <button className="primary-button full winner-action" onClick={() => setScreen('landing')}>
                <Crown size={16} /> Back to lobby
              </button>
            </main>
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
