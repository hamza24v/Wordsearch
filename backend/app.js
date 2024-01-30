const PUZZLE_FILE_NAME =  process.argv[2]
const PORT = process.argv[3] || 3000;
const HOST = process.argv[4] || 'localhost';
const DEBUG = 1;
const NOT_BEING_USED = -1;
const ERROR = -1;
const SUCCESS = 0;

// Load Modules
const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require('socket.io');
const url = require('url');
const path = require("path");
const fs = require("fs");
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'))
})
// Create a socket.io server that can receive connections from clients that did 
// not load from this server.
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

let theme = "";
let nrows = 0;
let ncols = 0;
let nwords = 0;
let remainingWords = 0;
let gridletters = "";
let playerNumber = 0;

// Create a Globally Unique ID to identify a player
function getGUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

class Player {
  constructor(login, ipaddr) {
    this.name = login;
    this.id = getGUID();
    this.score = 0;
    this.winner = false;
    this.ipaddr = ipaddr;
  }
}

class PlayerList {
  constructor() {
    this.players = [];
    this.ids = {};
    this.unames = {};
  }

  add(player) {
    this.players.push(player);
    this.ids[player.id] = player;
    this.unames[player.name] = player;
    return player.id;
  }

  updateScore(id, pts) {
    this.ids[id].score += pts;
  }

  length() {
    return this.players.length;
  }

  idOnList(id) {
    return !(typeof this.ids[id] === "undefined");
  }

  nameOnList(uname) {
    return !(typeof this.unames[uname] === "undefined");
  }

  getPlayer(id) {
    return this.ids[id];
  }

  getPlayerName(id) {
    if (this.idOnList(id))
      return this.getPlayer(id).name;
    else 
      return "";
  }

  setWinner() {
    var hi = -1;
    var winner = -1;
    this.players.forEach((player, index, array) => {
      if (player.score > hi) {
        hi = player.score;
        winner = index;
      }
    });
    if (winner > -1) {
      this.players.forEach((player, index, array) => {
        if (index === winner)
          player.winner = true;
        else
          player.winner = false;
      });
    }
  }  
}

let players = new PlayerList();
let playerListChanged = false;

function processLogin(uname) {
  // Remove anything but letters and digits from the user name
  let filteredName = uname.replace(/[^a-zA-Z0-9 ]/g, "");
  if (filteredName.trim().length <= 0) {
    console.log(`Login: Empty name rejected. (${uname})`);
    return "";
  } else {
    if (filteredName.length > 20) {
      filteredName = filteredName.substring(0, 21);
    }
    // Add enough * to make the user name unique
    while (players.nameOnList(filteredName)) {
      filteredName = filteredName + "*";
    }
    const id = players.add(new Player(filteredName));
    const index = players.length();
  
    // Create result object to send back to the user.
    const ret = {};
    ret.success = true;
    ret.id = id;
    ret.username = players.getPlayerName(id);

    console.log(`New login ${JSON.stringify(ret)}`);
    // Flag to indicate when the player list needs to be sent to the clients
    playerListChanged = true;
    return ret;
  }
}

function processPuzzle(id) {
  if (players.idOnList(id)) {
    // Found the player id - success
    const ret = {};
    ret.success = true;
    ret.theme = theme;
    ret.nrows = nrows;
    ret.ncols = ncols;
    ret.grid = gridletters;
    return ret;
  } else {
    // Player id not found - failure
    const ret = {};
    ret.success = false;
    ret.theme = "INVALID ID";
    ret.nrows = 0;
    ret.ncols = 0;
    ret.grid = "";
    return ret;
  }
}

let currentUpdates = [];
let accumulatedUpdates = [];
let colorn = 0;

