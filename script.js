/* =========================================================
   LUDO — SCRIPT.JS
   ========================================================= */

(function () {

  "use strict";


  /* =========================================================
     BOARD GEOMETRY
     ========================================================= */

  const CELL = 36;
  const BOARD_SIZE = 540;
  const CENTER = 7;

  const COLORS = [
    "red",
    "green",
    "yellow",
    "blue"
  ];

  const COLOR_HEX = {
    red: "#D6455A",
    green: "#279966",
    yellow: "#F0B429",
    blue: "#3068D6"
  };

  const COLOR_DARK = {
    red: "#A6323F",
    green: "#1C7350",
    yellow: "#C8930F",
    blue: "#204C9E"
  };

  const COLOR_LIGHT = {
    red: "#F18A98",
    green: "#68C99F",
    yellow: "#F8D878",
    blue: "#7FA5F2"
  };

  const COLOR_LABEL = {
    red: "Red",
    green: "Green",
    yellow: "Yellow",
    blue: "Blue"
  };


  /*
    Each color starts in a different quadrant.

    Red    = top-left
    Green  = top-right
    Yellow = bottom-left
    Blue   = bottom-right
  */

  const QUADRANT = {
    red: 0,
    green: 1,
    yellow: 2,
    blue: 3
  };

  const COLOR_START = {
    red: 0,
    green: 13,
    yellow: 26,
    blue: 39
  };

  const YARD_ORIGIN = {
    red: [0, 0],
    green: [9, 0],
    yellow: [0, 9],
    blue: [9, 9]
  };


  /*
    Four token positions inside each yard.
  */

  const YARD_SLOTS = [
    [1, 1],
    [4, 1],
    [1, 4],
    [4, 4]
  ];


  /*
    Base arm used to create the 52-space
    shared circular path.
  */

  const BASE_ARM = [
    [-6, -1],
    [-5, -1],
    [-4, -1],
    [-3, -1],
    [-2, -1],
    [-1, -2],
    [-1, -3],
    [-1, -4],
    [-1, -5],
    [-1, -6],
    [-1, -7],
    [0, -7],
    [1, -7]
  ];


  function rotate(dx, dy, turns) {

    let x = dx;
    let y = dy;

    for (let i = 0; i < turns; i++) {

      const nx = -y;
      const ny = x;

      x = nx;
      y = ny;
    }

    return [x, y];
  }


  /*
    Shared 52-space track.
  */

  const PATH = [];

  for (let k = 0; k < 4; k++) {

    for (let i = 0; i < 13; i++) {

      const [dx, dy] =
        rotate(
          BASE_ARM[i][0],
          BASE_ARM[i][1],
          k
        );

      PATH.push([
        CENTER + dx,
        CENTER + dy
      ]);
    }
  }


  /*
    Safe spaces.

    Each color's starting square is safe,
    plus four additional star positions.
  */

  const SAFE_INDICES = new Set();

  for (let k = 0; k < 4; k++) {

    SAFE_INDICES.add(k * 13);
    SAFE_INDICES.add(k * 13 + 8);
  }


  /*
    Six colored home-lane cells per player.
  */

  const HOME_CELLS = {};

  COLORS.forEach(color => {

    const k = QUADRANT[color];

    const cells = [];

    for (let j = 0; j < 6; j++) {

      const [dx, dy] =
        rotate(
          -6 + j,
          0,
          k
        );

      cells.push([
        CENTER + dx,
        CENTER + dy
      ]);
    }

    HOME_CELLS[color] = cells;
  });


  function yardCell(color, tokenId) {

    const [ox, oy] =
      YARD_ORIGIN[color];

    const [lx, ly] =
      YARD_SLOTS[tokenId];

    return [
      ox + lx,
      oy + ly
    ];
  }


  function pxCell(col, row) {

    return {
      x: (col + 0.5) * CELL,
      y: (row + 0.5) * CELL
    };
  }


  function globalIndexFor(color, position) {

    return (
      COLOR_START[color] +
      position
    ) % 52;
  }


  /* =========================================================
     GAME STATE
     ========================================================= */

  let state = null;

  let selectedDie = null;


  function freshState(types) {

    const tokens = {};

    COLORS.forEach(color => {

      tokens[color] =
        [0, 1, 2, 3].map(id => ({
          id,
          pos: -1
        }));

    });


    return {

      active: COLORS.slice(),

      /*
        Example:

        {
          red: "p1",
          green: "p2",
          yellow: "p3",
          blue: "cpu"
        }
      */

      types,

      tokens,

      turnIdx: 0,

      dice: [null, null],

      diceRolled: false,

      /*
        Each die is tracked separately.

        Example:
        [6, 2]

        If the first die has been used:

        [null, 2]
      */

      usedDice: [false, false],

      awaitingHuman: false,

      log: [],

      winner: null,

      rolling: false

    };
  }


  function currentColor() {

    return state.active[state.turnIdx];
  }


  function currentIsHuman() {

    return state.types[currentColor()] !== "cpu";
  }


  function playerLabel(type) {

    if (type === "cpu") {
      return "Computer";
    }

    return `Player ${type.slice(1)}`;
  }


  /* =========================================================
     LOGGING
     ========================================================= */

  function log(message) {

    state.log.unshift(message);

    if (state.log.length > 8) {
      state.log.pop();
    }

    renderLog();
  }


  function renderLog() {

    const logElement =
      document.getElementById("log");

    if (!logElement || !state) {
      return;
    }

    logElement.innerHTML = "";

    state.log.forEach(message => {

      const li =
        document.createElement("li");

      li.textContent = message;

      logElement.appendChild(li);
    });
  }


  /* =========================================================
     LUDO RULES
     ========================================================= */


  /*
    A token is:

    -1  = inside yard
     0  = starting square
     1-50 = track
    51-55 = home lane
    56 = finished home
  */


  function isFinished(token) {

    return token.pos === 56;
  }


  function isOnBoard(token) {

    return (
      token.pos >= 0 &&
      token.pos <= 55
    );
  }


  function onBoardCount(color) {

    return state.tokens[color]
      .filter(token => isOnBoard(token))
      .length;
  }


  /*
    Determine whether an enemy block occupies
    a particular shared track square.
  */

  function isBlockedByEnemyPair(
    color,
    globalIndex
  ) {

    if (SAFE_INDICES.has(globalIndex)) {
      return false;
    }

    for (const other of state.active) {

      if (other === color) {
        continue;
      }

      const count =
        state.tokens[other].filter(token => {

          return (
            token.pos >= 0 &&
            token.pos <= 50 &&
            globalIndexFor(
              other,
              token.pos
            ) === globalIndex
          );

        }).length;

      if (count >= 2) {
        return true;
      }
    }

    return false;
  }


  /*
    Find opponents on a square.
  */

  function getCaptureVictims(
    color,
    globalIndex
  ) {

    if (SAFE_INDICES.has(globalIndex)) {
      return [];
    }

    const victims = [];

    for (const other of state.active) {

      if (other === color) {
        continue;
      }

      state.tokens[other].forEach(token => {

        if (
          token.pos >= 0 &&
          token.pos <= 50 &&
          globalIndexFor(
            other,
            token.pos
          ) === globalIndex
        ) {

          victims.push({
            color: other,
            token
          });
        }

      });
    }

    return victims;
  }


  /*
    Check whether a token can move by a
    particular die value.
  */

  function canTokenMove(
    color,
    token,
    diceValue
  ) {

    if (!diceValue) {
      return false;
    }

    if (isFinished(token)) {
      return false;
    }


    /*
      Yard token.

      Only a 6 can bring it out.
    */

    if (token.pos === -1) {

      if (diceValue !== 6) {
        return false;
      }

      const startIndex =
        globalIndexFor(color, 0);

      if (
        isBlockedByEnemyPair(
          color,
          startIndex
        )
      ) {

        return false;
      }

      return true;
    }


    const destination =
      token.pos + diceValue;


    /*
      Cannot travel beyond home.
    */

    if (destination > 56) {
      return false;
    }


    /*
      Shared track.
    */

    if (destination <= 50) {

      const globalIndex =
        globalIndexFor(
          color,
          destination
        );

      if (
        isBlockedByEnemyPair(
          color,
          globalIndex
        )
      ) {

        return false;
      }
    }


    /*
      Home lane and final home
      don't have enemy-block restrictions.
    */

    return true;
  }


  /*
    Get all possible moves for one die.
  */

  function getMovesForDie(
    color,
    diceValue
  ) {

    const moves = [];

    state.tokens[color].forEach(token => {

      if (
        canTokenMove(
          color,
          token,
          diceValue
        )
      ) {

        const from = token.pos;

        let to;

        if (from === -1) {
          to = 0;
        } else {
          to = from + diceValue;
        }

        let capture = false;

        if (to <= 50) {

          const globalIndex =
            globalIndexFor(
              color,
              to
            );

          capture =
            getCaptureVictims(
              color,
              globalIndex
            ).length > 0;
        }

        moves.push({

          tokenId: token.id,

          color,

          dieValue: diceValue,

          from,

          to,

          fromYard: from === -1,

          capture,

          finish: to === 56

        });
      }

    });

    return moves;
  }


  /*
    Determine whether the current player has
    any legal move using either die.
  */

  function hasAnyMove() {

    const color = currentColor();

    for (let i = 0; i < 2; i++) {

      if (
        state.usedDice[i] ||
        !state.dice[i]
      ) {
        continue;
      }

      if (
        getMovesForDie(
          color,
          state.dice[i]
        ).length > 0
      ) {

        return true;
      }
    }

    return false;
  }


  /* =========================================================
     EXECUTE A SINGLE MOVE
     ========================================================= */

  function executeMove(move) {

    if (!state || state.winner) {
      return;
    }

    const color = currentColor();

    const token =
      state.tokens[color]
        .find(
          t => t.id === move.tokenId
        );

    if (!token) {
      return;
    }


    /*
      Mark the corresponding die as used.
    */

    const dieIndex =
      state.dice.findIndex(
        (value, index) =>
          !state.usedDice[index] &&
          value === move.dieValue
      );

    if (dieIndex === -1) {
      return;
    }


    state.usedDice[dieIndex] = true;

    token.pos = move.to;


    /*
      Capture opponent tokens.
    */

    let capturedAny = false;

    if (move.to <= 50) {

      const globalIndex =
        globalIndexFor(
          color,
          move.to
        );

      const victims =
        getCaptureVictims(
          color,
          globalIndex
        );

      victims.forEach(victim => {

        victim.token.pos = -1;

        capturedAny = true;

        log(
          `${COLOR_LABEL[color]} sent ` +
          `${COLOR_LABEL[victim.color]}'s ` +
          `token back to its yard.`
        );

      });
    }


    /*
      Movement message.
    */

    if (move.fromYard) {

      log(
        `${COLOR_LABEL[color]} brought ` +
        `a token onto its starting square ` +
        `with a 6.`
      );

    } else if (move.finish) {

      log(
        `${COLOR_LABEL[color]}'s token ` +
        `reached home.`
      );

    } else if (!capturedAny) {

      log(
        `${COLOR_LABEL[color]} moved ` +
        `a token ${move.dieValue} space` +
        `${move.dieValue === 1 ? "" : "s"}.`
      );
    }


    render();


    /*
      Check whether this player has won.
    */

    const allHome =
      state.tokens[color]
        .every(
          token => token.pos === 56
        );

    if (allHome) {

      state.winner = color;

      render();

      showWin(color);

      return;
    }


    /*
      If both dice have been used,
      decide whether the player gets another turn.

      A roll containing at least one 6
      gives another turn.
    */

    if (
      state.usedDice[0] &&
      state.usedDice[1]
    ) {

      const rolledSix =
        state.dice.includes(6);

      if (rolledSix) {

        log(
          `${COLOR_LABEL[color]} rolled a 6 ` +
          `and gets another turn.`
        );

        setTimeout(() => {

          prepareNextRoll();

        }, 500);

      } else {

        setTimeout(() => {

          endTurn();

        }, 350);
      }

      return;
    }


    /*
      There may still be another die available.
    */

    const remainingMove =
      hasAnyMove();

    if (!remainingMove) {

      /*
        No legal use for the remaining die.
        Finish this turn.
      */

      const rolledSix =
        state.dice.includes(6);

      if (rolledSix) {

        log(
          `${COLOR_LABEL[color]} used all possible moves ` +
          `and gets another turn because of the 6.`
        );

        setTimeout(
          prepareNextRoll,
          500
        );

      } else {

        setTimeout(
          endTurn,
          350
        );
      }

      return;
    }


    /*
      Continue using the remaining die.
    */

    state.awaitingHuman = true;

    const remainingDice =
      state.dice
        .map(
          (value, index) =>
            state.usedDice[index]
              ? null
              : value
        )
        .filter(Boolean);

    if (currentIsHuman()) {

      document.getElementById(
        "statusLine"
      ).textContent =
        `${COLOR_LABEL[color]} — ` +
        `choose a token for ` +
        `${remainingDice.join(" or ")}.`;

    } else {

      /*
        Computer will choose automatically.
      */

      setTimeout(
        computerMakeNextMove,
        550
      );
    }

    render();
  }


  /* =========================================================
     PREPARE NEXT ROLL
     ========================================================= */

  function prepareNextRoll() {

    state.dice = [null, null];

    state.usedDice = [false, false];

    state.diceRolled = false;

    state.awaitingHuman = false;

    state.rolling = false;

    render();

    if (!currentIsHuman()) {

      setTimeout(
        rollDice,
        650
      );

    } else {

      document.getElementById(
        "statusLine"
      ).textContent =
        `${COLOR_LABEL[currentColor()]}'s turn — tap the dice in the center.`;
    }
  }


  /* =========================================================
     END TURN
     ========================================================= */

  function endTurn() {

    state.dice = [null, null];

    state.usedDice = [false, false];

    state.diceRolled = false;

    state.awaitingHuman = false;

    state.rolling = false;

    state.turnIdx =
      (state.turnIdx + 1) %
      state.active.length;

    render();

    if (!currentIsHuman()) {

      setTimeout(
        rollDice,
        700
      );

    } else {

      document.getElementById(
        "statusLine"
      ).textContent =
        `${COLOR_LABEL[currentColor()]}'s turn — tap the dice in the center.`;
    }
  }


  /* =========================================================
     TWO DICE ROLL
     ========================================================= */

  function rollDice() {

    if (!state || state.winner) {
      return;
    }

    if (
      state.diceRolled ||
      state.rolling
    ) {
      return;
    }


    state.rolling = true;

    render();


    /*
      Small delay makes the roll feel animated.
    */

    setTimeout(() => {

      const die1 =
        1 + Math.floor(
          Math.random() * 6
        );

      const die2 =
        1 + Math.floor(
          Math.random() * 6
        );

      state.dice = [
        die1,
        die2
      ];

      state.usedDice = [
        false,
        false
      ];

      state.diceRolled = true;

      state.rolling = false;

      render();

      handleRollResult();

    }, 500);
  }


  /* =========================================================
     AFTER ROLL
     ========================================================= */

  function handleRollResult() {

    const color = currentColor();

    const moves1 =
      getMovesForDie(
        color,
        state.dice[0]
      );

    const moves2 =
      getMovesForDie(
        color,
        state.dice[1]
      );

    log(
      `${COLOR_LABEL[color]} rolled ` +
      `${state.dice[0]} and ${state.dice[1]}.`
    );


    /*
      If neither die can be used,
      the turn ends.

      A 6 does not magically create a move
      if all tokens are blocked.
    */

    if (
      moves1.length === 0 &&
      moves2.length === 0
    ) {

      document.getElementById(
        "statusLine"
      ).textContent =
        `${COLOR_LABEL[color]} has no legal moves.`;

      render();

      setTimeout(
        endTurn,
        900
      );

      return;
    }


    /*
      Computer player.
    */

    if (!currentIsHuman()) {

      state.awaitingHuman = true;

      document.getElementById(
        "statusLine"
      ).textContent =
        `${COLOR_LABEL[color]} (computer) is playing.`;

      render();

      setTimeout(
        computerMakeNextMove,
        650
      );

      return;
    }


    /*
      Human player.

      If exactly one legal move exists
      across both dice, perform it automatically.

      Otherwise let the player choose.
    */

    const allMoves = [];

    if (moves1.length > 0) {

      moves1.forEach(move => {

        allMoves.push({
          ...move,
          dieIndex: 0
        });

      });
    }

    if (moves2.length > 0) {

      moves2.forEach(move => {

        allMoves.push({
          ...move,
          dieIndex: 1
        });

      });
    }


    /*
      If the same token can use either die,
      the player should choose because the
      dice are strategically different.
    */

    if (allMoves.length === 1) {

      state.awaitingHuman = false;

      document.getElementById(
        "statusLine"
      ).textContent =
        `${COLOR_LABEL[color]} has one legal move.`;

      render();

      setTimeout(() => {

        executeMove(allMoves[0]);

      }, 450);

      return;
    }


    state.awaitingHuman = true;

    document.getElementById(
      "statusLine"
    ).textContent =
      `${COLOR_LABEL[color]} rolled ` +
      `${state.dice[0]} + ${state.dice[1]}. ` +
      `Tap a highlighted token.`;

    render();
  }


  /* =========================================================
     HUMAN TOKEN CLICK
     ========================================================= */

  function handleTokenClick(
    color,
    tokenId
  ) {

    if (!state || state.winner) {
      return;
    }

    if (!state.awaitingHuman) {
      return;
    }

    if (color !== currentColor()) {
      return;
    }


    /*
      Find every available die that can move
      this particular token.
    */

    const possible = [];

    for (let i = 0; i < 2; i++) {

      if (
        state.usedDice[i] ||
        !state.dice[i]
      ) {
        continue;
      }

      const moves =
        getMovesForDie(
          color,
          state.dice[i]
        );

      const move =
        moves.find(
          m => m.tokenId === tokenId
        );

      if (move) {

        possible.push({
          ...move,
          dieIndex: i
        });
      }
    }


    if (possible.length === 0) {
      return;
    }


    /*
      If the token can be moved with only
      one die, use it.

      If it can use both dice, select the
      larger die automatically for a simple
      interaction.

      This can later be changed to show a
      small die-selection menu.
    */

    let selectedMove;

    if (possible.length === 1) {

      selectedMove = possible[0];

    } else {

      selectedMove =
        possible.reduce(
          (best, move) =>
  
