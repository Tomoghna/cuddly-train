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
  canInsertCardsAtIndex,
  canOpenNewStackForPlayer,
  canPlayerAct,
  addCardsToStack,
  insertCardsAtIndex,
  reshuffleDiscardIntoDeck,
  getRelativeSeat,
  getJokerLabel,
  getStandings,
  findAiStackMove,
  hasPlayerPlayedStack,
  isValidStack,
  markJokers,
  orderStackCards,
  ranks,
  suits,
} from './gameRules.js'
import { getReconnectDelay, getWebSocketUrl } from './websocketRecovery.js'
import './App.css'

const palette = ['mint', 'violet', 'amber', 'rose']
const INITIAL_HAND_SIZE = 8
const TURN_DURATION_SECONDS = 90
const DEAL_CARD_INTERVAL_MS = 140
const DEAL_FLIGHT_DURATION_MS = 560
const MULTIPLAYER_SESSION_KEY = 'fiss.multiplayer-session'

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
  const robeColor = rank === 'K' ? '#315944' : rank === 'Q' ? '#73506a' : '#3c6178'
  const trimColor = rank === 'K' ? '#d5a744' : rank === 'Q' ? '#cf9d5a' : '#7fb4a0'

  return (
    <svg className={`court-art court-${rank.toLowerCase()}`} viewBox="0 0 64 76" aria-hidden="true">
      <path d="M9 70c2-13 9-21 23-22 14 1 21 9 23 22z" fill={robeColor} stroke="#634c39" strokeWidth="1.5" />
      <path d="m25 49 7 11 7-11-3-3h-8z" fill="#f2e7d0" stroke="#634c39" strokeWidth="1" />
      <path d="M18 30c-3-9 2-17 10-19 9-2 17 4 18 13l-2 26-8 5H25l-7-7z" fill="#49352f" />
      {rank === 'Q' && <path d="M20 34 15 62l10-7 3-13zm24 0 5 28-10-7-3-13z" fill="#49352f" />}
      <path d="M20 25c1-8 23-10 24 1v13c0 9-5 15-12 15s-12-6-12-15z" fill="#f1c99b" stroke="#765b43" strokeWidth="1.2" />
      <path d="M24 33q3-2 6 0m4 0q3-2 6 0" fill="none" stroke="#49352f" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="27" cy="35" r="1" fill="#29332e" />
      <circle cx="37" cy="35" r="1" fill="#29332e" />
      <path d="m32 36-2 6h4" fill="none" stroke="#ad775d" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29 46q3 2 6 0" fill="none" stroke="#8b4e47" strokeWidth="1.3" strokeLinecap="round" />
      {rank === 'K' && (
        <>
          <path d="M23 43q4 3 8 0 4 3 8 0l-2 9-6 5-6-5z" fill="#604238" />
          <path d="M24 43q4 2 8 0 4 2 8 0" fill="none" stroke="#332c28" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {rank === 'K' && (
        <g>
          <path d="m18 23 2-11 8 6 4-10 5 10 8-6 2 12z" fill={trimColor} stroke="#765b43" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="32" cy="16" r="2" fill={suitColor} />
        </g>
      )}
      {rank === 'Q' && (
        <g>
          <path d="m21 22 3-9 8 6 8-6 3 9z" fill={trimColor} stroke="#765b43" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="32" cy="17" r="2" fill={suitColor} />
          <circle cx="18" cy="42" r="2" fill={trimColor} />
          <circle cx="46" cy="42" r="2" fill={trimColor} />
        </g>
      )}
      {rank === 'J' && (
        <g>
          <path d="M18 25q3-12 14-12t14 12l-5 3H23z" fill={trimColor} stroke="#765b43" strokeWidth="1.3" />
          <path d="M31 13q-2-9 5-11 0 7 7 8-5 5-12 3" fill="#d8b66e" stroke="#765b43" strokeWidth="1.2" />
          <path d="m22 25 10-5 10 5" fill="none" stroke="#f4e3ba" strokeWidth="1.3" />
        </g>
      )}
      <path d="M12 66h40" stroke={trimColor} strokeWidth="2" opacity=".75" />
      <text x="32" y="75" textAnchor="middle" fill={suitColor} fontSize="12" fontWeight="800">{suit}</text>
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

function getDiscardCardTransform(cardId) {
  const hash = String(cardId).split('').reduce(
    (value, character) => (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0,
    0,
  )
  const direction = hash % 2 === 0 ? -1 : 1
  const offset = 7 + ((hash >>> 1) % 6)
  const rotation = ((hash >>> 4) % 9 - 4) * 1.5
  const verticalOffset = -((hash >>> 8) % 5)

  return `translate(${direction * offset}px, ${verticalOffset}px) rotate(${rotation}deg)`
}

function HandTurnTimer({ onExpire }) {
  const [secondsRemaining, setSecondsRemaining] = useState(TURN_DURATION_SECONDS)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    let remaining = TURN_DURATION_SECONDS
    const timer = window.setInterval(() => {
      remaining -= 1
      setSecondsRemaining(remaining)
      if (remaining <= 0) {
        window.clearInterval(timer)
        onExpireRef.current()
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <span
      className={`hand-turn-timer ${secondsRemaining <= 5 ? 'urgent' : ''}`}
      role="timer"
      aria-label={`${secondsRemaining} seconds remaining`}
    >
      {secondsRemaining}s
    </span>
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

function createPlayerId() {
  const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `player-${id.slice(0, 8)}`
}

function readMultiplayerSession() {
  try {
    const stored = window.localStorage.getItem(MULTIPLAYER_SESSION_KEY)
    if (!stored) return null
    const session = JSON.parse(stored)
    if (
      typeof session?.playerId === 'string'
      && /^[a-z0-9-]{1,64}$/i.test(session.playerId)
      && typeof session?.playerName === 'string'
      && session.playerName.trim().length > 0
      && session.playerName.trim().length <= 24
      && typeof session?.roomCode === 'string'
      && /^[a-z0-9-]{1,24}$/i.test(session.roomCode)
    ) {
      return {
        playerId: session.playerId,
        playerName: session.playerName.trim(),
        roomCode: session.roomCode.toUpperCase(),
      }
    }
    window.localStorage.removeItem(MULTIPLAYER_SESSION_KEY)
    return null
  } catch (error) {
    console.warn('Unable to restore the previous multiplayer room.', error)
    return null
  }
}

function saveMultiplayerSession(session) {
  try {
    window.localStorage.setItem(MULTIPLAYER_SESSION_KEY, JSON.stringify(session))
  } catch (error) {
    console.warn('Unable to save the multiplayer room for reload recovery.', error)
  }
}

function clearMultiplayerSession() {
  try {
    window.localStorage.removeItem(MULTIPLAYER_SESSION_KEY)
  } catch (error) {
    console.warn('Unable to clear the saved multiplayer room.', error)
  }
}

function App() {
  const roomFromUrl = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase()
  const [savedSession] = useState(() => {
    const session = readMultiplayerSession()
    return session && (!roomFromUrl || session.roomCode === roomFromUrl) ? session : null
  })
  const [screen, setScreen] = useState(() => savedSession ? 'lobby' : 'landing')
  const [playerCount, setPlayerCount] = useState(4)
  const [singlePlayerCount, setSinglePlayerCount] = useState(2)
  const [singlePlayerJokerMode, setSinglePlayerJokerMode] = useState('blind')
  const [jokerMode, setJokerMode] = useState('seen')
  const [playerId] = useState(() => savedSession?.playerId ?? createPlayerId())
  const [playerName, setPlayerName] = useState(() => savedSession?.playerName ?? '')
  const playerNameRef = useRef(playerName)
  const [roomCode, setRoomCode] = useState(() => savedSession?.roomCode || roomFromUrl || 'NOVA-4821')
  const [roomCodeInput, setRoomCodeInput] = useState(roomCode)
  const [joinCode, setJoinCode] = useState('')
  const [game, setGame] = useState(() => createGameState(4, 'seen', {
    playerId,
    playerName: savedSession?.playerName,
    room: savedSession?.roomCode,
  }))
  const [selectedCardIds, setSelectedCardIds] = useState([])
  const [draggedCardId, setDraggedCardId] = useState(null)
  const [dropSlotIndex, setDropSlotIndex] = useState(null)
  const [dropTargetStackIndex, setDropTargetStackIndex] = useState(null)
  const [dropTargetStackInsertIndex, setDropTargetStackInsertIndex] = useState(null)
  const [isTableDropActive, setIsTableDropActive] = useState(false)
  const [isDiscardDropActive, setIsDiscardDropActive] = useState(false)
  const [isJokerPeekOpen, setIsJokerPeekOpen] = useState(false)
  const [selectedStackIndex, setSelectedStackIndex] = useState(null)
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
  const [reshuffleAnimation, setReshuffleAnimation] = useState(false)
  const [isDealing, setIsDealing] = useState(false)
  const handScrollRef = useRef(null)
  const tableStacksRef = useRef(null)
  const jokerPeekGestureRef = useRef(null)
  const suppressDeckClickRef = useRef(false)
  const wakeLockRef = useRef(null)

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

  useEffect(() => {
    if (screen !== 'table' || !('wakeLock' in navigator)) return undefined

    let disposed = false
    const requestWakeLock = async () => {
      if (disposed || document.visibilityState !== 'visible' || wakeLockRef.current) return
      try {
        const wakeLock = await navigator.wakeLock.request('screen')
        if (disposed || document.visibilityState !== 'visible') {
          await wakeLock.release()
          return
        }
        wakeLockRef.current = wakeLock
        wakeLock.addEventListener('release', () => {
          if (wakeLockRef.current === wakeLock) wakeLockRef.current = null
        }, { once: true })
      } catch (error) {
        console.warn('Screen wake lock is unavailable; the device may turn off the display while the game is open.', error)
      }
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void requestWakeLock()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    void requestWakeLock()
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      const wakeLock = wakeLockRef.current
      wakeLockRef.current = null
      if (wakeLock) {
        void wakeLock.release().catch((error) => {
          console.warn('Unable to release the screen wake lock.', error)
        })
      }
    }
  }, [screen])

  const currentPlayer = game?.players[game.activeIndex]
  const myPlayer = game?.players.find((player) => player.id === playerId)
  const currentHand = myPlayer?.hand ?? []
  const shouldConnectToRoom = !game?.isSinglePlayer
    && ['lobby', 'table', 'winner'].includes(screen)
    && playerName.trim().length > 0

  useEffect(() => {
    if (screen !== 'table' || !handScrollRef.current) return
    const scrollContainer = handScrollRef.current
    scrollContainer.scrollTo({
      left: Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth),
      behavior: 'smooth',
    })
  }, [screen, currentHand.length])

  useEffect(() => {
    if (!Number.isInteger(selectedStackIndex) || !tableStacksRef.current) return
    const selectedStack = tableStacksRef.current.querySelector(`[data-stack-index="${selectedStackIndex}"]`)
    selectedStack?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [selectedStackIndex])

  const isMyTurn = game?.isSinglePlayer
    ? currentPlayer?.id === playerId
    : serverState.activePlayerId === playerId || (!serverState.activePlayerId && currentPlayer?.id === playerId)
  const canActThisTurn = Boolean(game && currentPlayer && canPlayerAct(game, playerId)) || (isMyTurn && game?.phase === 'play')
  const isConnected = connectionStatus === 'connected'
  const canUseTurnActions = Boolean(game?.isSinglePlayer || isConnected)
  const canDrawThisTurn = canUseTurnActions && isMyTurn && game?.phase === 'draw'
  const canPlayStack = Boolean(canUseTurnActions && canPlayStackThisTurn(game) && isMyTurn)
  const canDiscard = game ? canUseTurnActions && canDiscardThisTurn(game) && isMyTurn : false
  const shouldRunTurnTimer = screen === 'table'
    && isMyTurn
    && currentPlayer?.id === playerId
    && Boolean(game?.isSinglePlayer || isConnected)
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
    if (!reshuffleAnimation) return undefined
    const timer = window.setTimeout(() => setReshuffleAnimation(false), 1100)
    return () => window.clearTimeout(timer)
  }, [reshuffleAnimation])

  useEffect(() => {
    if (!shouldConnectToRoom) return undefined

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
            && Number.isInteger(message.reshuffleVersion)
            && message.reshuffleVersion !== previousRoomState.reshuffleVersion
          ) {
            setReshuffleAnimation(true)
          }
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
            reshuffleVersion: Number.isInteger(message.reshuffleVersion) ? message.reshuffleVersion : previousRoomState?.reshuffleVersion ?? 0,
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
  }, [playerId, roomCode, shouldConnectToRoom])

  const sendAction = (type, payload = {}) => {
    if (!isMyTurn) {
      setToast('Wait for your turn before acting.')
      return false
    }

    if (game?.isSinglePlayer) {
      const active = game.players[game.activeIndex]
      if (!active || active.id !== playerId) {
        setToast('Wait for your turn before acting.')
        return false
      }

      if (type === 'draw') {
        if (game.phase !== 'draw') {
          setToast('You already drew a card this turn.')
          return false
        }

        const nextDeck = [...game.deck]
        let nextDiscard = [...game.discard]
        let reshuffleVersion = game.reshuffleVersion ?? 0
        let picked
        if (payload.source === 'discard') {
          picked = nextDiscard.shift()
        } else {
          let recyclableDeck = nextDeck
          if (recyclableDeck.length === 0 && nextDiscard.length > 0) {
            const recycled = reshuffleDiscardIntoDeck(recyclableDeck, nextDiscard)
            recyclableDeck = recycled.deck
            nextDiscard = recycled.discard
            reshuffleVersion += 1
          }
          picked = recyclableDeck.pop()
          nextDeck.splice(0, nextDeck.length, ...recyclableDeck)
        }
        if (!picked) {
          setToast(payload.source === 'discard' ? 'The discard pile is empty.' : 'The deck is empty.')
          return false
        }
        if (reshuffleVersion !== (game.reshuffleVersion ?? 0)) setReshuffleAnimation(true)

        setGame({
          ...game,
          players: game.players.map((player) =>
            player.id === playerId ? { ...player, hand: [...player.hand, picked] } : player,
          ),
          deck: nextDeck,
          discard: nextDiscard,
          reshuffleVersion,
          phase: 'play',
          hasDrawnThisTurn: true,
        })
        return true
      }

      if (type === 'discard') {
        if (!canDiscardThisTurn(game)) {
          setToast('Draw a card before discarding.')
          return false
        }
        const discarded = active.hand.find((card) => card.id === payload.cardId)
        if (!discarded) {
          setToast('That card is not in your hand.')
          return false
        }

        const remainingHand = active.hand.filter((card) => card.id !== discarded.id)
        const winner = remainingHand.length === 0 ? active.name : null
        setGame({
          ...game,
          players: game.players.map((player) =>
            player.id === playerId ? { ...player, hand: remainingHand } : player,
          ),
          discard: [discarded, ...game.discard],
          activeIndex: winner ? game.activeIndex : advanceTurnIndex(game.players.length, game.activeIndex),
          phase: 'draw',
          hasDrawnThisTurn: false,
          winner,
          reshuffleVersion: game.reshuffleVersion ?? 0,
        })
        if (winner) setScreen('winner')
        return true
      }

      if (type === 'play_stack') {
        if (!canPlayStackThisTurn(game) || !Array.isArray(payload.cardIds)) {
          setToast('Play a stack before drawing a card.')
          return false
        }
        const stackCards = active.hand.filter((card) => payload.cardIds.includes(card.id))
        if (stackCards.length !== payload.cardIds.length || stackCards.length === 0) {
          setToast('Those cards are not in your hand.')
          return false
        }

        const nextStacks = [...game.stacks]
        if (Number.isInteger(payload.stackIndex)) {
          const existingStack = nextStacks[payload.stackIndex]
          if (!existingStack || !canInsertCardsAtIndex(existingStack.cards, stackCards, payload.insertIndex)) {
            setToast('Those cards cannot be inserted at that position in the selected stack.')
            return false
          }
          nextStacks[payload.stackIndex] = {
            ...existingStack,
            cards: insertCardsAtIndex(existingStack.cards, stackCards, payload.insertIndex),
          }
        } else {
          if (stackCards.length < 3 || !isValidStack(stackCards) || !canOpenNewStackForPlayer(nextStacks, playerId)) {
            setToast('Those cards cannot open a new stack.')
            return false
          }
          nextStacks.push({ ownerId: playerId, cards: orderStackCards(stackCards) })
        }

        const remainingHand = active.hand.filter((card) => !payload.cardIds.includes(card.id))
        const winner = remainingHand.length === 0 ? active.name : null
        setGame({
          ...game,
          players: game.players.map((player) =>
            player.id === playerId ? { ...player, hand: remainingHand } : player,
          ),
          stacks: nextStacks,
          jokerSeenBy: game.jokerMode === 'blind'
            ? [...new Set([...(game.jokerSeenBy ?? []), playerId])]
            : game.jokerSeenBy,
          activeIndex: winner ? game.activeIndex : advanceTurnIndex(game.players.length, game.activeIndex),
          phase: 'draw',
          hasDrawnThisTurn: false,
          winner,
        })
        if (winner) setScreen('winner')
        return true
      }
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
    saveMultiplayerSession({ playerId, playerName: normalizedPlayerName, roomCode: nextRoomCode })
    const nextGame = createGameState(countOverride, modeOverride, { playerId, playerName: normalizedPlayerName })
    nextGame.room = nextRoomCode
    setGame(nextGame)
    setIsJokerPeekOpen(false)
    setSelectedCardIds([])
    setSelectedStackIndex(null)
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

  const leaveMultiplayerRoom = () => {
    clearMultiplayerSession()
    setToast('')
    setScreen('landing')
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
    const nextCardIds = selectedCardIds.includes(cardId)
      ? selectedCardIds.filter((id) => id !== cardId)
      : [...selectedCardIds, cardId]
    setSelectedCardIds(nextCardIds)
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
    setSelectedCardIds([])
    setSelectedStackIndex(null)
    setIsJokerPeekOpen(false)
    setToast('Card drawn from the deck.')
  }

  const autoDiscardTimedOutTurn = () => {
    if (!game || !shouldRunTurnTimer || currentPlayer?.id !== playerId) return
    if (game.phase !== 'draw' && (game.phase !== 'play' || !game.hasDrawnThisTurn)) return
    const cardToDiscard = currentHand[Math.floor(Math.random() * currentHand.length)]
    if (!cardToDiscard) {
      setToast('No card is available to discard.')
      return
    }

    if (game.isSinglePlayer) {
      if (game.phase === 'draw' && game.deck.length === 0 && game.discard.length === 0) {
        setToast('No card is available to draw.')
        return
      }

      setGame((current) => {
        if (!current) return current
        const active = current.players[current.activeIndex]
        if (!active || active.id !== playerId) return current

        const nextDeck = [...current.deck]
        let nextDiscard = [...current.discard]
        let reshuffleVersion = current.reshuffleVersion ?? 0
        let nextHand = [...active.hand]
        if (current.phase === 'draw') {
          let picked = nextDeck.pop()
          if (!picked && nextDiscard.length > 0) {
            const recycled = reshuffleDiscardIntoDeck([], nextDiscard)
            nextDiscard = recycled.discard
            picked = recycled.deck.pop()
            nextDeck.splice(0, nextDeck.length, ...recycled.deck)
            reshuffleVersion += 1
          }
          if (!picked) return current
          if (reshuffleVersion !== (current.reshuffleVersion ?? 0)) setReshuffleAnimation(true)
          nextHand.push(picked)
        } else if (current.phase !== 'play' || !current.hasDrawnThisTurn) {
          return current
        }

        const discarded = nextHand.shift()
        if (!discarded) return current
        nextDiscard.unshift(discarded)
        const winner = nextHand.length === 0 ? active.name : null
        if (winner) setScreen('winner')

        return {
          ...current,
          players: current.players.map((player) =>
            player.id === playerId ? { ...player, hand: nextHand } : player,
          ),
          deck: nextDeck,
          discard: nextDiscard,
          activeIndex: winner ? current.activeIndex : advanceTurnIndex(current.players.length, current.activeIndex),
          phase: 'draw',
          hasDrawnThisTurn: false,
          winner,
        }
      })
    } else {
      if (game.phase === 'draw') {
        const source = game.deck.length > 0
          ? 'deck'
          : game.discard.length > 0
            ? 'discard'
            : null
        if (!source) {
          setToast('No card is available to draw.')
          return
        }
        if (!sendAction('draw', { source })) return
      } else if (game.phase !== 'play' || !game.hasDrawnThisTurn) {
        return
      }
      if (!sendAction('discard', { cardId: cardToDiscard.id })) return
    }

    setSelectedCardIds([])
    setSelectedStackIndex(null)
    setToast('Time expired. A card was discarded automatically.')
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
    setSelectedCardIds([])
    setSelectedStackIndex(null)
    setToast('Card picked from the discard pile.')
  }

  const discardCard = (cardId) => {
    if (!game || !cardId) return
    if (!canDiscard) {
      setToast('You must draw before you can discard this turn.')
      return
    }
    if (!currentHand.some((card) => card.id === cardId)) {
      setToast('That card is not in your hand.')
      return
    }
    if (!sendAction('discard', { cardId })) return
    setSelectedCardIds([])
    setSelectedStackIndex(null)
    setToast('Card discarded.')
  }

  const discardSelected = () => {
    if (!game || selectedCardIds.length !== 1) {
      setToast('Choose exactly one card to discard.')
      return
    }
    discardCard(selectedCardIds[0])
  }

  const playSelectedStack = (cardIds = selectedCardIds, stackIndex = selectedStackIndex, insertIndex) => {
    if (!game || !canPlayStackThisTurn(game)) {
      setToast('Play a stack before drawing a card.')
      return
    }

    if (!canActThisTurn) {
      setToast('You can only play stacks on your turn.')
      return
    }

    const handSnapshot = currentHand
    const stackCards = handSnapshot.filter((card) => cardIds.includes(card.id))
    const jokerUnknown = game.jokerMode === 'blind' && !canSeeJoker(game.jokerMode, playerId, game.jokerSeenBy)
    const hasPlayedStack = hasPlayerPlayedStack(game.stacks, currentPlayer.id)
    const existingStack = hasPlayedStack && Number.isInteger(stackIndex)
      ? game.stacks[stackIndex]
      : null
    const insertionIndex = existingStack
      ? Number.isInteger(insertIndex)
        ? insertIndex
        : Array.from({ length: existingStack.cards.length + 1 }, (_, index) => index)
          .find((index) => canInsertCardsAtIndex(existingStack.cards, stackCards, index))
      : null
    const canExtendSelectedStack = !jokerUnknown
      && existingStack
      && Number.isInteger(insertionIndex)
      && canInsertCardsAtIndex(existingStack.cards, stackCards, insertionIndex)

    if (existingStack && !canExtendSelectedStack) {
      setToast('Those cards cannot be inserted at that position in the selected stack.')
      return
    }

    if (stackCards.length < 3 && !canExtendSelectedStack) {
      if (hasPlayedStack) {
        setToast('Select a compatible insertion point, or at least 3 cards for a new stack.')
      } else {
        setToast('Select at least 3 cards to make a new stack.')
      }
      return
    }

    if (!jokerUnknown && !canExtendSelectedStack && !isValidStack(stackCards)) {
      setToast('Stacks must be 3+ cards in sequence or same rank.')
      return
    }

    if (!canExtendSelectedStack && !canOpenNewStackForPlayer(game.stacks, currentPlayer.id)) {
      setToast('You can only open up to 2 stacks in a round.')
      return
    }

    const payload = {
      cardIds,
      ...(canExtendSelectedStack ? { stackIndex, insertIndex: insertionIndex } : {}),
    }
    if (!sendAction('play_stack', payload)) return
    if (game.isSinglePlayer && game.jokerMode === 'blind') {
      setGame((current) => current && ({
        ...current,
        jokerVisible: true,
        jokerSeenBy: [...new Set([...(current.jokerSeenBy ?? []), playerId])],
      }))
    }
    setSelectedCardIds([])
    setSelectedStackIndex(null)
    if (canExtendSelectedStack) {
      setToast('Cards inserted into the stack.')
    } else if (jokerUnknown) {
      setToast('Stack played. The joker is now revealed to you.')
    } else {
      setToast('Stack played. Turn passed to the next player.')
    }
  }

  const getDroppedCardIds = (event) => {
    const draggedId = event.dataTransfer.getData('text/plain')
    if (!draggedId) return []
    return [...new Set([...selectedCardIds, draggedId])]
  }

  const getStackInsertionIndex = (stackElement, clientX) => {
    const stackCards = [...stackElement.querySelectorAll('.table-stack-card')]
    const cardIndex = stackCards.findIndex((card) => {
      const bounds = card.getBoundingClientRect()
      return clientX < bounds.left + bounds.width / 2
    })
    return cardIndex === -1 ? stackCards.length : cardIndex
  }

  const handleTableDrop = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const cardIds = getDroppedCardIds(event)
    if (cardIds.length > 0) playSelectedStack(cardIds, null)
    setIsTableDropActive(false)
    setIsDiscardDropActive(false)
    setDropTargetStackIndex(null)
    setDropTargetStackInsertIndex(null)
  }

  const handleStackDrop = (event, stackIndex) => {
    event.preventDefault()
    event.stopPropagation()
    const cardIds = getDroppedCardIds(event)
    const stack = game?.stacks[stackIndex]
    const candidateCards = currentHand.filter((card) => cardIds.includes(card.id))
    const insertIndex = getStackInsertionIndex(event.currentTarget, event.clientX)
    if (stack && cardIds.length > 0) {
      if (canInsertCardsAtIndex(stack.cards, candidateCards, insertIndex)) {
        playSelectedStack(cardIds, stackIndex, insertIndex)
      } else {
        setToast('Those cards cannot be inserted at that position in the selected stack.')
      }
    }
    setIsTableDropActive(false)
    setIsDiscardDropActive(false)
    setDropTargetStackIndex(null)
    setDropTargetStackInsertIndex(null)
  }

  const handleDiscardDrop = (event) => {
    event.preventDefault()
    event.stopPropagation()
    discardCard(event.dataTransfer.getData('text/plain'))
    setIsDiscardDropActive(false)
    setIsTableDropActive(false)
    setDropTargetStackIndex(null)
    setDropTargetStackInsertIndex(null)
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

  const reorderHand = (draggedId, targetId, insertAfter) => {
    if (draggedId === targetId) return

    setGame((current) => {
      if (!current) return current
      const active = current.players.find((player) => player.id === playerId)
      if (!active) return current

      const hand = [...active.hand]
      const draggedIndex = hand.findIndex((card) => card.id === draggedId)
      if (draggedIndex === -1) return current
      const [draggedCard] = hand.splice(draggedIndex, 1)
      const targetIndex = hand.findIndex((card) => card.id === targetId)
      if (targetIndex === -1) return current
      hand.splice(targetIndex + (insertAfter ? 1 : 0), 0, draggedCard)

      return {
        ...current,
        players: current.players.map((player) =>
          player.id === playerId ? { ...player, hand } : player,
        ),
      }
    })
  }

  const startSinglePlayer = (countOverride = singlePlayerCount) => {
    clearMultiplayerSession()
    const seatedGame = createGameState(countOverride, singlePlayerJokerMode, {
      room: 'SOLO-001',
      playerId,
      isSinglePlayer: true,
    })
    setGame(seatedGame)
    setToast('')
    setIsJokerPeekOpen(false)
    setSelectedCardIds([])
    setSelectedStackIndex(null)
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
        let nextDiscard = [...current.discard]
        const nextStacks = [...current.stacks]

        if (current.phase === 'draw') {
          const jokerKnown = canSeeJoker(current.jokerMode, active.id, current.jokerSeenBy ?? [])
          const stackMove = findAiStackMove(active.hand, current.stacks, active.id, jokerKnown)
          if (stackMove) {
            const remainingHand = active.hand.filter((card) =>
              !stackMove.cards.some((stackCard) => stackCard.id === card.id),
            )
            nextPlayers[current.activeIndex] = { ...active, hand: remainingHand }
            if (stackMove.stackIndex >= 0) {
              nextStacks[stackMove.stackIndex] = {
                ...nextStacks[stackMove.stackIndex],
                cards: addCardsToStack(nextStacks[stackMove.stackIndex].cards, stackMove.cards, stackMove.side),
              }
            } else {
              nextStacks.push({ ownerId: active.id, cards: orderStackCards(stackMove.cards) })
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

          let picked = nextDeck.pop()
          let reshuffleVersion = current.reshuffleVersion ?? 0
          if (!picked && nextDiscard.length > 0) {
            const recycled = reshuffleDiscardIntoDeck([], nextDiscard)
            nextDiscard = recycled.discard
            picked = recycled.deck.pop()
            nextDeck.splice(0, nextDeck.length, ...recycled.deck)
            reshuffleVersion += 1
            setReshuffleAnimation(true)
          }
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
            reshuffleVersion,
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
  const canPeekJoker = Boolean(jokerIsVisible && game?.jokerReference && game.deck.length > 0)
  const startJokerPeek = (event) => {
    suppressDeckClickRef.current = false
    if (!canPeekJoker || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    jokerPeekGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      revealed: false,
    }
  }
  const moveJokerPeek = (event) => {
    const gesture = jokerPeekGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.revealed) return
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 10) return
    gesture.revealed = true
    suppressDeckClickRef.current = true
    setIsJokerPeekOpen(true)
  }
  const endJokerPeek = (event) => {
    if (jokerPeekGestureRef.current?.pointerId !== event.pointerId) return
    jokerPeekGestureRef.current = null
    setIsJokerPeekOpen(false)
  }
  const cancelJokerPeek = (event) => {
    if (jokerPeekGestureRef.current?.pointerId !== event.pointerId) return
    jokerPeekGestureRef.current = null
    suppressDeckClickRef.current = false
    setIsJokerPeekOpen(false)
  }
  const selectedCards = currentHand.filter((card) => selectedCardIds.includes(card.id))
  const hasPlayedStack = hasPlayerPlayedStack(game?.stacks, myPlayer?.id)
  const selectedStack = Number.isInteger(selectedStackIndex) ? game?.stacks[selectedStackIndex] : null
  const selectedStackInsertionIndexes = hasPlayedStack && selectedStack
    ? Array.from({ length: selectedStack.cards.length + 1 }, (_, index) => index)
      .filter((index) => canInsertCardsAtIndex(selectedStack.cards, selectedCards, index))
    : []
  const selectedCardsExtendStack = selectedStackInsertionIndexes.length > 0

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
              saveMultiplayerSession({ playerId, playerName: normalizedPlayerName, roomCode: normalized })
              setRoomCodeInput(normalized)
              if (normalized === roomCode && joinedRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
                sendRoomControl('set_player_name', { name: normalizedPlayerName })
              }
              setRoomCode(normalized)
              const nextGame = createGameState(2, jokerMode, { playerId, playerName: normalizedPlayerName })
              nextGame.room = normalized
              setGame(nextGame)
              setIsJokerPeekOpen(false)
              setSelectedCardIds([])
              setSelectedStackIndex(null)
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
            <button className="game-brand" onClick={leaveMultiplayerRoom} aria-label="Back to home">F</button>
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
            {!game.isSinglePlayer && (
              <div className={`connection connection-compact ${isConnected ? 'is-online' : ''}`}>
                <span className={`status-dot ${isConnected ? 'live' : ''}`} />
                <span>{connectionLabel}</span>
                {!isConnected && <button className="connection-retry" onClick={() => retryNowRef.current?.()} aria-label="Retry connection"><RefreshCw size={14} /></button>}
              </div>
            )}
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

            <div
              className={`felt-table${game.stacks.length ? ' has-stacks' : ''}${isTableDropActive ? ' drop-active' : ''}`}
              onDragOver={(event) => {
                if (event.target.closest('.table-stack')) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setIsTableDropActive(true)
                setIsDiscardDropActive(false)
                setDropTargetStackIndex(null)
                setDropTargetStackInsertIndex(null)
              }}
              onDrop={handleTableDrop}
            >
              <div className="felt-glow" />
              {isTableDropActive && <span className="table-drop-hint" aria-live="polite">Drop to play a stack</span>}
              <div className={`turn-badge ${isMyTurn ? 'my-turn' : ''}`} aria-live="polite">
                <span className="turn-pulse" />
                {game.winner ? `${game.winner} wins!` : isMyTurn ? (game.phase === 'draw' ? 'Your turn · draw or play a stack' : 'Your turn · discard a card') : `${activePlayer?.name ?? 'Player'} is playing`}
              </div>

              <div className="table-piles">
                <div className="pile-group">
                  <button
                    className={`deck-stack ${canDrawThisTurn ? 'draw-ready' : ''} ${canPeekJoker ? 'joker-peekable' : ''} ${isJokerPeekOpen && canPeekJoker ? 'is-peeking' : ''} ${reshuffleAnimation ? 'deck-reshuffling' : ''}`}
                    onClick={() => {
                      if (suppressDeckClickRef.current) {
                        suppressDeckClickRef.current = false
                        return
                      }
                      drawFromDeck()
                    }}
                    onPointerDown={startJokerPeek}
                    onPointerMove={moveJokerPeek}
                    onPointerUp={endJokerPeek}
                    onPointerCancel={cancelJokerPeek}
                    onKeyDown={(event) => {
                      if (canPeekJoker && event.key.toLowerCase() === 'p' && !event.repeat) {
                        event.preventDefault()
                        suppressDeckClickRef.current = false
                        setIsJokerPeekOpen(true)
                      }
                    }}
                    onKeyUp={(event) => {
                      if (event.key.toLowerCase() === 'p') setIsJokerPeekOpen(false)
                    }}
                    onBlur={() => setIsJokerPeekOpen(false)}
                    aria-label={`${isJokerPeekOpen ? 'Showing the revealed card. ' : ''}Draw from deck, ${game.deck.length} cards${canPeekJoker ? '. Press and drag in any direction to flip the deck and reveal the bottom card.' : ''}`}
                    aria-pressed={canPeekJoker ? isJokerPeekOpen : undefined}
                    aria-keyshortcuts={canPeekJoker ? 'P' : undefined}
                    title={canPeekJoker ? 'Press and drag in any direction to flip the deck and reveal the bottom card' : undefined}
                    disabled={!canDrawThisTurn && !canPeekJoker}
                  >
                    <span /><span /><span className="playing-card back-card"><Layers3 size={24} /></span>
                    {canPeekJoker && (
                      <span
                        className={`playing-card deck-peek-card ${game.jokerReference.color === 'red' ? 'red-card' : ''}`}
                        role="img"
                        aria-label={`${game.jokerReference.rank} of ${game.jokerReference.suit}`}
                        aria-hidden={!isJokerPeekOpen}
                      >
                        <CardArtwork card={game.jokerReference} />
                      </span>
                    )}
                  </button>
                  <span className="pile-count">{game.deck.length} in deck</span>
                </div>
                <div className="pile-divider" />
                <div
                  className={`discard-drop-zone${isDiscardDropActive ? ' drop-active' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    event.dataTransfer.dropEffect = 'move'
                    setIsDiscardDropActive(true)
                    setIsTableDropActive(false)
                    setDropTargetStackIndex(null)
                    setDropTargetStackInsertIndex(null)
                  }}
                  onDrop={handleDiscardDrop}
                >
                  <button
                    className={`discard-pile ${canDrawThisTurn ? 'draw-ready' : ''} ${reshuffleAnimation ? 'discard-reshuffling' : ''}`}
                    onClick={drawFromDiscard}
                    aria-label="Draw from discard pile"
                    disabled={!canDrawThisTurn || game.discard.length === 0}
                  >
                    {game.discard.length > 1 && (
                      <span className="discard-pile-layers" aria-hidden="true">
                        {game.discard.slice(1, 5).reverse().map((card) => (
                          <span
                            key={card.id}
                            className={`playing-card discard-card discard-stack-card ${card.color === 'red' ? 'red-card' : ''}`}
                            style={{ transform: getDiscardCardTransform(card.id) }}
                          >
                            <CardArtwork card={card} />
                          </span>
                        ))}
                      </span>
                    )}
                    {game.discard[0] ? (
                      <span
                        key={game.discard[0].id}
                        className={`playing-card discard-card ${game.discard[0].color === 'red' ? 'red-card' : ''} ${discardAnimation?.cardId === game.discard[0].id ? `discard-throwing from-${discardAnimation.seat}` : ''}`}
                      >
                        <CardArtwork card={game.discard[0]} />
                      </span>
                    ) : <span className="empty-discard-card">Empty</span>}
                    {game.discard.length === 0 && <span className="pile-count">Empty discard</span>}
                  </button>
                  {isDiscardDropActive && <span className="discard-drop-hint" aria-live="polite">Drop to discard</span>}
                </div>
              </div>

              {game.stacks.length > 0 && (
                <div
                  className="table-stacks"
                  ref={tableStacksRef}
                  role="region"
                  aria-label="Played stacks. Scroll to see all stacks."
                  tabIndex={0}
                >
                  {game.stacks.map((stack, stackIndex) => {
                    const owner = game.players.find((player) => player.id === stack.ownerId)
                    const ownerName = owner?.id === playerId ? 'You' : owner?.name ?? 'Unknown player'
                    const validInsertionIndexes = hasPlayedStack
                      ? Array.from({ length: stack.cards.length + 1 }, (_, index) => index)
                        .filter((index) => canInsertCardsAtIndex(stack.cards, selectedCards, index))
                      : []
                    const canSelectStack = validInsertionIndexes.length > 0
                    const isSelectedStack = selectedStackIndex === stackIndex

                    return (
                      <div
                        className={`table-stack${isSelectedStack ? ' expanded' : ''}${dropTargetStackIndex === stackIndex ? ' drop-target' : ''}`}
                        role="group"
                        key={`${stack.ownerId ?? 'stack'}-${stackIndex}`}
                        data-stack-index={stackIndex}
                        aria-label={`Stack played by ${ownerName}`}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          event.dataTransfer.dropEffect = 'move'
                          setIsTableDropActive(false)
                          setIsDiscardDropActive(false)
                          const candidateIds = getDroppedCardIds(event)
                          const candidateCards = currentHand.filter((card) => candidateIds.includes(card.id))
                          const insertIndex = getStackInsertionIndex(event.currentTarget, event.clientX)
                          if (
                            hasPlayedStack
                            && (!candidateCards.length || canInsertCardsAtIndex(stack.cards, candidateCards, insertIndex))
                          ) {
                            setDropTargetStackIndex(stackIndex)
                            setDropTargetStackInsertIndex(insertIndex)
                          } else {
                            setDropTargetStackIndex(null)
                            setDropTargetStackInsertIndex(null)
                          }
                        }}
                        onDrop={(event) => handleStackDrop(event, stackIndex)}
                      >
                        <button
                          className="table-stack-target"
                          type="button"
                          aria-label={`Choose ${ownerName}'s stack`}
                          aria-pressed={isSelectedStack}
                          aria-expanded={isSelectedStack}
                          onClick={() => {
                            if (isSelectedStack) {
                              setSelectedStackIndex(null)
                            } else {
                              setSelectedStackIndex(stackIndex)
                            }
                          }}
                        >
                          <span className="table-stack-player">
                            <span className={`stack-player-marker avatar-${owner?.color ?? 'mint'}`}>{owner?.initials ?? '?'}</span>
                            <span className="stack-player-name">{ownerName}</span>
                            <span className="stack-target-label">{isSelectedStack ? 'OPEN' : 'TAP TO OPEN'}</span>
                          </span>
                          <span className={`table-stack-cards${dropTargetStackIndex === stackIndex ? ' is-inserting' : ''}${dropTargetStackIndex === stackIndex && dropTargetStackInsertIndex === stack.cards.length ? ' drop-at-end' : ''}`}>
                            {stack.cards.map((card, cardIndex) => {
                              const fanPosition = stack.cards.length > 1
                                ? (cardIndex / (stack.cards.length - 1)) * 2 - 1
                                : 0
                              return (
                                <span
                                  className={`table-stack-card ${card.color === 'red' ? 'red-card' : ''}${dropTargetStackIndex === stackIndex && dropTargetStackInsertIndex === cardIndex ? ' insert-before' : ''}`}
                                  key={card.id}
                                  style={{
                                    '--stack-card-index': cardIndex,
                                    '--stack-card-rotation': `${fanPosition * 11}deg`,
                                    '--stack-card-lift': `${-9 * (1 - fanPosition ** 2)}px`,
                                  }}
                                >
                                  <CardArtwork card={card} />
                                </span>
                              )
                            })}
                            {dropTargetStackIndex === stackIndex && dropTargetStackInsertIndex === stack.cards.length && (
                              <span className="table-stack-end-slot" aria-hidden="true" />
                            )}
                          </span>
                        </button>
                        {canSelectStack && !isSelectedStack && (
                          <span className="stack-choice-hint">Drag cards here to extend</span>
                        )}
                        {isSelectedStack && selectedCards.length > 0 && !selectedStackInsertionIndexes.length && (
                          <span className="stack-choice-hint">Selected cards do not fit this stack</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {game.stacks.length > 2 && (
                <span className="stack-scroll-hint mobile-scroll-hint" aria-hidden="true">SWIPE TO SEE ALL STACKS</span>
              )}
              {game.stacks.length > 4 && (
                <span className="stack-scroll-hint desktop-scroll-hint" aria-hidden="true">SCROLL TO SEE ALL STACKS</span>
              )}
              <div className="felt-ornament" aria-hidden="true">F</div>
            </div>

            <section className="player-hand" aria-label="Your hand">
              <div className="hand-heading">
                <div className="you-label"><span className={`avatar avatar-${myPlayer?.color ?? 'mint'}`}>{myPlayer?.initials ?? 'YOU'}</span><b>Your hand</b><span className="hand-count">{currentHand.length}</span></div>
                {shouldRunTurnTimer && (
                  <HandTurnTimer onExpire={autoDiscardTimedOutTurn} />
                )}
                <button className="sort-button" onClick={sortHand}>Sort</button>
              </div>
              <div
                className={`hand-scroll ${draggedCardId ? 'is-reordering' : ''} ${dropSlotIndex === 0 ? 'drop-at-start' : ''} ${dropSlotIndex === currentHand.length ? 'drop-at-end' : ''}`}
                ref={handScrollRef}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setIsTableDropActive(false)
                  setIsDiscardDropActive(false)
                  setDropTargetStackIndex(null)
                  setDropTargetStackInsertIndex(null)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const draggedId = event.dataTransfer.getData('text/plain')
                  if (!draggedId || dropSlotIndex === null || currentHand.length === 0) return
                  const slotIndex = Math.min(dropSlotIndex, currentHand.length)
                  const targetIndex = Math.min(slotIndex, currentHand.length - 1)
                  reorderHand(draggedId, currentHand[targetIndex].id, slotIndex === currentHand.length)
                  setDropSlotIndex(null)
                }}
              >
                {currentHand.map((card, index) => {
                  const fanPosition = currentHand.length > 1
                    ? (index / (currentHand.length - 1)) * 2 - 1
                    : 0

                  return (
                    <button
                      key={card.id}
                      className={`hand-card ${card.color === 'red' ? 'red-card' : ''} ${selectedCardIds.includes(card.id) ? 'selected' : ''} ${draggedCardId === card.id ? 'dragging' : ''} ${dropSlotIndex === index ? 'drop-slot' : ''}`}
                      style={{
                        '--card-index': index,
                        '--fan-rotation': `${fanPosition * 14}deg`,
                        '--fan-lift': `${-12 * (1 - fanPosition ** 2)}px`,
                        '--deal-delay': `${(index * game.players.length + Math.max(0, game.players.findIndex((dealPlayer) => dealPlayer.id === playerId))) * DEAL_CARD_INTERVAL_MS}ms`,
                      }}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', card.id)
                        setDraggedCardId(card.id)
                        setDropSlotIndex(null)
                        setIsTableDropActive(false)
                        setIsDiscardDropActive(false)
                        setDropTargetStackIndex(null)
                        setDropTargetStackInsertIndex(null)
                      }}
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        const bounds = event.currentTarget.getBoundingClientRect()
                        const insertAfter = event.clientX > bounds.left + bounds.width / 2
                        const targetIndex = currentHand.findIndex((handCard) => handCard.id === card.id)
                        const slotIndex = targetIndex + (insertAfter ? 1 : 0)
                        setDropSlotIndex((current) => current === slotIndex ? current : slotIndex)
                      }}
                      onDragEnd={() => {
                        setDraggedCardId(null)
                        setDropSlotIndex(null)
                        setIsTableDropActive(false)
                        setIsDiscardDropActive(false)
                        setDropTargetStackIndex(null)
                        setDropTargetStackInsertIndex(null)
                      }}
                      onClick={() => toggleCardSelection(card.id)}
                      aria-pressed={selectedCardIds.includes(card.id)}
                      aria-label={`${card.rank} of ${card.suit}`}
                      type="button"
                    >
                      <CardArtwork card={card} />
                    </button>
                  )
                })}
              </div>
              <div className="action-dock">
                {game.phase === 'draw' ? (
                  <>
                    <button className="action-button secondary-action" onClick={drawFromDiscard} disabled={!canDrawThisTurn || game.discard.length === 0}>Take discard</button>
                    <button className="action-button primary-action" onClick={drawFromDeck} disabled={!canDrawThisTurn}><Layers3 size={17} /> Draw card</button>
                    <button className="action-button secondary-action" onClick={() => playSelectedStack()} disabled={!canPlayStack || (selectedCardIds.length < 3 && !selectedCardsExtendStack)}>Play stack <span>{selectedCardIds.length || ''}</span></button>
                  </>
                ) : (
                  <>
                    <button className="action-button secondary-action" onClick={() => {
                      setSelectedCardIds([])
                      setSelectedStackIndex(null)
                    }} disabled={selectedCardIds.length === 0 && selectedStackIndex === null}>Clear</button>
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
            <button className="game-brand" onClick={leaveMultiplayerRoom} aria-label="Back to home">F</button>
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

              <button className="primary-button full winner-action" onClick={leaveMultiplayerRoom}>
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