function processSubmit(id, pairs) {

  function grabLetters(list) { 
    let letts = "";

    function getLetter(r, c) {
      let index = r * ncols + c; return gridletters.charAt(index)
    }

    // Calculate the min and max row and column for the word and collect the 
    // letters.
    let minr = minc = 5000;
    let maxr = maxc = -1;
    list.forEach((pair, index, array) => {
      let row = parseInt(pair.r);
      let col = parseInt(pair.c);
      minr = Math.min(minr, row);
      minc = Math.min(minc, col);
      maxr = Math.max(maxr, row);
      maxc = Math.max(maxc, col);
      let ll = getLetter(row, col);
      letts += ll
    });

    //console.log(`minr=${minr} minc=${minc} maxr=${maxr} maxc=${maxc} letts=${letts}`);

    // Return the letters if the word consists of contiguous letters in either the horizontal, 
    // vertical or diagonal.
    if ((maxr - minr == 0 && maxc - minc == letts.length - 1) || // Word is horizontal
        (maxc - minc == 0 && maxr - minr == letts.length - 1) || // Word is vertical
        (maxr - minr == letts.length - 1 && maxc - minc == letts.length - 1)) // Word is diagonal
      return letts;
    else
      return "";
  }

  let wd = grabLetters(pairs);
  if (wd == "") return false;

  let swd = sortString(wd);
  if (words[swd] == 1) {
    if (swd != "HPQRX")
      words[swd] = 2;
    let newwd = { text: wd, letters: pairs, color:colors[colorn++ % 140].hex}
    currentUpdates.push(newwd);
    accumulatedUpdates.push(newwd);
    players.updateScore(id, wd.length);
    playerListChanged = true;
    //if (--remainingWords <= 0)
      players.setWinner();
    return true;
  } else {
      return false;
  }
}

function updateGrid() {
  io.sockets.emit("gridupdates", { words: currentUpdates });
}

function updatePlayers() {
  io.sockets.emit("players", players.players);
  let p = players.players;
  for (let i=0; i < p.length; ++i) {
    console.log(`${p[i].name} ${p[i].score}`);
  }
}

// Send all the grid updates from the beginning of the game to all the users.
function fullUpdate() {
  io.sockets.emit("gridupdates", { words: accumulatedUpdates });
}

function doUpdates() {
  // Send the player list to all the users if it has changed.
  if (playerListChanged) {
    playerListChanged = false;
    updatePlayers();
  }
  // Send grid updates to all the users if new words have been found since the last time
  // the updates were sent
  if (currentUpdates.length > 0) {
    updateGrid();
    currentUpdates = [];
  }
}

function reset() {
  players = new PlayerList();
  playerListChanged = true;
  currentUpdates = [];
  accumulatedUpdates = [];
}

// Do a partial update every second and a complete update every 3 seconds.
setInterval(doUpdates, 1000);
setInterval(fullUpdate, 3000);
//setInterval(reset, 120000);

var words = {};

// Split the string into an array of letters, sort the letters and convert back into a string.
function sortString(s) {
  return s.split('').sort().join('');
}

function loadPuzzle() {
  let file = fs.readFileSync(PUZZLE_FILE_NAME, { encoding: 'utf-8' });
  //console.log(file);
  let lines = file.split('\n');
  theme = lines[0];
  nrows = parseInt(lines[1]);
  ncols = parseInt(lines[2]);
  nwords = parseInt(lines[3]);
  remainingWords = nwords;
  for (let i = 4; i < 4 + nwords; ++i) {
      words[sortString(lines[i])] = 1;
  }
  gridletters = lines[nwords + 4];
  console.log(`Loaded puzzle: theme=${theme}`)
}

server.listen(PORT, HOST, () => {
  loadPuzzle();
  console.log(`Wordsearch Server running at http://${HOST}:${PORT}/`);
});

const FAILED = { success: false };


// Receive connection requests and setup event listeners for that particular user
io.on('connection', (socket) => {

  console.log('a user connected');

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on("login", (msg) => {
    const uname = msg.username;
    if (typeof uname == 'undefined') {
      socket.emit("login", FAILED);
    } else {
      const ret = processLogin(uname);
      socket.emit("login", ret);
    }
  });

  socket.on("puzzle", (msg) => {
    const id = msg.id;
    if (typeof id == 'undefined') {
      socket.emit("puzzle", FAILED);
    } else {
      const ret = processPuzzle(id);
      socket.emit("puzzle", ret);
    }
  });

  socket.on("submit", (msg) => {
    const id = msg.id;
    const letters = msg.letters;
    console.log("letters= " + JSON.stringify(letters) + " " + typeof(letters) + " % " + (letters instanceof Array) + " %");
  
    if (typeof id == 'undefined' || typeof letters == 'undefined') {
      socket.emit("submit", FAILED);
    } else {
      const ret = processSubmit(id, letters);
      console.log(`Submission from ${id}= ${ret}`); 
      socket.emit("submit", { success: ret });
    }
  });

  socket.on("chatsend", (msg) => {
    const playerid = msg.id;
    const message = msg.msg;
    const name = players.getPlayerName(playerid);
    const response = { msg: `${name}: ${message}`}
    io.emit("chatbroadcast", response)
  });
    
});


