import './style.css';

// Constantes
const ROWS = 8;
const COLS = 8;
const WHITE = 1;
const BLACK = 2;
const GAME_PLAYING = 'JUGANDO';
const GAME_MATE = 'JAQUE_MATE';
const GAME_DRAW = 'TABLAS';

// Tipos de piezas y mapeo a sprites
const PIECE_TYPES = {
  P: { w: 'pixel_wP.svg', b: 'pixel_bP.svg' },
  R: { w: 'pixel_wR.svg', b: 'pixel_bR.svg' },
  N: { w: 'pixel_wN.svg', b: 'pixel_bN.svg' },
  B: { w: 'pixel_wB.svg', b: 'pixel_bB.svg' },
  Q: { w: 'pixel_wQ.svg', b: 'pixel_bQ.svg' },
  K: { w: 'pixel_wK.svg', b: 'pixel_bK.svg' }
};

// Sonidos
const moveSound = new Audio('./assets/move.ogg');
const captureSound = new Audio('./assets/capture.ogg');

// Estado Global
let state = {
  board: [],
  turn: WHITE,
  status: GAME_PLAYING,
  selected: null, // {r, c}
  validMoves: [],
  lastMove: null,
  layout: 'classic',
  tutorialPhase: 0,
  tutorialMoves: 0,
  aiDifficulty: null
};

const TUTORIAL_PHASES = [
    {
        title: "♟️ Fase 1: Peón",
        desc: "El peón avanza 1 casilla (o 2 en su primer movimiento). Captura atacando en diagonal.",
        goal: "Mueve el peón blanco hacia adelante.",
        setup: () => { const b = Array(8).fill(null).map(() => Array(8).fill(null)); b[6][4] = { type: 'P', color: WHITE, moved: false }; return b; },
        check: (s) => !s.board[6][4]
    },
    {
        title: "♜ Fase 2: Torre",
        desc: "La torre se desplaza sobre líneas rectas en horizontal o vertical sin límite de distancia.",
        goal: "Mueve la torre a otra casilla libre.",
        setup: () => { const b = Array(8).fill(null).map(() => Array(8).fill(null)); b[4][4] = { type: 'R', color: WHITE, moved: true }; return b; },
        check: (s) => !s.board[4][4]
    },
    {
        title: "♞ Fase 3: Caballo",
        desc: "El caballo salta en forma de 'L' cruzando casillas y puede saltar sobre otras piezas.",
        goal: "Haz un salto válido con el caballo.",
        setup: () => { const b = Array(8).fill(null).map(() => Array(8).fill(null)); b[4][4] = { type: 'N', color: WHITE, moved: true }; return b; },
        check: (s) => !s.board[4][4]
    },
    {
        title: "♝ Fase 4: Alfil",
        desc: "El alfil viaja por las diagonales sin límite de distancia. Solo se mueve en un color de casillas.",
        goal: "Mueve el alfil a cualquier casilla válida.",
        setup: () => { const b = Array(8).fill(null).map(() => Array(8).fill(null)); b[4][4] = { type: 'B', color: WHITE, moved: true }; return b; },
        check: (s) => !s.board[4][4]
    },
    {
        title: "♛ Fase 5: Reina y Rey",
        desc: "La Reina combina el poder de Torre y Alfil. El Rey hace lo mismo, pero solo da 1 paso a la vez.",
        goal: "Mueve a la Reina Y al Rey al menos una vez cada uno.",
        setup: () => { const b = Array(8).fill(null).map(() => Array(8).fill(null)); b[4][3] = { type: 'Q', color: WHITE, moved: false }; b[7][4] = { type: 'K', color: WHITE, moved: false }; return b; },
        check: (s) => {
             let q = false; let k = false;
             for(let r=0; r<8; r++) for(let c=0; c<8; c++) {
                 let p = s.board[r][c];
                 if(p && p.type==='Q' && p.moved) q=true;
                 if(p && p.type==='K' && p.moved) k=true;
             }
             return q && k;
        }
    },
    {
        title: "🎯 Fase Final: Jaque Mate",
        desc: "Las negras están congeladas. Tienes 2 turnos continuos para acorralar al Rey enemigo sin darle escapatoria.",
        goal: "Da Jaque Mate al Rey negro usando tus dos torres. Pista: ¡Hazle un pasillo en la fila 8!",
        setup: () => { 
             const b = Array(8).fill(null).map(() => Array(8).fill(null)); 
             b[0][4] = { type: 'K', color: BLACK, moved: true }; // e8
             b[2][0] = { type: 'R', color: WHITE, moved: true }; // a6
             b[3][7] = { type: 'R', color: WHITE, moved: true }; // h5
             b[7][4] = { type: 'K', color: WHITE, moved: true }; // e1
             return b; 
        },
        check: (s) => isKingInCheck(s.board, BLACK) && !hasAnyValidMove(BLACK, true)
    }
];

