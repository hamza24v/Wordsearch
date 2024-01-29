const express = require("express");
const path = require("path");
const app = express();

const publicPath = path.resolve(__dirname);
app.use(express.static(publicPath));

app.use(function(req, res) {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Invalid Request.");
});


app.listen(3000);