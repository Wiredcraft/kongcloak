'use strict'

const express = require('express')
const app = express()

const path = require('path')
const indexHTML = path.join(__dirname, 'index.html')

app.get('/', function (req, res) {
  res.sendFile(indexHTML)
})

app.listen(3000)