function loadTutorialPhaseUI() {
    const phase = TUTORIAL_PHASES[state.tutorialPhase];
    state.board = phase.setup();
    state.tutorialMoves = 0;
    state.turn = WHITE;
    state.validMoves = [];
    state.selected = null;
    
    document.getElementById('tutorial-desc-title').innerText = phase.title;
    document.getElementById('tutorial-desc-text').innerText = phase.desc;
    document.getElementById('tutorial-goal').innerHTML = `<strong>Objetivo:</strong> ${phase.goal}`;
    
    updateTurnUI();
    renderBoard();
}

// Inicialización del Tablero
function initBoard(layoutType) {
  const b = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
  
  if (layoutType === 'classic') {
      // Pawns
      for(let c=0; c<8; c++) {
        b[6][c] = { type: 'P', color: WHITE, moved: false };
        b[1][c] = { type: 'P', color: BLACK, moved: false };
      }
      
      // Pieces
      const order = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
      for(let c=0; c<8; c++) {
        b[7][c] = { type: order[c], color: WHITE, moved: false };
        b[0][c] = { type: order[c], color: BLACK, moved: false };
      }
  }
  return b;
}

// Validación Abstracta
function es_movimiento_valido(b, orig_r, orig_c, dest_r, dest_c, color, moved, lm) {
  if (dest_r < 0 || dest_r > 7 || dest_c < 0 || dest_c > 7) return false;
  const target = b[dest_r][dest_c];
  if (target && target.color === color) return false;
  
  const piece = b[orig_r][orig_c].type;
  const dif_r = Math.abs(dest_r - orig_r);
  const dif_c = Math.abs(dest_c - orig_c);
  
  switch(piece) {
    case 'P':
      const dir = color === WHITE ? -1 : 1;
      // Avance simple
      if (dif_c === 0 && dest_r === orig_r + dir && !target) return true;
      // Avance doble
      if (dif_c === 0 && dest_r === orig_r + (dir * 2) && !moved && !target && !b[orig_r + dir][orig_c]) return true;
      // Captura normal
      if (dif_c === 1 && dest_r === orig_r + dir && target && target.color !== color) return true;
      // Captura al paso (En Passant)
      if (dif_c === 1 && dest_r === orig_r + dir && !target) {
          const _lm = (lm !== undefined) ? lm : state.lastMove;
          if (_lm && _lm.piece.type === 'P' && _lm.piece.color !== color) {
              if (_lm.to.r === orig_r && _lm.to.c === dest_c) {
                  if (Math.abs(_lm.from.r - _lm.to.r) === 2) {
                      return true;
                  }
              }
          }
      }
      break;
    case 'R':
      if (dif_c === 0 || dif_r === 0) {
        if (!isBlocked(b, orig_r, orig_c, dest_r, dest_c)) return true;
      }
      break;
    case 'B':
      if (dif_c === dif_r && dif_c > 0) {
        if (!isBlocked(b, orig_r, orig_c, dest_r, dest_c)) return true;
      }
      break;
    case 'Q':
      if (dif_c === 0 || dif_r === 0 || dif_c === dif_r) {
        if (!isBlocked(b, orig_r, orig_c, dest_r, dest_c)) return true;
      }
      break;
    case 'N':
      if ((dif_c === 2 && dif_r === 1) || (dif_c === 1 && dif_r === 2)) return true;
      break;
    case 'K':
      if (dif_c <= 1 && dif_r <= 1 && (dif_c + dif_r > 0)) return true;
      // Enroque simulado (lógica básica permitida si no ha movido y está vacío)
      if (dif_r === 0 && dif_c === 2 && !moved && !isKingInCheck(b, color)) {
        const dir_c = Math.sign(dest_c - orig_c);
        const rook_c = dir_c > 0 ? 7 : 0;
        const rook = b[orig_r][rook_c];
        if (rook && rook.type === 'R' && !rook.moved && !isBlocked(b, orig_r, orig_c, orig_r, rook_c)) {
          // Validar que la casilla intermedia no esté atacada
          const test_c = orig_c + dir_c;
          const b_copy = b.map(row => [...row]);
          b_copy[orig_r][test_c] = b_copy[orig_r][orig_c];
          b_copy[orig_r][orig_c] = null;
          if (!isKingInCheck(b_copy, color)) {
             return true;
          }
        }
      }
      break;
  }
  return false;
}