// These are all the standard HTML colors
const colors = 
[{name:'AliceBlue',hex:'#F0F8FF'},
{name:'AntiqueWhite',hex:'#FAEBD7'},
{name:'Aqua',hex:'#00FFFF'},
{name:'Aquamarine',hex:'#7FFFD4'},
{name:'Azure',hex:'#F0FFFF'},
{name:'Beige',hex:'#F5F5DC'},
{name:'Bisque',hex:'#FFE4C4'},
{name:'Black',hex:'#000000'},
{name:'BlanchedAlmond',hex:'#FFEBCD'},
{name:'Blue',hex:'#0000FF'},
{name:'BlueViolet',hex:'#8A2BE2'},
{name:'Brown',hex:'#A52A2A'},
{name:'BurlyWood',hex:'#DEB887'},
{name:'CadetBlue',hex:'#5F9EA0'},
{name:'Chartreuse',hex:'#7FFF00'},
{name:'Chocolate',hex:'#D2691E'},
{name:'Coral',hex:'#FF7F50'},
{name:'CornflowerBlue',hex:'#6495ED'},
{name:'Cornsilk',hex:'#FFF8DC'},
{name:'Crimson',hex:'#DC143C'},
{name:'Cyan',hex:'#00FFFF'},
{name:'DarkBlue',hex:'#00008B'},
{name:'DarkCyan',hex:'#008B8B'},
{name:'DarkGoldenRod',hex:'#B8860B'},
{name:'DarkGrey',hex:'#A9A9A9'},
{name:'DarkGreen',hex:'#006400'},
{name:'DarkKhaki',hex:'#BDB76B'},
{name:'DarkMagenta',hex:'#8B008B'},
{name:'DarkOliveGreen',hex:'#556B2F'},
{name:'Darkorange',hex:'#FF8C00'},
{name:'DarkOrchid',hex:'#9932CC'},
{name:'DarkRed',hex:'#8B0000'},
{name:'DarkSalmon',hex:'#E9967A'},
{name:'DarkSeaGreen',hex:'#8FBC8F'},
{name:'DarkSlateBlue',hex:'#483D8B'},
{name:'DarkSlateGrey',hex:'#2F4F4F'},
{name:'DarkTurquoise',hex:'#00CED1'},
{name:'DarkViolet',hex:'#9400D3'},
{name:'DeepPink',hex:'#FF1493'},
{name:'DeepSkyBlue',hex:'#00BFFF'},
{name:'DimGray',hex:'#696969'},
{name:'DodgerBlue',hex:'#1E90FF'},
{name:'FireBrick',hex:'#B22222'},
{name:'FloralWhite',hex:'#FFFAF0'},
{name:'ForestGreen',hex:'#228B22'},
{name:'Fuchsia',hex:'#FF00FF'},
{name:'Gainsboro',hex:'#DCDCDC'},
{name:'GhostWhite',hex:'#F8F8FF'},
{name:'Gold',hex:'#FFD700'},
{name:'GoldenRod',hex:'#DAA520'},
{name:'Grey',hex:'#808080'},
{name:'Green',hex:'#008000'},
{name:'GreenYellow',hex:'#ADFF2F'},
{name:'HoneyDew',hex:'#F0FFF0'},
{name:'HotPink',hex:'#FF69B4'},
{name:'IndianRed',hex:'#CD5C5C'},
{name:'Indigo',hex:'#4B0082'},
{name:'Ivory',hex:'#FFFFF0'},
{name:'Khaki',hex:'#F0E68C'},
{name:'Lavender',hex:'#E6E6FA'},
{name:'LavenderBlush',hex:'#FFF0F5'},
{name:'LawnGreen',hex:'#7CFC00'},
{name:'LemonChiffon',hex:'#FFFACD'},
{name:'LightBlue',hex:'#ADD8E6'},
{name:'LightCoral',hex:'#F08080'},
{name:'LightCyan',hex:'#E0FFFF'},
{name:'LightGoldenRodYellow',hex:'#FAFAD2'},
{name:'LightGrey',hex:'#D3D3D3'},
{name:'LightGreen',hex:'#90EE90'},
{name:'LightPink',hex:'#FFB6C1'},
{name:'LightSalmon',hex:'#FFA07A'},
{name:'LightSeaGreen',hex:'#20B2AA'},
{name:'LightSkyBlue',hex:'#87CEFA'},
{name:'LightSlateGrey',hex:'#778899'},
{name:'LightSteelBlue',hex:'#B0C4DE'},
{name:'LightYellow',hex:'#FFFFE0'},
{name:'Lime',hex:'#00FF00'},
{name:'LimeGreen',hex:'#32CD32'},
{name:'Linen',hex:'#FAF0E6'},
{name:'Magenta',hex:'#FF00FF'},
{name:'Maroon',hex:'#800000'},
{name:'MediumAquaMarine',hex:'#66CDAA'},
{name:'MediumBlue',hex:'#0000CD'},
{name:'MediumOrchid',hex:'#BA55D3'},
{name:'MediumPurple',hex:'#9370D8'},
{name:'MediumSeaGreen',hex:'#3CB371'},
{name:'MediumSlateBlue',hex:'#7B68EE'},
{name:'MediumSpringGreen',hex:'#00FA9A'},
{name:'MediumTurquoise',hex:'#48D1CC'},
{name:'MediumVioletRed',hex:'#C71585'},
{name:'MidnightBlue',hex:'#191970'},
{name:'MintCream',hex:'#F5FFFA'},
{name:'MistyRose',hex:'#FFE4E1'},
{name:'Moccasin',hex:'#FFE4B5'},
{name:'NavajoWhite',hex:'#FFDEAD'},
{name:'Navy',hex:'#000080'},
{name:'OldLace',hex:'#FDF5E6'},
{name:'Olive',hex:'#808000'},
{name:'OliveDrab',hex:'#6B8E23'},
{name:'Orange',hex:'#FFA500'},
{name:'OrangeRed',hex:'#FF4500'},
{name:'Orchid',hex:'#DA70D6'},
{name:'PaleGoldenRod',hex:'#EEE8AA'},
{name:'PaleGreen',hex:'#98FB98'},
{name:'PaleTurquoise',hex:'#AFEEEE'},
{name:'PaleVioletRed',hex:'#D87093'},
{name:'PapayaWhip',hex:'#FFEFD5'},
{name:'PeachPuff',hex:'#FFDAB9'},
{name:'Peru',hex:'#CD853F'},
{name:'Pink',hex:'#FFC0CB'},
{name:'Plum',hex:'#DDA0DD'},
{name:'PowderBlue',hex:'#B0E0E6'},
{name:'Purple',hex:'#800080'},
{name:'Red',hex:'#FF0000'},
{name:'RosyBrown',hex:'#BC8F8F'},
{name:'RoyalBlue',hex:'#4169E1'},
{name:'SaddleBrown',hex:'#8B4513'},
{name:'Salmon',hex:'#FA8072'},
{name:'SandyBrown',hex:'#F4A460'},
{name:'SeaGreen',hex:'#2E8B57'},
{name:'SeaShell',hex:'#FFF5EE'},
{name:'Sienna',hex:'#A0522D'},
{name:'Silver',hex:'#C0C0C0'},
{name:'SkyBlue',hex:'#87CEEB'},
{name:'SlateBlue',hex:'#6A5ACD'},
{name:'SlateGrey',hex:'#708090'},
{name:'Snow',hex:'#FFFAFA'},
{name:'SpringGreen',hex:'#00FF7F'},
{name:'SteelBlue',hex:'#4682B4'},
{name:'Tan',hex:'#D2B48C'},
{name:'Teal',hex:'#008080'},
{name:'Thistle',hex:'#D8BFD8'},
{name:'Tomato',hex:'#FF6347'},
{name:'Turquoise',hex:'#40E0D0'},
{name:'Violet',hex:'#EE82EE'},
{name:'Wheat',hex:'#F5DEB3'},
{name:'White',hex:'#FFFFFF'},
{name:'WhiteSmoke',hex:'#F5F5F5'},
{name:'Yellow',hex:'#FFFF00'},
{name:'YellowGreen',hex:'#9ACD32'}];
