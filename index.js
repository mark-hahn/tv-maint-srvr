// const express = require('node_modules/express/index.js');
import express from 'express';
const app = new express();

app.get('/', function (req, res) {
  res.send('hello world')
})

app.listen(8734, () => {
  console.log(`Example app listening at http://localhost:${8734}`)
})