function isBlocked(b, r1, c1, r2, c2) {
  const dir_r = Math.sign(r2 - r1);
  const dir_c = Math.sign(c2 - c1);
  let cr = r1 + dir_r;
  let cc = c1 + dir_c;
  while (cr !== r2 || cc !== c2) {
    if (b[cr][cc]) return true;
    cr += dir_r;
    cc += dir_c;
  }
  return false;
}

function isKingInCheck(b, color) {
  let kr = -1, kc = -1;
  // Encontrar rey (con break correcto del doble bucle)
  outer: for (let r=0; r<8; r++) {
    for (let c=0; c<8; c++) {
        if (b[r][c] && b[r][c].type === 'K' && b[r][c].color === color) {
            kr = r; kc = c; break outer;
        }
    }
  }
  if (kr === -1) return false;

  // Ver si el enemigo puede atacarlo
  for (let r=0; r<8; r++) {
    for (let c=0; c<8; c++) {
        const p = b[r][c];
        if (p && p.color !== color) {
            if (es_movimiento_valido(b, r, c, kr, kc, p.color, p.moved)) return true;
        }
    }
  }
  return false;
}

function generateValidMoves(r, c, ignoreTurn = false) {
  const moves = [];
  const piece = state.board[r][c];
  if (!piece || (!ignoreTurn && piece.color !== state.turn)) return moves;

  for (let tr = 0; tr < 8; tr++) {
    for (let tc = 0; tc < 8; tc++) {
      if (tr === r && tc === c) continue;
      
      if (es_movimiento_valido(state.board, r, c, tr, tc, piece.color, piece.moved)) {
        // Simular para asegurar que no nos deja en jaque
        const b_copy = state.board.map(row => [...row]);
        b_copy[tr][tc] = b_copy[r][c];
        b_copy[r][c] = null;
        
        // Si es En passsant simulado, quitar peon
        if (piece.type === 'P' && Math.abs(tc - c) === 1 && !state.board[tr][tc]) {
            b_copy[r][tc] = null;
        }
        
        if (!isKingInCheck(b_copy, piece.color)) {
          moves.push({r: tr, c: tc});
        }
      }
    }
  }
  return moves;
}

function hasAnyValidMove(color, ignoreTurn = false) {
    for (let r=0; r<8; r++) {
        for (let c=0; c<8; c++) {
            if (state.board[r][c] && state.board[r][c].color === color) {
                if (generateValidMoves(r, c, ignoreTurn).length > 0) return true;
            }
        }
    }
    return false;
}

// UI y Renderizado
const boardEl = document.getElementById('chessboard');
const turnoEl = document.querySelector('#turno-indicador h2');
const modalEl = document.getElementById('game-over-modal');

