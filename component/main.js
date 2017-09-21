'use strict'

const express = require('express')
const jwt = require('jsonwebtoken')

const app = express()

app.get('/data', function (req, res) {
  if (!req.headers['authorization']) return res.end()
  let encToken = req.headers['authorization'].replace(/Bearer\s/, '')
  let decToken = jwt.decode(encToken)
  let clientAccess = decToken.resource_access['demo-client']
  if (clientAccess && clientAccess.roles.includes('subscribed'))
    res.json(['cat', 'dog', 'cow'])
  else
    res.json([])
})

app.listen(3001)
