import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, Bell, Check, ChevronDown, CircleHelp, Copy, Crown, Eye, Layers3, MoreHorizontal, Play, Plus, RefreshCw, Send, Settings, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react'
import './App.css'

const initialCards = [
  { id: 'c1', rank: '7', suit: '♠', color: 'black' }, { id: 'c2', rank: '8', suit: '♠', color: 'black' },
  { id: 'c3', rank: '9', suit: '♠', color: 'black' }, { id: 'c4', rank: 'J', suit: '♥', color: 'red' },
  { id: 'c5', rank: 'Q', suit: '♥', color: 'red' }, { id: 'c6', rank: '3', suit: '♣', color: 'black' },
  { id: 'c7', rank: '3', suit: '♦', color: 'red' }, { id: 'c8', rank: '★', suit: 'JOKER', color: 'joker' },
]
const players = [
  { name: 'You', initials: 'AL', score: 1240, color: 'mint' }, { name: 'Maya Chen', initials: 'MC', score: 980, color: 'violet' },
  { name: 'Theo Grant', initials: 'TG', score: 820, color: 'amber' }, { name: 'Nora Singh', initials: 'NS', score: 640, color: 'rose' },
]

function App() {
  const [view, setView] = useState('table')
  const [cards, setCards] = useState(initialCards)
  const [selected, setSelected] = useState([])
  const [toast, setToast] = useState('')
  const [connected, setConnected] = useState(false)
  const [playerCount, setPlayerCount] = useState(1)
  const [activePlayerId, setActivePlayerId] = useState(null)
  const [scores, setScores] = useState({})
  const [phase, setPhase] = useState('draw')
  const socketRef = useRef(null)
  const [playerId] = useState(() => `alex-${crypto.randomUUID()}`)
  const [room] = useState(() => new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || 'NOVA-4821')
  useEffect(() => {
    let disposed = false
    let retryTimer
    const connect = () => {
      if (disposed) return
      const socket = new WebSocket(import.meta.env.VITE_WS_URL || 'ws://localhost:3001')
      socketRef.current = socket
      socket.addEventListener('open', () => {
        setConnected(true)
        socket.send(JSON.stringify({ type: 'join', roomId: room, playerId }))
      })
      socket.addEventListener('message', (event) => {
        let message
        try { message = JSON.parse(event.data) } catch { setToast('Received an invalid table update'); return }
        if (message.type === 'room_state') {
          setPlayerCount(message.playerCount)
          setActivePlayerId(message.activePlayerId)
          setScores(message.scores || {})
          setPhase(message.phase || 'draw')
        }
        if (message.type === 'game_action') {
          setActivePlayerId(message.activePlayerId)
          setScores(message.scores || {})
          setPhase(message.phase || 'draw')
        }
        if (message.type === 'error') setToast(message.message)
      })
      socket.addEventListener('close', () => {
        setConnected(false)
        if (!disposed) retryTimer = setTimeout(connect, 2500)
      })
      socket.addEventListener('error', () => setConnected(false))
    }
    connect()
    return () => { disposed = true; clearTimeout(retryTimer); socketRef.current?.close() }
  }, [playerId, room])
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer) }, [toast])
  const selectedCards = useMemo(() => cards.filter((card) => selected.includes(card.id)), [cards, selected])
  const toggleCard = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const isMyTurn = !activePlayerId || activePlayerId === playerId
  const sendAction = (type, payload = {}) => {
    if (!isMyTurn) { setToast('Wait for your turn'); return false }
    if (socketRef.current?.readyState !== WebSocket.OPEN) { setToast('Reconnecting to the table'); return false }
    socketRef.current.send(JSON.stringify({ type, payload }))
    return true
  }
  const drawCard = () => { if (!sendAction('draw')) return; setToast('Card drawn from the deck'); setCards((current) => [...current, { id: `new-${Date.now()}`, rank: 'A', suit: '♦', color: 'red' }]) }
  const playCards = () => {
    if (selected.length < 3) { setToast('Select at least 3 cards to play a stack'); return }
    if (!sendAction('play_stack', { cardIds: selected })) return
    setCards((current) => current.filter((card) => !selected.includes(card.id))); setSelected([]); setToast('Stack played. Your turn is complete.')
  }
  const copyRoom = () => { navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`); setToast('Invite link copied to clipboard') }
  return <main className="app-shell" data-players={playerCount} data-score={scores[playerId] || 0} data-phase={phase}><style>{`.hand-card.selected{animation:card-flip .42s ease-out both}@keyframes card-flip{0%{transform:perspective(500px) rotateY(0) translateY(0)}45%{transform:perspective(500px) rotateY(90deg) translateY(-7px)}100%{transform:perspective(500px) rotateY(0) translateY(-7px)}}`}</style>
    <header className="topbar"><div className="brand-mark"><span>F</span></div><div className="brand-copy"><strong>FISS</strong><small>PLAY TOGETHER</small></div><div className="topbar-divider" /><div className="workspace-name">Workspace / <b>Friday night table</b><ChevronDown size={14} /></div><div className="topbar-actions"><div className="connection"><span className={connected ? 'status-dot live' : 'status-dot'} /> {connected ? 'Live sync' : 'Demo mode'}</div><button className="icon-button" aria-label="Notifications"><Bell size={18} /><i /></button><button className="avatar avatar-small">AL</button></div></header>
    <div className="app-body"><aside className="sidebar"><div className="side-label">GAME CONTROL</div><nav><button className={view === 'table' ? 'nav-item selected' : 'nav-item'} onClick={() => setView('table')}><Layers3 size={17} /> Game table <span className="nav-count">4</span></button><button className={view === 'lobby' ? 'nav-item selected' : 'nav-item'} onClick={() => setView('lobby')}><Users size={17} /> Room lobby</button><button className="nav-item" onClick={() => setToast('Score history is coming next round')}><Sparkles size={17} /> Score history</button></nav><div className="side-label side-label-spaced">TABLE TOOLS</div><nav><button className="nav-item"><ShieldCheck size={17} /> Game rules</button><button className="nav-item"><Settings size={17} /> Settings</button></nav><div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={15} /><span><b>Private room</b><small>Only invited players</small></span></div><button className="profile-row"><span className="avatar avatar-mint">AL</span><span><b>Alex Lee</b><small>Table host</small></span><MoreHorizontal size={17} /></button></div></aside><section className="workspace">{view === 'lobby' ? <Lobby room={room} setView={setView} copyRoom={copyRoom} /> : <GameTable cards={cards} selected={selected} toggleCard={toggleCard} drawCard={drawCard} playCards={playCards} selectedCards={selectedCards} />}</section></div>
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </main>
}

function Lobby({ room, setView, copyRoom }) {
  return <div className="lobby-view"><div className="page-heading"><div><span className="eyebrow">ROOM LOBBY</span><h1>Friday night table</h1><p>Set up your table, invite your crew, and deal when everyone is ready.</p></div><button className="button button-dark" onClick={() => setView('table')}><Play size={16} fill="currentColor" /> Open table</button></div><div className="lobby-grid"><section className="panel room-panel"><div className="panel-heading"><div><span className="eyebrow">INVITE PLAYERS</span><h2>Share this room</h2></div><div className="live-pill"><span className="status-dot live" /> PRIVATE</div></div><div className="room-code"><span>{room}</span><button onClick={copyRoom} aria-label="Copy room code"><Copy size={17} /></button></div><p className="helper">Anyone with this code can join your table. The game is capped at 4 players.</p><div className="invite-field"><input placeholder="friend@company.com" /><button className="button button-dark"><Send size={15} /> Invite</button></div></section><section className="panel players-panel"><div className="panel-heading"><div><span className="eyebrow">PLAYERS</span><h2>Ready check</h2></div><span className="player-count">4 / 4</span></div>{players.map((player) => <div className="lobby-player" key={player.name}><span className={`avatar avatar-${player.color}`}>{player.initials}</span><span><b>{player.name}</b><small>{player.name === 'You' ? 'Host' : 'Ready to play'}</small></span>{player.name === 'You' ? <Crown size={16} className="host-icon" /> : <span className="ready-label"><Check size={14} /> Ready</span>}</div>)}<button className="button button-accent full-button" onClick={() => setView('table')}><Zap size={16} fill="currentColor" /> Start game</button></section></div></div>
}

function GameTable({ cards, selected, toggleCard, drawCard, playCards, selectedCards }) {
  return <div className="table-view"><div className="page-heading table-heading"><div><span className="eyebrow">LIVE TABLE <span className="heading-dot" /> ROUND 03</span><h1>Friday night table</h1><p>Make your move, Alex. You are playing clockwise.</p></div><div className="heading-tools"><button className="button button-outline"><CircleHelp size={16} /> Rules</button><button className="button button-outline"><MoreHorizontal size={17} /></button></div></div><div className="score-strip">{players.map((player, index) => <div className={`score-player ${index === 0 ? 'is-you' : ''}`} key={player.name}><span className={`avatar avatar-${player.color}`}>{player.initials}</span><div><b>{player.name}</b><small>{player.score.toLocaleString()} pts</small></div>{index === 1 && <span className="turn-chip">NEXT</span>}</div>)}<div className="score-meta"><span><Eye size={15} /> Joker <b>9♣</b></span><span><RefreshCw size={14} /> Round 3 of 5</span></div></div><div className="game-layout"><section className="game-board panel"><div className="board-topline"><span className="turn-indicator"><span className="status-dot live" /> Your turn</span><span className="turn-time">01:42 remaining</span></div><div className="table-surface"><div className="opponent opponent-top"><AvatarLabel player={players[1]} /><span className="opponent-cards">5 cards</span></div><div className="opponent opponent-left"><AvatarLabel player={players[2]} /><span className="opponent-cards">7 cards</span></div><div className="opponent opponent-right"><AvatarLabel player={players[3]} /><span className="opponent-cards">4 cards</span></div><div className="deck-zone"><button className="deck-stack" onClick={drawCard} aria-label="Draw from deck"><span /><span /><span className="playing-card back-card"><Layers3 size={23} /></span></button><small>DRAW DECK</small></div><div className="discard-zone"><div className="playing-card discard-card"><span className="card-rank">4</span><span className="card-suit red">♥</span></div><small>DISCARD PILE</small></div><div className="board-message"><span className="pulse-ring" /><b>Pick a card</b><small>Draw from the deck or discard pile</small></div></div><div className="board-footer"><span><Users size={14} /> 4 players connected</span><span>Last move: Maya played a 2-card run</span></div></section><aside className="side-panel"><section className="panel action-panel"><div className="action-header"><div><span className="eyebrow">YOUR HAND</span><h2>{cards.length} cards</h2></div><button className="sort-button"><ArrowDownToLine size={15} /> Sort</button></div><p className="action-hint">Select 3 or more cards to play a stack.</p><div className="hand-cards">{cards.map((card, index) => <button key={card.id} className={`playing-card hand-card ${card.color} ${selected.includes(card.id) ? 'selected' : ''}`} style={{ '--card-index': index }} onClick={() => toggleCard(card.id)}><span className="card-rank">{card.rank}</span><span className="card-suit">{card.suit}</span>{selected.includes(card.id) && <span className="selected-check"><Check size={11} /></span>}</button>)}</div><div className="action-buttons"><button className="button button-outline" onClick={drawCard}><Plus size={16} /> Draw card</button><button className="button button-accent" onClick={playCards} disabled={selectedCards.length === 0}><Play size={15} fill="currentColor" /> Play stack {selectedCards.length > 0 && `(${selectedCards.length})`}</button></div></section><section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">ACTIVITY</span><h2>Table log</h2></div><button className="icon-button"><MoreHorizontal size={17} /></button></div><div className="activity-item"><span className="activity-icon violet"><Layers3 size={15} /></span><p><b>Maya Chen</b> played a run<small>Just now</small></p></div><div className="activity-item"><span className="activity-icon amber"><ArrowDownToLine size={15} /></span><p><b>Theo Grant</b> drew from deck<small>1 min ago</small></p></div><div className="activity-item"><span className="activity-icon mint"><Check size={15} /></span><p><b>Nora Singh</b> joined the room<small>2 min ago</small></p></div></section></aside></div></div>
}

function AvatarLabel({ player }) { return <div className="avatar-label"><span className={`avatar avatar-${player.color}`}>{player.initials}</span><b>{player.name}</b></div> }

export default App