function renderBoard() {
  boardEl.innerHTML = '';
  
  const check = isKingInCheck(state.board, state.turn);
  let kr = -1, kc = -1;
  if (check) {
    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        if (state.board[r][c] && state.board[r][c].type === 'K' && state.board[r][c].color === state.turn) {
          kr = r; kc = c;
        }
      }
    }
  }
  
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = `cell ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
      cell.dataset.r = r;
      cell.dataset.c = c;
      
      // King in Check state
      if (check && r === kr && c === kc) {
        cell.classList.add('king-in-check');
      }
      
      // Selected state
      if (state.selected && state.selected.r === r && state.selected.c === c) {
        cell.classList.add('selected');
      }
      
      // Valid move highlighting
      const isValid = state.validMoves.find(m => m.r === r && m.c === c);
      if (isValid) {
        cell.classList.add(state.board[r][c] ? 'valid-capture' : 'valid-move');
      }

      // Render Piece
      if (state.board[r][c]) {
        const p = state.board[r][c];
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece';
        const img = p.color === WHITE ? PIECE_TYPES[p.type].w : PIECE_TYPES[p.type].b;
        pieceEl.style.backgroundImage = `url('./assets/${img}?v=2')`;
        
        if (state.lastMove && state.lastMove.to.r === r && state.lastMove.to.c === c) {
            pieceEl.classList.add('dropped');
        }
        
        cell.appendChild(pieceEl);
      }
      
      cell.addEventListener('click', () => handleCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function updateTurnUI() {
  turnoEl.innerText = state.turn === WHITE ? 'Turno: Blancas' : 'Turno: Negras';
  turnoEl.style.color = state.turn === WHITE ? '#f8fafc' : '#94a3b8';
}

function gameOver(title, sub) {
    state.status = GAME_MATE;
    document.getElementById('game-over-title').innerText = title;
    document.getElementById('game-over-subtitle').innerText = sub;
    modalEl.classList.remove('hidden');
}

function checkGameState() {
    if (state.layout === 'tutorial') return;
    const check = isKingInCheck(state.board, state.turn);
    const moves = hasAnyValidMove(state.turn);
    if (!moves) {
        if (check) {
            if (state.layout === 'ai') {
                if (state.turn === BLACK) {
                    // Jugador hizo jaque mate a la IA!
                    markAICleared(state.aiDifficulty);
                    const idx = DIFF_ORDER.indexOf(state.aiDifficulty);
                    const hasNext = idx >= 0 && idx < DIFF_ORDER.length - 1;
                    const unlockMsg = hasNext
                        ? `¡Desbloqueaste: ${DIFF_NAMES[DIFF_ORDER[idx + 1]]}!`
                        : '¡Dominaste todas las dificultades!';
                    gameOver('¡GANASTE!', unlockMsg);
                } else {
                    // La IA hizo jaque mate al jugador
                    gameOver('¡JAQUE MATE!', 'La IA te venció. ¡Inténtalo de nuevo!');
                }
            } else {
                gameOver('¡JAQUE MATE!', state.turn === WHITE ? 'Ganan las Negras' : 'Ganan las Blancas');
            }
        } else {
            gameOver('TABLAS', '(Ahogado)');
        }
    }
}

// Interacción
function handleCellClick(r, c) {
  if (state.status !== GAME_PLAYING) return;
  if (state.layout === 'ai' && state.turn === BLACK) return; // La IA está pensando
  
  const piece = state.board[r][c];
  
  // Si tenemos una pieza seleccionada e intentamos moverla a una celda válida
  const isMove = state.validMoves.find(m => m.r === r && m.c === c);
  if (state.selected && isMove) {
    executeMove(state.selected.r, state.selected.c, r, c);
    return;
  }
  
  // Si clickeamos una de nuestras piezas
  if (piece && piece.color === state.turn) {
    if (state.selected && state.selected.r === r && state.selected.c === c) {
        // Deseleccionar
        state.selected = null;
        state.validMoves = [];
    } else {
        state.selected = {r, c};
        state.validMoves = generateValidMoves(r, c);
    }
    renderBoard();
  } else {
    // Clickeo en el vacío o enemigo sin ser movimiento válido
    state.selected = null;
    state.validMoves = [];
    renderBoard();
  }
}

function executeMove(fromR, fromC, toR, toC) {
    const piece = state.board[fromR][fromC];
    
    // Promoción de Peón
    if (piece.type === 'P' && (toR === 0 || toR === 7)) {
        showPromotionModal((selectedType) => {
            piece.type = selectedType;
            finalizeMove(fromR, fromC, toR, toC, piece);
        });
        return;
    }
    
    finalizeMove(fromR, fromC, toR, toC, piece);
}

function finalizeMove(fromR, fromC, toR, toC, piece) {
    // Enroque execution
    if (piece.type === 'K' && Math.abs(toC - fromC) === 2) {
        const dir_c = Math.sign(toC - fromC);
        const rook_c = dir_c > 0 ? 7 : 0;
        const rook_dest_c = toC - dir_c;
        const rook = state.board[fromR][rook_c];
        
        state.board[fromR][rook_dest_c] = rook;
        state.board[fromR][rook_c] = null;
        rook.moved = true;
    }
    
    let isCapture = false;
    if (state.board[toR][toC]) isCapture = true;

    // Captura al paso (En Passant) execution
    if (piece.type === 'P' && Math.abs(toC - fromC) === 1 && !state.board[toR][toC]) {
        state.board[fromR][toC] = null;
        isCapture = true;
    }
    
    if (isCapture) {
        captureSound.currentTime = 0;
        captureSound.play().catch(e => {});
    } else {
        moveSound.currentTime = 0;
        moveSound.play().catch(e => {});
    }
    
    // Almacenar el historial para permitir en passant próximo turno
    state.lastMove = {
        piece: { ...piece },
        from: { r: fromR, c: fromC },
        to: { r: toR, c: toC }
    };
    
    piece.moved = true;
    state.board[toR][toC] = piece;
    state.board[fromR][fromC] = null;
    
    // Fin de turno o validación tutorial
    state.selected = null;
    state.validMoves = [];
    
    if (state.layout === 'tutorial') {
        state.tutorialMoves = (state.tutorialMoves || 0) + 1;
        state.turn = WHITE; // Congela turno
        updateTurnUI();
        renderBoard();
        
        setTimeout(() => {
            const phase = TUTORIAL_PHASES[state.tutorialPhase];
            if (phase.check(state)) {
                if (state.tutorialPhase < TUTORIAL_PHASES.length - 1) {
                    const phaseModal = document.getElementById('phase-modal');
                    phaseModal.classList.remove('hidden');
                    setTimeout(() => {
                        phaseModal.classList.add('hidden');
                        state.tutorialPhase++;
                        loadTutorialPhaseUI();
                    }, 1500);
                } else {
                    gameOver("¡Tutorial Finalizado!", "¡Has dominado el Jaque Mate en 2 movimientos!");
                    document.getElementById('btn-restart').innerText = "VOLVER AL MENÚ";
                    document.getElementById('btn-restart').onclick = () => {
                        document.getElementById('btn-menu').click(); 
                        document.getElementById('btn-restart').innerText = "JUGAR DE NUEVO";
                        document.getElementById('btn-restart').onclick = () => startGame('classic');
                    };
                }
            } else if (state.tutorialPhase === TUTORIAL_PHASES.length - 1 && state.tutorialMoves >= 2) {
                // Mostrar modal de fallo y reiniciar la fase
                const phaseModal = document.getElementById('phase-modal');
                const phaseTitle = phaseModal.querySelector('h2');
                const originalText = phaseTitle.innerText;
                const originalColor = phaseTitle.style.color;
                phaseTitle.innerText = '¡Inténtalo de nuevo!';
                phaseTitle.style.color = '#f87171';
                phaseTitle.style.textShadow = '0 0 15px rgba(248, 113, 113, 0.5)';
                phaseModal.classList.remove('hidden');
                setTimeout(() => {
                    phaseModal.classList.add('hidden');
                    phaseTitle.innerText = originalText;
                    phaseTitle.style.color = originalColor;
                    phaseTitle.style.textShadow = '';
                    loadTutorialPhaseUI();
                }, 1800);
            }
        }, 50);
        return;
    }
    
    state.turn = state.turn === WHITE ? BLACK : WHITE;
    
    updateTurnUI();
    renderBoard();
    
    // Usar micro task para darle tiempo al DOM a renderizar la ficha
    setTimeout(() => {
        checkGameState();
        // En modo IA, disparar movimiento si el juego continúa y es turno de la IA
        if (state.layout === 'ai' && state.turn === BLACK && state.status === GAME_PLAYING) {
            triggerAIMove();
        }
    }, 50);
}

// Iniciar Partida
function startGame(layoutType = 'classic', aiDifficulty = null) {
    cancelAIMove();
    state = {
        board: initBoard(layoutType === 'ai' ? 'classic' : layoutType),
        turn: WHITE,
        status: GAME_PLAYING,
        selected: null,
        validMoves: [],
        lastMove: null,
        layout: layoutType,
        tutorialPhase: 0,
        tutorialMoves: 0,
        aiDifficulty: aiDifficulty
    };
    const sidebar = document.getElementById('tutorial-sidebar');
    const subtitleEl = document.getElementById('game-subtitle-header');
    modalEl.classList.add('hidden');
    if (layoutType === 'tutorial') {
        sidebar.classList.remove('d-none');
        subtitleEl.innerText = 'Táctica y Estrategia';
        loadTutorialPhaseUI();
    } else if (layoutType === 'ai') {
        sidebar.classList.add('d-none');
        subtitleEl.innerText = `VS IA · ${DIFF_NAMES[aiDifficulty]}`;
        updateTurnUI();
        renderBoard();
    } else {
        sidebar.classList.add('d-none');
        subtitleEl.innerText = 'Táctica y Estrategia';
        updateTurnUI();
        renderBoard();
    }
}

// Listeners Base
const mainMenuEl = document.getElementById('main-menu');
const gameContainerEl = document.getElementById('game-container');

document.getElementById('btn-play-classic').addEventListener('click', () => {
    mainMenuEl.classList.add('d-none');
    gameContainerEl.classList.remove('d-none');
    startGame('classic');
});

document.getElementById('btn-play-tutorial').addEventListener('click', () => {
    mainMenuEl.classList.add('d-none');
    gameContainerEl.classList.remove('d-none');
    startGame('tutorial');
});

document.getElementById('btn-exit-app').addEventListener('click', () => {
    // En web no se puede cerrar la pestaña, mostramos feedback visual temporal
    const btn = document.getElementById('btn-exit-app');
    const original = btn.innerText;
    btn.innerText = '¡Hasta pronto!';
    btn.disabled = true;
    setTimeout(() => {
        btn.innerText = original;
        btn.disabled = false;
    }, 1500);
});

document.getElementById('btn-restart').addEventListener('click', () => startGame(state.layout || 'classic', state.aiDifficulty));
document.getElementById('btn-salir').addEventListener('click', () => {
    cancelAIMove();
    gameContainerEl.classList.add('d-none');
    mainMenuEl.classList.remove('d-none');
    modalEl.classList.add('hidden');
});
document.getElementById('btn-menu').addEventListener('click', () => {
    cancelAIMove();
    gameContainerEl.classList.add('d-none');
    mainMenuEl.classList.remove('d-none');
});

// Promoción
const promotionModalEl = document.getElementById('promotion-modal');
let promotionCallback = null;

function showPromotionModal(cb) {
    promotionCallback = cb;
    promotionModalEl.classList.remove('hidden');
}

document.querySelectorAll('#promotion-options button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (promotionCallback) {
            promotionCallback(e.target.dataset.piece);
            promotionCallback = null;
        }
        promotionModalEl.classList.add('hidden');
    });
});

// Temas de Tablero
const THEMES = {
    'classic': 'Clásico',
    'celeste': 'Celeste',
    'madera': 'Madera'
};

function setTheme(theme) {
    document.body.classList.remove('theme-classic', 'theme-celeste', 'theme-madera');
    document.body.classList.add(`theme-${theme}`);
    document.getElementById('current-theme-name').innerText = THEMES[theme];
}

document.getElementById('btn-theme-classic').addEventListener('click', () => setTheme('classic'));
document.getElementById('btn-theme-celeste').addEventListener('click', () => setTheme('celeste'));
document.getElementById('btn-theme-madera').addEventListener('click', () => setTheme('madera'));

// --- Retro Audio Synthesizer ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type, dur, vol) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
}

document.addEventListener('mouseover', (e) => {
    if (e.target.closest('.btn') || e.target.closest('.cell')) {
        playTone(660, 'square', 0.05, 0.01);
    }
});

document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.btn') || e.target.closest('.cell')) {
        playTone(880, 'triangle', 0.1, 0.03);
    }
});

// Background Music
let bgMusicInterval;
let bgMusicPlaying = false;
const btnMusic = document.getElementById('btn-music');
const btnMusicMenu = document.getElementById('btn-music-menu');

function toggleMusic() {
    if (bgMusicPlaying) {
        clearInterval(bgMusicInterval);
        bgMusicPlaying = false;
        if(btnMusic) btnMusic.innerText = "🎵 OFF";
        if(btnMusicMenu) btnMusicMenu.innerText = "🎵 MÚSICA OFF";
        return;
    }
    bgMusicPlaying = true;
    if(btnMusic) btnMusic.innerText = "🎵 ON";
    if(btnMusicMenu) btnMusicMenu.innerText = "🎵 MÚSICA ON";
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const notes = [
        [261.63, 0.15], [329.63, 0.15], [392.00, 0.15], [523.25, 0.15],
        [392.00, 0.15], [329.63, 0.15], [261.63, 0.15], [196.00, 0.15]
    ];
    let idx = 0;
    
    bgMusicInterval = setInterval(() => {
        const n = notes[idx % notes.length];
        playTone(n[0], 'square', n[1], 0.02);
        if (idx % 4 === 0) playTone(130.81, 'triangle', 0.3, 0.04);
        idx++;
    }, 150);
}

if(btnMusic) btnMusic.addEventListener('click', toggleMusic);
if(btnMusicMenu) btnMusicMenu.addEventListener('click', toggleMusic);

// Boot no inicia startGame() porque mostramos el menú inicialmente.

// ==================== MOTOR IA ====================

const DIFF_NAMES  = { facil: 'FÁCIL', normal: 'NORMAL', dificil: 'DIFÍCIL' };
const DIFF_ORDER  = ['facil', 'normal', 'dificil'];

// Valores de material
const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

// Tablas posicionales (perspectiva blancas: fila 0 = rango 8, fila 7 = rango 1)
const POS_TABLES = {
  P: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
  ],
  N: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ],
  B: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
  ],
  R: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0
  ],
  Q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
  ],
  K: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
  ]
};

function getPosBonus(piece, r, c) {
    const table = POS_TABLES[piece.type];
    if (!table) return 0;
    // Blancas: tabla normal; Negras: espejo vertical
    const idx = piece.color === WHITE ? r * 8 + c : (7 - r) * 8 + c;
    return table[idx];
}

function evaluateBoard(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;
            const val = PIECE_VALUES[p.type] + getPosBonus(p, r, c);
            // Score positivo = bueno para las Negras (IA)
            score += p.color === BLACK ? val : -val;
        }
    }
    return score;
}

// Genera todos los movimientos legales para un color sobre un tablero dado
function getAIMovesForBoard(board, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (!piece || piece.color !== color) continue;
            for (let tr = 0; tr < 8; tr++) {
                for (let tc = 0; tc < 8; tc++) {
                    if (tr === r && tc === c) continue;
                    if (es_movimiento_valido(board, r, c, tr, tc, piece.color, piece.moved, null)) {
                        const copy = board.map(row => [...row]);
                        copy[tr][tc] = copy[r][c];
                        copy[r][c] = null;
                        if (!isKingInCheck(copy, color)) {
                            moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
                        }
                    }
                }
            }
        }
    }
    return moves;
}

// Aplica un movimiento sobre una copia del tablero (la IA siempre promueve a reina)
function applyMoveToBoard(board, fromR, fromC, toR, toC) {
    const newBoard = board.map(row => [...row]);
    const piece = { ...newBoard[fromR][fromC], moved: true };
    if (piece.type === 'P' && (toR === 0 || toR === 7)) piece.type = 'Q';
    newBoard[toR][toC] = piece;
    newBoard[fromR][fromC] = null;
    return newBoard;
}

// Minimax con poda Alpha-Beta
function minimax(board, depth, alpha, beta, isMaximizing) {
    if (depth === 0) return evaluateBoard(board);
    const color = isMaximizing ? BLACK : WHITE;
    const moves = getAIMovesForBoard(board, color);
    if (moves.length === 0) {
        if (isKingInCheck(board, color)) {
            // Jaque mate - preferíndo mates más rápidos
            return isMaximizing ? -50000 - depth : 50000 + depth;
        }
        return 0; // Ahogado
    }
    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            const newBoard = applyMoveToBoard(board, move.fromR, move.fromC, move.toR, move.toC);
            const eval_ = minimax(newBoard, depth - 1, alpha, beta, false);
            maxEval = Math.max(maxEval, eval_);
            alpha = Math.max(alpha, eval_);
            if (beta <= alpha) break; // Poda Beta
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            const newBoard = applyMoveToBoard(board, move.fromR, move.fromC, move.toR, move.toC);
            const eval_ = minimax(newBoard, depth - 1, alpha, beta, true);
            minEval = Math.min(minEval, eval_);
            beta = Math.min(beta, eval_);
            if (beta <= alpha) break; // Poda Alpha
        }
        return minEval;
    }
}

// Obtiene el mejor movimiento según la dificultad
function getBestMove() {
    const diff  = state.aiDifficulty;
    const moves = getAIMovesForBoard(state.board, BLACK);
    if (moves.length === 0) return null;
    let depth, randomChance;
    if      (diff === 'facil')   { depth = 1; randomChance = 0.45; }
    else if (diff === 'normal')  { depth = 2; randomChance = 0.10; }
    else                         { depth = 3; randomChance = 0.00; }
    // Chance de mover al azar (da variedad en dificultad fácil)
    if (Math.random() < randomChance) {
        return moves[Math.floor(Math.random() * moves.length)];
    }
    // Mezclar para variedad en empates de puntuación
    moves.sort(() => Math.random() - 0.5);
    let bestMove  = null;
    let bestScore = -Infinity;
    for (const move of moves) {
        const newBoard = applyMoveToBoard(state.board, move.fromR, move.fromC, move.toR, move.toC);
        const score    = minimax(newBoard, depth - 1, -Infinity, Infinity, false);
        if (score > bestScore) { bestScore = score; bestMove = move; }
    }
    return bestMove;
}

const aiThinkingEl = document.getElementById('ai-thinking');
let aiMoveTimeout  = null;

function cancelAIMove() {
    if (aiMoveTimeout !== null) {
        clearTimeout(aiMoveTimeout);
        aiMoveTimeout = null;
        if (aiThinkingEl) aiThinkingEl.classList.add('d-none');
    }
}

function triggerAIMove() {
    if (aiThinkingEl) aiThinkingEl.classList.remove('d-none');
    const thinkMs = state.aiDifficulty === 'facil' ? 500
                  : state.aiDifficulty === 'normal' ? 800 : 1100;
    aiMoveTimeout = setTimeout(() => {
        aiMoveTimeout = null;
        if (aiThinkingEl) aiThinkingEl.classList.add('d-none');
        if (state.status !== GAME_PLAYING) return;
        const move = getBestMove();
        if (!move) { checkGameState(); return; }
        const piece = state.board[move.fromR][move.fromC];
        finalizeMove(move.fromR, move.fromC, move.toR, move.toC, piece);
    }, thinkMs);
}

// ==================== SISTEMA DE DESBLOQUEO ====================

function getAICleared()  { return JSON.parse(localStorage.getItem('chess_ai_cleared')  || '[]');         }
function getAIUnlocked() { return JSON.parse(localStorage.getItem('chess_ai_unlocked') || '["facil"]'); }

function markAICleared(diff) {
    const cleared  = getAICleared();
    if (!cleared.includes(diff)) {
        cleared.push(diff);
        localStorage.setItem('chess_ai_cleared', JSON.stringify(cleared));
    }
    const unlocked = getAIUnlocked();
    const idx = DIFF_ORDER.indexOf(diff);
    if (idx >= 0 && idx < DIFF_ORDER.length - 1) {
        const next = DIFF_ORDER[idx + 1];
        if (!unlocked.includes(next)) {
            unlocked.push(next);
            localStorage.setItem('chess_ai_unlocked', JSON.stringify(unlocked));
        }
    }
}

function updateDifficultyModal() {
    const unlocked = getAIUnlocked();
    const cleared  = getAICleared();
    DIFF_ORDER.forEach(diff => {
        const btn    = document.getElementById(`btn-diff-${diff}`);
        const card   = document.getElementById(`diff-card-${diff}`);
        const starsEl= document.getElementById(`diff-stars-${diff}`);
        if (!btn || !card) return;
        if (unlocked.includes(diff)) {
            btn.disabled = false;
            btn.innerText = 'JUGAR';
            card.classList.remove('locked');
        } else {
            btn.disabled = true;
            btn.innerText = '🔒';
            card.classList.add('locked');
        }
        if (starsEl) starsEl.innerText = cleared.includes(diff) ? '⭐' : '';
    });
}

// Listeners del modal de dificultad
document.getElementById('btn-play-ai').addEventListener('click', () => {
    updateDifficultyModal();
    document.getElementById('ai-difficulty-modal').classList.remove('hidden');
});

document.getElementById('btn-close-diff-modal').addEventListener('click', () => {
    document.getElementById('ai-difficulty-modal').classList.add('hidden');
});

DIFF_ORDER.forEach(diff => {
    document.getElementById(`btn-diff-${diff}`).addEventListener('click', () => {
        document.getElementById('ai-difficulty-modal').classList.add('hidden');
        mainMenuEl.classList.add('d-none');
        gameContainerEl.classList.remove('d-none');
        startGame('ai', diff);
    });
});
