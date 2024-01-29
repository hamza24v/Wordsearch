$(() => {
    var isTableLoaded = false;
    var myId;
    const SERVER = 'http://cupid.cse.lehigh.edu:4041';
    var myusername;
    var isLoggedIn = false;
    var clickedLetters = [];
    var alreadyClicked = {};  // used to store letter ids as key. will be used to prevent duplicate cells from being push in clickeLetters
  
  
    function eventHandlers() {
      $("#login").click(() => {
        if (!isLoggedIn) // to avoid grid table duplication
          login($('#username').val());
        $('#username').val('')
  
      });
      $("#send").click(() => {
        console.log("send clicked: " + JSON.stringify($("#chat").val()))
        if (!isLoggedIn) {
          alert("Must be logged in to chat")
          return;
        }
        send("chatsend", { id: myId, msg: $("#chat").val() })
        $("#chat").val('')
      });
  
  
      $("#submit").click(() => {
        if (!isLoggedIn) {
          alert("Must be logged in to chat")
          return;
        }
        handleWordSubmission();
      });
      $("body").on('keydown', (event) => {
        if (event.key === 'Enter') {
          if (!isLoggedIn) {
            alert("Must be logged in to chat")
            return;
          }
          event.preventDefault();
          handleWordSubmission();
        }
  
      })
    }
  
    function handleLetterClicks() { //called only when table is table loaded
      $("#grid td").click((event) => {
        let id = $(event.target).attr('id') //format of id is row_index,col_index
        const rowcol = id.split(",")
        const row = parseInt(rowcol[0])
        const col = parseInt(rowcol[1])
        const letter = { r: row, c: col }
        console.log(letter)
        if (!(id in alreadyClicked)) {
          clickedLetters.push(letter);
          alreadyClicked[id] = 0; //0 is a dummy value
          $(event.target).css("border", "2px solid black")
        }
        else { // remove letter
          clickedLetters = clickedLetters.filter(element => element.r != letter.r && element.c != letter.c)
          delete alreadyClicked[id]; //delete the id mapping
          $(event.target).css("border", "")
        }
        console.log("clicked letters: " + JSON.stringify(clickedLetters))
        console.log(JSON.stringify(alreadyClicked))
      });
    }
  
    function handleWordSubmission() {
      send("submit", { id: myId, letters: clickedLetters });
      $('#grid td').css("border", "") //resets css on td
    }
  
  
    function send(event, params) {
      socket.emit(event, params);
    }
  
    function login(username) {
      myusername = username
      if (myusername == '') {
        alert("Please enter username...")
        return;
      }
      send("login", { username: myusername })
  
    }
  
  
  
    function loadPlayers(players) {
      $('#leaders').empty();
      if (isLoggedIn) {
        console.log("leader being updated")
        players.sort((a, b) => {
          return b.score - a.score;
        }); //sorts scores
        var count = 1;
        players.forEach((player) => {
          if (player.winner) {
            $('#leaders').append($(`<tr style="
          display:flex; width: 100%; background-color: gold; justify-content:space-between;">
          <td class="letter">${count++}. ${player.name}</td><td class="letter">${player.score}</td></tr>\n`))
          }
          else {
            $('#leaders').append($(`<tr style="
          display:flex; width: 100%; justify-content:space-between;">
          <td class="letter">${count++}. ${player.name}</td><td class="letter">${player.score}</td></tr>\n`))
          }
  
        });
      }
    }
  
    function loadThemeAndGrid(puzzle) {
      if (!puzzle.success) {
        alert("Error loading puzzle");
        return;
      }
      // display theme
      let theme = JSON.stringify(puzzle.theme)
      theme = theme.replace(/["']/g, "");
      $('#theme').append(theme);
  
      //displaying grid
      var letters = puzzle.grid;
      var row_nums = puzzle.nrows;
      var col_nums = puzzle.ncols;
      var index = 0;
      var row_index = 0;
      var col_index = 0;
      for (let i = 0; i < row_nums; i++) {
        var row = '<tr>'
        for (let i = 0; i < col_nums; i++) { // used a comma in to split the row and col 
          var col = `<td id="${String(row_index) + "," + String(col_index++)}" style="padding:5px; font-size: 22px">` + letters.charAt(index++) + '</td>';
          row += col;
        }
        row += '</tr>'
        row_index++;
        col_index = 0; //reset to zero
        $('#grid').append(row);
      }
      isTableLoaded = true;
      handleLetterClicks();
    }
  
    function loadGridUpdates(words) {
      if (isTableLoaded) {
        words.forEach((word) => {
          let table = $('#grid')[0]; // allows table indexing 
          var color = word.color
          for (let i = 0; i < word.letters.length; i++) {
            const row = word.letters[i].r;
            const col = word.letters[i].c;
            
            table.rows[row].cells[col].style.backgroundColor = color;
          }
  
        })
      }
    }
  
    function checkWordValidity(result) {
      if (!result.success) {
        console.log("Word is invalid try again")
        clickedLetters = [];
        alreadyClicked = {}
      }
      else {
        console.log("Excellent!")
      }
    }
  
    function loadPuzzle(user) {
      send("puzzle", user)
    }
  
    function broadcastMessage(msg) {
      msgg = msg.split("\"")
      $('#messages').append($('<li>').text(msgg[1]));
    }
  
    // Returns true if color is dark enough to set the text color to white
    function isDark(color) {
      const c = color.substring(1);  // strip #
      const rgb = parseInt(c, 16);   // convert rrggbb to decimal
      const r = (rgb >> 16) & 0xff;  // extract red
      const g = (rgb >> 8) & 0xff;  // extract green
      const b = (rgb >> 0) & 0xff;  // extract blue
      var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b; // per ITU-R BT.709
      return luma < 128;
    }
  
  
    const socket = io.connect(SERVER);
    eventHandlers();
  
    socket.on("login", (user) => {
      if (!user.success) {
        alert("User not valid")
        return;
      }
      isLoggedIn = true;
      myId = user.id;
      $('#loginEntry').empty()
      $('#loginEntry').append(`<h2 style="margin-top:10px; margin-bottom:10px">Welcome ${user.username}!</h2>`)
      loadPuzzle(user)
    })
  
    socket.on("puzzle", (puzz) => {
      loadThemeAndGrid(puzz);
    })
  
    socket.on('gridupdates', (words) => {
      loadGridUpdates(words.words);
    })
  
    socket.on("players", (players) => {
      loadPlayers(players);
    })
  
    socket.on("submit", (result) => {
      checkWordValidity(result);
    })
  
    socket.on("chatbroadcast", (msg) => {
      broadcastMessage(JSON.stringify(msg.msg));
    })
  });
  
  
  