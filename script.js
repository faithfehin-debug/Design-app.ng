/* ============================================================
   LUDO - COMPLETE GAME JAVASCRIPT
   File: script.js
============================================================ */

(function () {
  "use strict";

  /* ==========================================================
     BOARD CONSTANTS
  ========================================================== */

  const CELL = 36;
  const BOARD_SIZE = 15;
  const CENTER = 7;

  const COLORS = ["red", "green", "yellow", "blue"];

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

  const COLOR_LABEL = {
    red: "Red",
    green: "Green",
    yellow: "Yellow",
    blue: "Blue"
  };

  /*
    Four home areas.
  */
  const YARD_ORIGIN = {
    red: [0, 0],
    green: [9, 0],
    yellow: [0, 9],
    blue: [9, 9]
  };

  /*
    Each color starts at a different point on the
    52-space outer track.
  */
  const COLOR_START = {
    red: 0,
    green: 13,
    yellow: 26,
    blue: 39
  };

  const QUADRANT = {
    red: 0,
    green: 1,
    yellow: 2,
    blue: 3
  };


  /* ==========================================================
     BOARD GEOMETRY
  ========================================================== */

  function rotate(dx, dy, times) {
    let x = dx;
    let y = dy;

    for (let i = 0; i < times; i++) {
      const nx = -y;
      const ny = x;
      x = nx;
      y = ny;
    }

    return [x, y];
  }


  /*
    The 13-space arm is repeated four times,
    producing the 52-space shared track.
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

  const PATH = [];

  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < BASE_ARM.length; i++) {
      const point = rotate(
        BASE_ARM[i][0],
        BASE_ARM[i][1],
        k
      );

      PATH.push([
        CENTER + point[0],
        CENTER + point[1]
      ]);
    }
  }


  /*
    Safe spaces.
  */
  const SAFE_INDICES = new Set();

  for (let k = 0; k < 4; k++) {
    SAFE_INDICES.add(k * 13);
    SAFE_INDICES.add(k * 13 + 8);
  }


  /*
    Five visible home-lane cells.
    Position 56 is the final home/center position.
  */
  const HOME_CELLS = {
    red: [
      [1, 7],
      [2, 7],
      [3, 7],
      [4, 7],
      [5, 7]
    ],

    green: [
      [7, 1],
      [7, 2],
      [7, 3],
      [7, 4],
      [7, 5]
    ],

    yellow: [
      [13, 7],
      [12, 7],
      [11, 7],
      [10, 7],
      [9, 7]
    ],

    blue: [
      [7, 13],
      [7, 12],
      [7, 11],
      [7, 10],
      [7, 9]
    ]
  };


  /*
    Four positions inside each yard.
  */
  const YARD_SLOTS = [
    [1, 1],
    [4, 1],
    [1, 4],
    [4, 4]
  ];


  function yardCell(color, tokenId) {
    const origin = YARD_ORIGIN[color];
    const slot = YARD_SLOTS[tokenId];

    return [
      origin[0] + slot[0],
      origin[1] + slot[1]
    ];
  }


  function pxCell(col, row) {
    return {
      x: (col + 0.5) * CELL,
      y: (row + 0.5) * CELL
    };
  }


  /* ==========================================================
     SVG HELPERS
  ========================================================== */

  function svgElement(tag, attributes) {
    const el = document.createElementNS(
      "http://www.w3.org/2000/svg",
      tag
    );

    Object.keys(attributes || {}).forEach(function (key) {
      el.setAttribute(key, attributes[key]);
    });

    return el;
  }


  function clearBoard() {
    const board = document.getElementById("boardSvg");

    if (board) {
      board.innerHTML = "";
    }
  }


  /* ==========================================================
     GAME STATE
  ========================================================== */

  let state = null;

  let selectedPlayerCount = 3;

  let lastAssignments = null;


  function createFreshState(types) {
    const tokens = {};

    COLORS.forEach(function (color) {
      tokens[color] = [0, 1, 2, 3].map(function (id) {
        return {
          id: id,
          pos: -1
        };
      });
    });

    return {
      active: COLORS.slice(),

      types: Object.assign({}, types),

      tokens: tokens,

      turnIdx: 0,

      /*
        Two dice.
      */
      dice: [null, null],

      /*
        Whether each die has already been used.
      */
      usedDice: [false, false],

      rolled: false,

      /*
        Which die is currently selected.
      */
      selectedDie: 0,

      movable: [],

      awaitingHuman: false,

      /*
        True when another roll is available because
        at least one of the previous dice was a 6.
      */
      extraRoll: false,

      log: [],

      winner: null
    };
  }


  function currentColor() {
    if (!state) return "red";

    return state.active[state.turnIdx];
  }


  function currentIsHuman() {
    if (!state) return true;

    return state.types[currentColor()] !== "cpu";
  }


  function playerLabel(type) {
    if (type === "cpu") {
      return "Computer";
    }

    if (typeof type === "string" && type.startsWith("p")) {
      return "Player " + type.substring(1);
    }

    return type || "";
  }


  /* ==========================================================
     LOG
  ========================================================== */

  function addLog(message) {
    if (!state) return;

    state.log.unshift(message);

    if (state.log.length > 7) {
      state.log.pop();
    }

    renderLog();
  }


  function renderLog() {
    const logElement = document.getElementById("log");

    if (!logElement || !state) return;

    logElement.innerHTML = "";

    state.log.forEach(function (message) {
      const li = document.createElement("li");
      li.textContent = message;
      logElement.appendChild(li);
    });
  }


  /* ==========================================================
     MOVEMENT / TRACK
  ========================================================== */

  function globalIndexFor(color, pos) {
    return (
      COLOR_START[color] + pos
    ) % 52;
  }


  function isOnOuterTrack(token) {
    return token.pos >= 0 && token.pos <= 50;
  }


  function countTokensOnGlobalSquare(color, globalIndex) {
    let count = 0;

    state.tokens[color].forEach(function (token) {
      if (
        isOnOuterTrack(token) &&
        globalIndexFor(color, token.pos) === globalIndex
      ) {
        count++;
      }
    });

    return count;
  }


  /*
    An opponent block consists of two or more tokens
    on the same shared square.
  */
  function isBlockedByEnemyPair(color, globalIndex) {
    if (SAFE_INDICES.has(globalIndex)) {
      return false;
    }

    for (const other of state.active) {
      if (other === color) continue;

      if (
        countTokensOnGlobalSquare(
          other,
          globalIndex
        ) >= 2
      ) {
        return true;
      }
    }

    return false;
  }


  function getCaptureVictims(color, globalIndex) {
    if (SAFE_INDICES.has(globalIndex)) {
      return [];
    }

    const victims = [];

    state.active.forEach(function (other) {
      if (other === color) return;

      state.tokens[other].forEach(function (token) {
        if (
          isOnOuterTrack(token) &&
          globalIndexFor(other, token.pos) === globalIndex
        ) {
          victims.push({
            color: other,
            token: token
          });
        }
      });
    });

    return victims;
  }


  /*
    Return all legal moves for a color using one die.
  */
  function getMovableTokens(color, diceValue) {
    const moves = [];

    if (!diceValue) {
      return moves;
    }

    state.tokens[color].forEach(function (token) {

      /*
        Finished token cannot move.
      */
      if (token.pos === 56) {
        return;
      }


      /*
        Token is still in yard.
        Only a 6 can bring it onto the starting square.
      */
      if (token.pos === -1) {

        if (diceValue === 6) {

          const globalIndex =
            globalIndexFor(color, 0);

          if (
            !isBlockedByEnemyPair(
              color,
              globalIndex
            )
          ) {
            moves.push({
              tokenId: token.id,
              from: -1,
              to: 0,
              dice: diceValue,
              fromYard: true,
              capture:
                getCaptureVictims(
                  color,
                  globalIndex
                ).length > 0
            });
          }
        }

        return;
      }


      /*
        Token is already in play.
      */
      const destination =
        token.pos + diceValue;


      /*
        Cannot overshoot the final home.
      */
      if (destination > 56) {
        return;
      }


      /*
        Still on shared outer track.
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
          return;
        }

        moves.push({
          tokenId: token.id,
          from: token.pos,
          to: destination,
          dice: diceValue,
          fromYard: false,
          capture:
            getCaptureVictims(
              color,
              globalIndex
            ).length > 0
        });

        return;
      }


      /*
        Moving into / through the colored home lane.
      */
      moves.push({
        tokenId: token.id,
        from: token.pos,
        to: destination,
        dice: diceValue,
        fromYard: false,
        capture: false
      });

    });

    return moves;
  }


  /* ==========================================================
     TOKEN / POSITION HELPERS
  ========================================================== */

  function getTokensAtOuterSquare(color, pos) {
    const result = [];

    if (pos < 0 || pos > 50) {
      return result;
    }

    const globalIndex =
      globalIndexFor(color, pos);

    state.active.forEach(function (otherColor) {

      state.tokens[otherColor].forEach(function (token) {

        if (
          isOnOuterTrack(token) &&
          globalIndexFor(
            otherColor,
            token.pos
          ) === globalIndex
        ) {
          result.push({
            color: otherColor,
            token: token
          });
        }

      });

    });

    return result;
  }


  function getTokenPoint(color, token) {

    /*
      Yard.
    */
    if (token.pos === -1) {
      const cell =
        yardCell(color, token.id);

      return pxCell(
        cell[0],
        cell[1]
      );
    }


    /*
      Outer track.
    */
    if (token.pos >= 0 && token.pos <= 50) {

      const globalIndex =
        globalIndexFor(
          color,
          token.pos
        );

      const cell = PATH[globalIndex];

      const occupants =
        getTokensAtOuterSquare(
          color,
          token.pos
        );

      let index = 0;

      occupants.forEach(function (item, i) {
        if (
          item.color === color &&
          item.token.id === token.id
        ) {
          index = i;
        }
      });

      const point =
        pxCell(cell[0], cell[1]);

      const offsets = [
        [0, 0],
        [-8, -8],
        [8, 8],
        [-8, 8],
        [8, -8],
        [0, -9],
        [0, 9]
      ];

      const offset =
        offsets[index % offsets.length];

      return {
        x: point.x + offset[0],
        y: point.y + offset[1]
      };
    }


    /*
      Colored home lane.
    */
    if (token.pos >= 51 && token.pos <= 55) {

      const cells =
        HOME_CELLS[color];

      const cell =
        cells[token.pos - 51];

      return pxCell(
        cell[0],
        cell[1]
      );
    }


    /*
      Finished tokens are shown in the center.
    */
    const finishSlots = {
      red: [-12, -12],
      green: [12, -12],
      yellow: [-12, 12],
      blue: [12, 12]
    };

    const center =
      pxCell(7, 7);

    const offset =
      finishSlots[color];

    return {
      x: center.x + offset[0],
      y: center.y + offset[1]
    };
  }


  /* ==========================================================
     BOARD DRAWING
  ========================================================== */

  function drawRect(parent, x, y, width, height, attrs) {
    const rect = svgElement(
      "rect",
      Object.assign(
        {
          x: x,
          y: y,
          width: width,
          height: height
        },
        attrs || {}
      )
    );

    parent.appendChild(rect);

    return rect;
  }


  function drawBoardBackground(board) {

    drawRect(
      board,
      0,
      0,
      540,
      540,
      {
        fill: "#F7F8FA"
      }
    );


    /*
      Outer border.
    */
    drawRect(
      board,
      3,
      3,
      534,
      534,
      {
        fill: "none",
        stroke: "#20242B",
        "stroke-width": 6,
        rx: 18
      }
    );
  }


  function drawYards(board) {

    COLORS.forEach(function (color) {

      const origin =
        YARD_ORIGIN[color];

      const x =
        origin[0] * CELL;

      const y =
        origin[1] * CELL;


      /*
        Soft colored yard background.
      */
      drawRect(
        board,
        x + 3,
        y + 3,
        CELL * 6 - 6,
        CELL * 6 - 6,
        {
          fill: COLOR_HEX[color],
          "fill-opacity": 0.16,
          rx: 14,
          stroke: COLOR_HEX[color],
          "stroke-width": 2
        }
      );


      /*
        Inner home panel.
      */
      drawRect(
        board,
        x + CELL * 0.65,
        y + CELL * 0.65,
        CELL * 4.7,
        CELL * 4.7,
        {
          fill: "#FFFFFF",
          "fill-opacity": 0.82,
          rx: 18,
          stroke: COLOR_HEX[color],
          "stroke-width": 2
        }
      );


      /*
        Token slots.
      */
      for (let i = 0; i < 4; i++) {

        const cell =
          yardCell(color, i);

        const point =
          pxCell(
            cell[0],
            cell[1]
          );

        const circle =
          svgElement(
            "circle",
            {
              cx: point.x,
              cy: point.y,
              r: 12,
              fill: "#FFFFFF",
              stroke: COLOR_HEX[color],
              "stroke-width": 3,
              "fill-opacity": 0.9
            }
          );

        board.appendChild(circle);
      }


      /*
        Small color label.
      */
      const labelPoint = {
        red: [3, 5.55],
        green: [12, 5.55],
        yellow: [3, 14.35],
        blue: [12, 14.35]
      }[color];

      const text =
        svgElement(
          "text",
          {
            x: labelPoint[0] * CELL,
            y: labelPoint[1] * CELL,
            "text-anchor": "middle",
            "font-size": 11,
            "font-weight": 700,
            fill: COLOR_DARK[color],
            opacity: 0.8
          }
        );

      text.textContent =
        COLOR_LABEL[color].toUpperCase();

      board.appendChild(text);
    });
  }


  function drawPath(board) {

    PATH.forEach(function (cell, index) {

      const point =
        pxCell(
          cell[0],
          cell[1]
        );

      let fill = "#FFFFFF";
      let stroke = "#D7DCE3";

      /*
        Starting squares.
      */
      COLORS.forEach(function (color) {
        if (COLOR_START[color] === index) {
          fill = COLOR_HEX[color];
          stroke = COLOR_DARK[color];
        }
      });

      const rect =
        svgElement(
          "rect",
          {
            x: cell[0] * CELL + 1,
            y: cell[1] * CELL + 1,
            width: CELL - 2,
            height: CELL - 2,
            rx: 5,
            fill: fill,
            stroke: stroke,
            "stroke-width": 1.2
          }
        );

      board.appendChild(rect);


      /*
        Safe star.
      */
      if (SAFE_INDICES.has(index)) {

        const star =
          svgElement(
            "text",
            {
              x: point.x,
              y: point.y + 7,
              "text-anchor": "middle",
              "font-size": 19,
              "font-weight": 700,
              fill: "#606772"
            }
          );

        star.textContent = "★";

        board.appendChild(star);
      }

    });
  }


  function drawHomeLanes(board) {

    COLORS.forEach(function (color) {

      HOME_CELLS[color].forEach(function (cell) {

        drawRect(
          board,
          cell[0] * CELL + 1,
          cell[1] * CELL + 1,
          CELL - 2,
          CELL - 2,
          {
            fill: COLOR_HEX[color],
            "fill-opacity": 0.76,
            stroke: COLOR_DARK[color],
            "stroke-width": 1.2,
            rx: 5
          }
        );

      });

    });
  }


  /* ==========================================================
     CENTER TWO-DICE CONTROL
  ========================================================== */

  function drawCenterDice(board) {

    const group =
      svgElement(
        "g",
        {
          id: "centerDice",
          "data-action": "roll"
        }
      );

    /*
      Center background.
    */
    drawRect(
      group,
      6 * CELL + 1,
      6 * CELL + 1,
      CELL * 3 - 2,
      CELL * 3 - 2,
      {
        fill: "#20242B",
        stroke: "#111318",
        "stroke-width": 2,
        rx: 12,
        "data-action": "roll"
      }
    );


    /*
      Two small dice.
    */
    const values =
      state && state.dice
        ? state.dice
        : [null, null];

    drawCenterDie(
      group,
      216,
      252,
      values[0],
      0
    );

    drawCenterDie(
      group,
      288,
      252,
      values[1],
      1
    );


    /*
      Clickable transparent layer over the center.
    */
    const hit =
      svgElement(
        "rect",
        {
          x: 6 * CELL,
          y: 6 * CELL,
          width: CELL * 3,
          height: CELL * 3,
          fill: "transparent",
          cursor:
            state &&
            !state.winner &&
            currentIsHuman() &&
            !state.rolled
              ? "pointer"
              : "default",
          "data-action": "roll"
        }
      );

    group.appendChild(hit);

    board.appendChild(group);
  }


  function drawCenterDie(
    parent,
    x,
    y,
    value,
    dieIndex
  ) {

    const size = 42;

    const rect =
      svgElement(
        "rect",
        {
          x: x - size / 2,
          y: y - size / 2,
          width: size,
          height: size,
          rx: 8,
          fill: "#FFFFFF",
          stroke:
            state &&
            state.selectedDie === dieIndex &&
            !state.usedDice[dieIndex]
              ? COLOR_HEX[currentColor()]
              : "#D5D9E0",
          "stroke-width":
            state &&
            state.selectedDie === dieIndex &&
            !state.usedDice[dieIndex]
              ? 4
              : 2,
          opacity:
            state &&
            state.usedDice[dieIndex]
              ? 0.35
              : 1,
          "data-action": "select-die",
          "data-die": dieIndex
        }
      );

    parent.appendChild(rect);


    if (!value) {
      const q =
        svgElement(
          "text",
          {
            x: x,
            y: y + 7,
            "text-anchor": "middle",
            "font-size": 20,
            "font-weight": 800,
            fill: "#555C67",
            "data-action": "select-die",
            "data-die": dieIndex
          }
        );

      q.textContent = "?";

      parent.appendChild(q);

      return;
    }


    const positions = {
      1: [[0, 0]],
      2: [[-1, -1], [1, 1]],
      3: [[-1, -1], [0, 0], [1, 1]],
      4: [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ],
      5: [
        [-1, -1],
        [1, -1],
        [0, 0],
        [-1, 1],
        [1, 1]
      ],
      6: [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [1, -1],
        [1, 0],
        [1, 1]
      ]
    };

    positions[value].forEach(function (position) {

      const pip =
        svgElement(
          "circle",
          {
            cx: x + position[0] * 9,
            cy: y + position[1] * 9,
            r: 3.2,
            fill: COLOR_DARK[currentColor()],
            "data-action": "select-die",
            "data-die": dieIndex
          }
        );

      parent.appendChild(pip);
    });
  }


  /* ==========================================================
     TOKENS
  ========================================================== */

  function drawTokens(board) {

    if (!state) return;

    COLORS.forEach(function (color) {

      state.tokens[color].forEach(function (token) {

        const point =
          getTokenPoint(
            color,
            token
          );

        const isMovable =
          state.awaitingHuman &&
          color === currentColor() &&
          state.movable.some(function (move) {
            return move.tokenId === token.id;
          });


        /*
          Highlight ring.
        */
        if (isMovable) {

          const ring =
            svgElement(
              "circle",
              {
                cx: point.x,
                cy: point.y,
                r: 17,
                fill: "none",
                stroke: COLOR_HEX[color],
                "stroke-width": 4,
                opacity: 0.85,
                class: "movable-ring"
              }
            );

          board.appendChild(ring);
        }


        /*
          Token.
        */
        const tokenCircle =
          svgElement(
            "circle",
            {
              cx: point.x,
              cy: point.y,
              r: 12,
              fill: COLOR_HEX[color],
              stroke: "#FFFFFF",
              "stroke-width": 3,
              cursor:
                isMovable
                  ? "pointer"
                  : "default",
              "data-token-color": color,
              "data-token-id": token.id
            }
          );

        board.appendChild(tokenCircle);


        /*
          Small token number.
        */
        const number =
          svgElement(
            "text",
            {
              x: point.x,
              y: point.y + 4,
              "text-anchor": "middle",
              "font-size": 8,
              "font-weight": 800,
              fill: "#FFFFFF",
              "pointer-events": "none"
            }
          );

        number.textContent =
          String(token.id + 1);

        board.appendChild(number);

      });

    });
  }


  function renderBoard() {

    const board =
      document.getElementById("boardSvg");

    if (!board) return;

    clearBoard();

    drawBoardBackground(board);
    drawYards(board);
    drawPath(board);
    drawHomeLanes(board);
    drawCenterDice(board);
    drawTokens(board);
  }


  /* ==========================================================
     DICE
  ========================================================== */

  function ensureDiceElements() {

    const container =
      document.getElementById("die");

    if (!container) return;

    /*
      If the old HTML only has <div id="die"></div>,
      create the two dice here.
    */
    container.innerHTML = "";

    for (let i = 0; i < 2; i++) {

      const die =
        document.createElement("div");

      die.className = "die";

      die.id = "die" + (i + 1);

      die.dataset.die = i;

      die.setAttribute(
        "role",
        "button"
      );

      die.setAttribute(
        "aria-label",
        "Die " + (i + 1)
      );

      container.appendChild(die);
    }

    renderSideDice();
  }


  function renderSideDice() {

    const container =
      document.getElementById("die");

    if (!container || !state) return;

    const dice =
      container.querySelectorAll(".die");

    dice.forEach(function (dieElement, index) {

      const value =
        state.dice[index];

      dieElement.innerHTML = "";

      dieElement.classList.toggle(
        "used",
        state.usedDice[index]
      );

      dieElement.classList.toggle(
        "selected",
        state.selectedDie === index &&
        !state.usedDice[index] &&
        state.rolled
      );

      dieElement.classList.toggle(
        "rolling",
        false
      );


      if (!value) {

        const question =
          document.createElement("span");

        question.textContent = "?";

        dieElement.appendChild(question);

        return;
      }


      const pipPositions = {
        1: [[1, 1]],
        2: [[0, 0], [2, 2]],
        3: [[0, 0], [1, 1], [2, 2]],
        4: [
          [0, 0],
          [2, 0],
          [0, 2],
          [2, 2]
        ],
        5: [
          [0, 0],
          [2, 0],
          [1, 1],
          [0, 2],
          [2, 2]
        ],
        6: [
          [0, 0],
          [0, 1],
          [0, 2],
          [2, 0],
          [2, 1],
          [2, 2]
        ]
      };


      pipPositions[value].forEach(function (position) {

        const pip =
          document.createElement("span");

        pip.className = "pip";

        pip.style.gridColumn =
          String(position[0] + 1);

        pip.style.gridRow =
          String(position[1] + 1);

        dieElement.appendChild(pip);
      });

    });
  }


  /* ==========================================================
     ROLLING
  ========================================================== */

  function canRoll() {

    if (!state) return false;

    if (state.winner) return false;

    if (!currentIsHuman()) return false;

    if (state.rolled) return false;

    return true;
  }


  function rollDice() {

    if (!state) return;

    if (state.winner) return;

    if (state.rolled) return;

    /*
      CPU rolls automatically.
      Humans can use the button or center of board.
    */
    if (!currentIsHuman()) {
      performRoll();
      return;
    }

    performRoll();
  }


  function performRoll() {

    if (!state || state.winner) return;

    if (state.rolled) return;


    const color =
      currentColor();


    /*
      Animate side dice.
    */
    const container =
      document.getElementById("die");

    if (container) {

      container
        .querySelectorAll(".die")
        .forEach(function (die) {

          die.classList.remove("rolling");

          void die.offsetWidth;

          die.classList.add("rolling");
        });
    }


    const first =
      1 + Math.floor(
        Math.random() * 6
      );

    const second =
      1 + Math.floor(
        Math.random() * 6
      );


    state.dice = [
      first,
      second
    ];

    state.usedDice = [
      false,
      false
    ];

    state.rolled = true;

    state.awaitingHuman = false;

    state.selectedDie = 0;


    renderSideDice();
    renderBoard();


    addLog(
      COLOR_LABEL[color] +
      " rolled " +
      first +
      " and " +
      second + "."
    );


    /*
      Determine whether either die can be used.
    */
    const movesOne =
      getMovableTokens(
        color,
        first
      );

    const movesTwo =
      getMovableTokens(
        color,
        second
      );


    /*
      No moves on either die.
    */
    if (
      movesOne.length === 0 &&
      movesTwo.length === 0
    ) {

      setStatus(
        COLOR_LABEL[color] +
        " rolled " +
        first +
        " and " +
        second +
        " — no moves are possible."
      );

      addLog(
        COLOR_LABEL[color] +
        " could not make a move."
      );

      setTimeout(
        finishDiceAndTurn,
        900
      );

      return;
    }


    /*
      Choose a usable die.
    */
    if (movesOne.length > 0) {

      state.selectedDie = 0;

    } else {

      state.selectedDie = 1;
    }


    /*
      CPU.
    */
    if (!currentIsHuman()) {

      setStatus(
        COLOR_LABEL[color] +
        " (computer) is thinking..."
      );

      renderBoard();

      setTimeout(
        cpuUseNextDie,
        650
      );

      return;
    }


    /*
      Human.
    */
    updateSelectedDieMoves();


    /*
      If there is exactly one possible move
      across both dice, automatically make it.
    */
    const allMoves = [];

    if (movesOne.length > 0) {
      movesOne.forEach(function (move) {
        allMoves.push({
          move: move,
          dieIndex: 0
        });
      });
    }

    if (movesTwo.length > 0) {
      movesTwo.forEach(function (move) {
        allMoves.push({
          move: move,
          dieIndex: 1
        });
      });
    }


    if (allMoves.length === 1) {

      state.selectedDie =
        allMoves[0].dieIndex;

      state.movable = [
        allMoves[0].move
      ];

      state.awaitingHuman = true;

      renderBoard();

      setStatus(
        COLOR_LABEL[color] +
        " rolled " +
        first +
        " and " +
        second +
        "."
      );

      setTimeout(function () {

        executeMove(
          allMoves[0].move,
          allMoves[0].dieIndex
        );

      }, 450);

      return;
    }


    setStatus(
      COLOR_LABEL[color] +
      " rolled " +
      first +
      " and " +
      second +
      ". Select a die, then tap a highlighted token."
    );

    state.awaitingHuman = true;

    renderBoard();
  }


  function updateSelectedDieMoves() {

    if (!state) return;

    const color =
      currentColor();

    const index =
      state.selectedDie;


    if (state.usedDice[index]) {

      const other =
        index === 0 ? 1 : 0;

      if (!state.usedDice[other]) {
        state.selectedDie = other;
      }
    }


    const value =
      state.dice[
        state.selectedDie
      ];


    state.movable =
      getMovableTokens(
        color,
        value
      );


    /*
      If selected die has no moves,
      automatically select the other die if possible.
    */
    if (
      state.movable.length === 0
    ) {

      const other =
        state.selectedDie === 0
          ? 1
          : 0;

      if (
        !state.usedDice[other] &&
        state.dice[other]
      ) {

        const otherMoves =
          getMovableTokens(
            color,
            state.dice[other]
          );

        if (otherMoves.length > 0) {

          state.selectedDie =
            other;

          state.movable =
            otherMoves;
        }
      }
    }
  }


  /* ==========================================================
     TOKEN CLICK
  ========================================================== */

  function handleTokenClick(
    color,
    tokenId
  ) {

    if (!state) return;

    if (!state.awaitingHuman) return;

    if (state.winner) return;

    if (color !== currentColor()) return;


    const move =
      state.movable.find(
        function (item) {
          return item.tokenId === tokenId;
        }
      );


    if (!move) return;


    const dieIndex =
      state.selectedDie;


    state.awaitingHuman = false;

    executeMove(
      move,
      dieIndex
    );
  }


  /* ==========================================================
     EXECUTE MOVE
  ========================================================== */

  function executeMove(
    move,
    dieIndex
  ) {

    if (!state) return;

    const color =
      currentColor();

    const token =
      state.tokens[color].find(
        function (item) {
          return item.id === move.tokenId;
        }
      );


    if (!token) return;


    const dieValue =
      state.dice[dieIndex];


    /*
      Move token.
    */
    token.pos = move.to;


    /*
      Mark this die as used.
    */
    state.usedDice[dieIndex] = true;


    /*
      Capture.
    */
    let captured = false;


    if (move.to >= 0 && move.to <= 50) {

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


      victims.forEach(function (victim) {

        victim.token.pos = -1;

        captured = true;

        addLog(
          COLOR_LABEL[color] +
          " sent " +
          COLOR_LABEL[victim.color] +
          "'s token back to its yard."
        );
      });
    }


    /*
      Log the move.
    */
    if (move.fromYard) {

      addLog(
        COLOR_LABEL[color] +
        " brought token " +
        (move.tokenId + 1) +
        " into play."
      );

    } else if (move.to === 56) {

      addLog(
        COLOR_LABEL[color] +
        "'s token reached home."
      );

    } else if (!captured) {

      addLog(
        COLOR_LABEL[color] +
        " moved token " +
        (move.tokenId + 1) +
        " by " +
        dieValue +
        "."
      );
    }


    state.movable = [];

    state.awaitingHuman = false;


    renderBoard();


    /*
      Check for winner.
    */
    const allHome =
      state.tokens[color].every(
        function (item) {
          return item.pos === 56;
        }
      );


    if (allHome) {

      state.winner = color;

      renderBoard();

      showWinner(color);

      return;
    }


    /*
      Check if there are still unused dice.
    */
    const remainingDice =
      [];

    for (let i = 0; i < 2; i++) {

      if (!state.usedDice[i]) {

        remainingDice.push(i);
      }
    }


    /*
      There are more dice to use.
    */
    if (remainingDice.length > 0) {

      /*
        Select the next die that has a legal move.
      */
      let found = false;

      for (const index of remainingDice) {

        const moves =
          getMovableTokens(
            color,
            state.dice[index]
          );

        if (moves.length > 0) {

          state.selectedDie = index;

          state.movable = moves;

          found = true;

          break;
        }
      }


      /*
        If no remaining die can be used,
        mark them used and finish the turn.
      */
      if (!found) {

        remainingDice.forEach(
          function (index) {
            state.usedDice[index] = true;
          }
        );

        finishDiceAndTurn();

        return;
      }


      /*
        Human gets to use the next die.
      */
      if (currentIsHuman()) {

        state.awaitingHuman = true;

        setStatus(
          COLOR_LABEL[color] +
          " — now use the " +
          state.dice[state.selectedDie] +
          "."
        );

        renderBoard();

        return;
      }


      /*
        Computer uses next die.
      */
      setTimeout(
        cpuUseNextDie,
        500
      );

      return;
    }


    /*
      Both dice have been used.
    */
    finishDiceAndTurn();
  }


  /* ==========================================================
     FINISH DICE / TURN
  ========================================================== */

  function finishDiceAndTurn() {

    if (!state || state.winner) return;


    const color =
      currentColor();


    const rolledSix =
      state.dice.includes(6);


    /*
      A 6 gives another roll.
    */
    if (rolledSix) {

      state.extraRoll = true;

      state.dice = [
        null,
        null
      ];

      state.usedDice = [
        false,
        false
      ];

      state.rolled = false;

      state.movable = [];

      state.awaitingHuman = false;

      state.selectedDie = 0;


      setStatus(
        COLOR_LABEL[color] +
        " rolled a 6 — roll again!"
      );

      renderSideDice();
      renderBoard();


      if (!currentIsHuman()) {

        setTimeout(
          rollDice,
          750
        );
      }

      return;
    }


    /*
      Normal end of turn.
    */
    state.extraRoll = false;

    state.dice = [
      null,
      null
    ];

    state.usedDice = [
      false,
      false
    ];

    state.rolled = false;

    state.movable = [];

    state.awaitingHuman = false;

    state.selectedDie = 0;


    state.turnIdx =
      (state.turnIdx + 1) %
      state.active.length;


    renderSideDice();
    renderBoard();

    updateTurnUI();


    if (currentIsHuman()) {

      setStatus(
        COLOR_LABEL[currentColor()] +
        "'s turn — roll the dice."
      );

    } else {

      setStatus(
        COLOR_LABEL[currentColor()] +
        " (computer) is thinking..."
      );

      setTimeout(
        rollDice,
        700
      );
    }
  }


  /* ==========================================================
     COMPUTER
  ========================================================== */

  function cpuUseNextDie() {

    if (!state || state.winner) return;

    if (currentIsHuman()) return;


    const color =
      currentColor();


    /*
      Find an unused die with legal moves.
    */
    let chosenDie = -1;
    let possibleMoves = [];


    for (let i = 0; i < 2; i++) {

      if (state.usedDice[i]) {
        continue;
      }

      const moves =
        getMovableTokens(
          color,
          state.dice[i]
        );


      if (moves.length > 0) {

        chosenDie = i;

        possibleMoves = moves;

        break;
      }
    }


    /*
      No remaining move.
    */
    if (chosenDie === -1) {

      for (let i = 0; i < 2; i++) {
        if (!state.usedDice[i]) {
          state.usedDice[i] = true;
        }
      }

      finishDiceAndTurn();

      return;
    }


    state.selectedDie =
      chosenDie;


    /*
      AI move priority:
      1. Finish token
      2. Capture
      3. Bring token out
      4. Move furthest
    */
    let chosenMove =
      possibleMoves.find(
        function (move) {
          return move.to === 56;
        }
      );


    if (!chosenMove) {

      chosenMove =
        possibleMoves.find(
          function (move) {
            return move.capture;
          }
        );
    }


    if (!chosenMove) {

      chosenMove =
        possibleMoves.find(
          function (move) {
            return move.fromYard;
          }
        );
    }


    if (!chosenMove) {

      chosenMove =
        possibleMoves
          .slice()
          .sort(
            function (a, b) {
              return b.to - a.to;
            }
          )[0];
    }


    setStatus(
      COLOR_LABEL[color] +
      " is moving a token..."
    );


    renderBoard();


    setTimeout(
      function () {

        executeMove(
          chosenMove,
          chosenDie
        );

      },
      550
    );
  }


  /* ==========================================================
     UI
  ========================================================== */

  function setStatus(message) {

    const element =
      document.getElementById(
        "statusLine"
      );

    if (element) {
      element.textContent = message;
    }
  }


  function updateTurnUI() {

    if (!state) return;


    const color =
      currentColor();


    const swatch =
      document.getElementById(
        "turnSwatch"
      );

    const text =
      document.getElementById(
        "turnText"
      );

    const tag =
      document.getElementById(
        "turnTag"
      );


    if (swatch) {
      swatch.style.background =
        COLOR_HEX[color];
    }


    if (text) {
      text.textContent =
        COLOR_LABEL[color] +
        "'s turn";
    }


    if (tag) {

      tag.textContent =
        playerLabel(
          state.types[color]
        );
    }
  }


  /* ==========================================================
     SETUP SCREEN
  ========================================================== */

  function defaultAssignments(count) {

    if (count === 2) {

      return {
        red: "p1",
        green: "p2",
        yellow: "p1",
        blue: "p2"
      };
    }


    if (count === 3) {

      return {
        red: "p1",
        green: "p2",
        yellow: "p3",
        blue: "p1"
      };
    }


    return {
      red: "p1",
      green: "p2",
      yellow: "p3",
      blue: "p4"
    };
  }


  function renderPlayerRows() {

    const container =
      document.getElementById(
        "playerRows"
      );

    if (!container) return;


    const assignments =
      defaultAssignments(
        selectedPlayerCount
      );


    container.innerHTML = "";


    COLORS.forEach(function (color) {

      const row =
        document.createElement("div");

      row.className =
        "player-row";


      const left =
        document.createElement("div");

      left.className =
        "player-color";


      const dot =
        document.createElement("span");

      dot.className =
        "dot";

      dot.style.background =
        COLOR_HEX[color];


      const label =
        document.createElement("span");

      label.textContent =
        COLOR_LABEL[color];


      left.appendChild(dot);
      left.appendChild(label);


      const controls =
        document.createElement("div");

      controls.className =
        "toggle";


      for (
        let player = 1;
        player <= selectedPlayerCount;
        player++
      ) {

        const button =
          document.createElement("button");

        button.type = "button";

        button.className =
          "player-choice";

        button.dataset.player =
          "p" + player;

        button.textContent =
          "Player " + player;


        if (
          assignments[color] ===
          "p" + player
        ) {
          button.classList.add("active");
        }


        button.addEventListener(
          "click",
          function () {

            controls
              .querySelectorAll(
                ".player-choice"
              )
              .forEach(
                function (other) {
                  other.classList.remove(
                    "active"
                  );
                }
              );

            button.classList.add(
              "active"
            );

          }
        );


        controls.appendChild(button);
      }


      row.appendChild(left);
      row.appendChild(controls);

      container.appendChild(row);
    });
  }


  function getAssignmentsFromUI() {

    const assignments = {};


    COLORS.forEach(function (color) {

      const row =
        document
          .getElementById("playerRows")
          ?.children[
            COLORS.indexOf(color)
          ];


      if (!row) {
        assignments[color] = "p1";
        return;
      }


      const active =
        row.querySelector(
          ".player-choice.active"
        );


      assignments[color] =
        active
          ? active.dataset.player
          : "p1";
    });


    return assignments;
  }


  function setupPlayerButtons() {

    const row =
      document.getElementById(
        "playerCountRow"
      );

    if (!row) return;


    row.addEventListener(
      "click",
      function (event) {

        const button =
          event.target.closest(
            ".choice-btn"
          );

        if (!button) return;


        const count =
          Number(
            button.dataset.count
          );


        if (
          ![2, 3, 4].includes(count)
        ) {
          return;
        }


        selectedPlayerCount =
          count;


        row
          .querySelectorAll(
            ".choice-btn"
          )
          .forEach(
            function (item) {
              item.classList.toggle(
                "active",
                Number(
                  item.dataset.count
                ) === count
              );
            }
          );


        renderPlayerRows();
      }
    );
  }


  /* ==========================================================
     START GAME
  ========================================================== */

  function startGame() {

    const assignments =
      getAssignmentsFromUI();


    lastAssignments =
      Object.assign(
        {},
        assignments
      );


    state =
      createFreshState(
        assignments
      );


    const setup =
      document.getElementById(
        "setupScreen"
      );

    const game =
      document.getElementById(
        "gameScreen"
      );


    if (setup) {
      setup.classList.add(
        "hidden"
      );
    }


    if (game) {
      game.classList.remove(
        "hidden"
      );
    }


    const overlay =
      document.getElementById(
        "winOverlay"
      );


    if (overlay) {
      overlay.classList.remove(
        "show"
      );
    }


    ensureDiceElements();

    updateTurnUI();

    renderBoard();

    renderLog();


    setStatus(
      COLOR_LABEL[currentColor()] +
      "'s turn — roll the dice."
    );


    addLog(
      "Game started."
    );


    /*
      If first color is controlled by computer,
      start automatically.
    */
    if (!currentIsHuman()) {

      setTimeout(
        rollDice,
        700
      );
    }
  }


  /* ==========================================================
     WIN
  ========================================================== */

  function showWinner(color) {

    const overlay =
      document.getElementById(
        "winOverlay"
      );

    const title =
      document.getElementById(
        "winTitle"
      );


    if (title) {

      title.textContent =
        COLOR_LABEL[color] +
        " wins!";
    }


    if (overlay) {

      overlay.classList.add(
        "show"
      );
    }


    setStatus(
      COLOR_LABEL[color] +
      " has brought all four tokens home!"
    );
  }


  /* ==========================================================
     BACK TO SETUP
  ========================================================== */

  function backToSetup() {

    const game =
      document.getElementById(
        "gameScreen"
      );

    const setup =
      document.getElementById(
        "setupScreen"
      );


    if (game) {
      game.classList.add(
        "hidden"
      );
    }


    if (setup) {
      setup.classList.remove(
        "hidden"
      );
    }


    const overlay =
      document.getElementById(
        "winOverlay"
      );


    if (overlay) {
      overlay.classList.remove(
        "show"
      );
    }


    state = null;

    renderPlayerRows();
  }


  /* ==========================================================
     PLAY AGAIN
  ========================================================== */

  function playAgain() {

    const overlay =
      document.getElementById(
        "winOverlay"
      );


    if (overlay) {
      overlay.classList.remove(
        "show"
      );
    }


    if (
      lastAssignments
    ) {

      state =
        createFreshState(
          lastAssignments
        );


      ensureDiceElements();

      updateTurnUI();

      renderBoard();

      renderLog();


      setStatus(
        COLOR_LABEL[currentColor()] +
        "'s turn — roll the dice."
      );


      addLog(
        "New game started."
      );


      if (!currentIsHuman()) {

        setTimeout(
          rollDice,
          700
        );
      }

      return;
    }


    backToSetup();
  }


  /* ==========================================================
     RULES TOGGLE
  ========================================================== */

  function setupRules() {

    const button =
      document.getElementById(
        "rulesToggle"
      );

    const box =
      document.getElementById(
        "rulesBox"
      );


    if (!button || !box) return;


    button.addEventListener(
      "click",
      function () {

        box.classList.toggle(
          "open"
        );

        button.textContent =
          box.classList.contains("open")
            ? "Hide rules"
            : "How to play";
      }
    );
  }


  /* ==========================================================
     BOARD CLICK HANDLING
  ========================================================== */

  function setupBoardClicks() {

    const board =
      document.getElementById(
        "boardSvg"
      );

    if (!board) return;


    board.addEventListener(
      "click",
      function (event) {

        const target =
          event.target;


        /*
          Center = roll.
        */
        const rollTarget =
          target.closest(
            '[data-action="roll"]'
          );


        if (rollTarget) {

          if (canRoll()) {
            rollDice();
          }

          return;
        }


        /*
          Click a die in the center.
        */
        const dieTarget =
          target.closest(
            '[data-action="select-die"]'
          );


        if (dieTarget) {

          if (!state) return;

          if (!state.rolled) return;

          if (!currentIsHuman()) return;


          const index =
            Number(
              dieTarget.dataset.die
            );


          if (
            index !== 0 &&
            index !== 1
          ) {
            return;
          }


          if (
            state.usedDice[index]
          ) {
            return;
          }


          state.selectedDie =
            index;


          updateSelectedDieMoves();

          state.awaitingHuman =
            state.movable.length > 0;


          if (
            state.movable.length === 0
          ) {

            setStatus(
              "That die cannot make a move."
            );

          } else {

            setStatus(
              "Now tap a highlighted token."
            );
          }


          renderBoard();

          return;
        }


        /*
          Click token.
        */
        const tokenTarget =
          target.closest(
            "[data-token-color]"
          );


        if (tokenTarget) {

          const color =
            tokenTarget.dataset.tokenColor;

          const tokenId =
            Number(
              tokenTarget.dataset.tokenId
            );


          handleTokenClick(
            color,
            tokenId
          );
        }
      }
    );
  }


  /* ==========================================================
     SIDE DICE CLICK
  ========================================================== */

  function setupSideDiceClicks() {

    const container =
      document.getElementById(
        "die"
      );

    if (!container) return;


    container.addEventListener(
      "click",
      function (event) {

        const die =
          event.target.closest(
            ".die"
          );

        if (!die) return;

        if (!state) return;

        if (!state.rolled) return;

        if (!currentIsHuman()) return;


        const index =
          Number(
            die.dataset.die
          );


        if (
          index !== 0 &&
          index !== 1
        ) {
          return;
        }


        if (
          state.usedDice[index]
        ) {
          return;
        }


        state.selectedDie =
          index;


        updateSelectedDieMoves();


        state.awaitingHuman =
          state.movable.length > 0;


        setStatus(
          state.movable.length > 0
            ? "Tap a highlighted token to move."
            : "That die has no legal move."
        );


        renderBoard();

        renderSideDice();
      }
    );
  }


  /* ==========================================================
     BUTTON EVENTS
  ========================================================== */

  function setupButtons() {

    const start =
      document.getElementById(
        "startBtn"
      );

    if (start) {

      start.addEventListener(
        "click",
        startGame
      );
    }


    const roll =
      document.getElementById(
        "rollBtn"
      );

    if (roll) {

      roll.addEventListener(
        "click",
        function () {

          if (canRoll()) {
            rollDice();
          }
        }
      );
    }


    const newGame =
      document.getElementById(
        "newGameBtn"
      );

    if (newGame) {

      newGame.addEventListener(
        "click",
        backToSetup
      );
    }


    const again =
      document.getElementById(
        "playAgainBtn"
      );

    if (again) {

      again.addEventListener(
        "click",
        playAgain
      );
    }
  }


  /* ==========================================================
     INITIALIZE
  ========================================================== */

  function initialize() {

    /*
      Setup player buttons FIRST.
      This is important so 2 / 3 / 4 are immediately
      clickable after refreshing the page.
    */
    setupPlayerButtons();


    /*
      Create the initial player rows.
    */
    renderPlayerRows();


    /*
      Setup all other controls.
    */
    setupButtons();

    setupRules();

    setupBoardClicks();

    setupSideDiceClicks();


    /*
      Start on setup screen.
    */
    const setup =
      document.getElementById(
        "setupScreen"
      );

    const game =
      document.getElementById(
        "gameScreen"
      );


    if (setup) {
      setup.classList.remove(
        "hidden"
      );
    }


    if (game) {
      game.classList.add(
        "hidden"
      );
    }


    const overlay =
      document.getElementById(
        "winOverlay"
      );


    if (overlay) {
      overlay.classList.remove(
        "show"
      );
    }
  }


  /*
    Wait until the HTML is completely loaded.
  */
  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initialize
    );

  } else {

    initialize();
  }

})();
