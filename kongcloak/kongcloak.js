'use strict'

const request = require('request')

var configJSON = './kongcloak.json'
var config = require(configJSON)
var token
var publicKey
var keycloak = {}
var kong = {}

keycloak.getAdminToken = function (cb) {
  request({
    url: 'http://localhost:8080/auth/realms/master/protocol/openid-connect/token',
    method: 'POST',
    form: {
      grant_type: 'password',
      client_id: 'admin-cli',
      username: config.keycloak.credentials.username,
      password: config.keycloak.credentials.password
    }
  }, function (err, res, body) {
    if (err) throw err
    token = JSON.parse(body).access_token
    console.log('received keycloak admin token')
    cb()
  })
}

keycloak.setup = function (cb) {
  var realm = config.keycloak.realm
  request({
    url: 'http://localhost:8080/auth/admin/realms',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    json: true,
    body: {
      realm: realm.name,
      enabled: true,
      registrationAllowed: realm.registrationAllowed,
      sslRequired: 'external',
      requiredCredentials: ['password'],
      users: realm.users.map(user => (
        {
          username: user.username,
          enabled: true,
          credentials: [{ type: 'password', value: user.password }],
          realmRoles: user.roles
        }
      )),
      roles: { realm: realm.roles },
      clients: realm.clients.map(client => (
        {
          clientId: client.name,
          enabled: true,
          publicClient: true,
          redirectUris: client.redirects,
          webOrigins: client.origins
        }
      ))
    }
  }, function (err, res, body) {
    if (err) throw err
    console.log('setup keycloak realm complete')
    cb()
  })
}

keycloak.getPublicKey = function (cb) {
  request({
    url: `http://localhost:8080/auth/admin/realms/${config.keycloak.realm.name}/keys`,
    headers: { 'Authorization': `Bearer ${token}` }
  }, function (err, res, body) {
    if (err) throw err
    publicKey = `-----BEGIN PUBLIC KEY-----\n${JSON.parse(body).keys[0].publicKey}\n-----END PUBLIC KEY-----`
    console.log('retrieved keycloak realm public key')
    cb()
  })
}

kong.createConsumer = function (cb) {
  request({
    url: 'http://localhost:8001/consumers',
    method: 'POST',
    form: { username: config.kong.consumer }
  }, function (err, res, body) {
    if (err) throw err
    console.log('consumer created')
    request({
      url: `http://localhost:8001/consumers/${config.kong.consumer}/jwt`,
      method: 'POST',
      form: {
        key: `http://localhost:8080/auth/realms/${config.keycloak.realm.name}`,
        algorithm: 'RS256',
        rsa_public_key: publicKey
      }
    }, function (err, res, body) {
      if (err) throw err
      console.log('consumer jwt plugin added')
      cb()
    })
  })
}

kong.declare = function (cb) {
  each(
    config.kong.endpoints,
    function (endpoint, next) {
      request({
        url: 'http://localhost:8001/apis/',
        method: 'POST',
        form: {
          name: endpoint.name,
          upstream_url: endpoint.url,
          uris: endpoint.route
        }
      }, function (err, res, body) {
        if (err) throw err
        console.log('endpoint declared')
        if (endpoint.jwt) {
          request({
            url: `http://localhost:8001/apis/${endpoint.name}/plugins`,
            method: 'POST',
            form: {
              name: 'jwt'
            }
          }, function (err, res, body) {
            if (err) throw err
            console.log('api jwt plugin added')
            if (endpoint.cors) {
              request({
                url: `http://localhost:8001/apis/${endpoint.name}/plugins`,
                method: 'POST',
                form: {
                  name: 'cors',
                  config: {
                    origins: endpoint.cors.origins.join(', '),
                    methods: endpoint.cors.methods.join(', '),
                    headers: endpoint.cors.headers.join(', '),
                    exposed_headers: endpoint.cors.exposedHeaders.join(', '),
                    credentials: endpoint.cors.credentials,
                    max_age: endpoint.cors.maxAge
                  }
                }
              }, function (err, res, body) {
                if (err) throw err
                console.log('api cors plugin added')
                next()
              })
            } else {
              next()
            }
          })
        } else {
          if (endpoint.cors) {
            request({
              url: `http://localhost:8001/apis/${endpoint.name}/plugins`,
              method: 'POST',
              form: {
                name: 'cors',
                origins: endpoint.cors.origins.join(', '),
                methods: endpoint.cors.methods.join(', '),
                headers: endpoint.cors.headers.join(', '),
                exposed_headers: endpoint.cors.exposedHeaders.join(', '),
                credentials: endpoint.cors.credentials,
                max_age: endpoint.cors.maxAge
              }
            }, function (err, res, body) {
              if (err) throw err
              console.log('api cors plugin added')
              next()
            })
          } else {
            next()
          }
        }
      })
    },
    cb
  )
}

function main () {
  keycloak.getAdminToken(() => {
    keycloak.setup(() => {
      keycloak.getPublicKey(() => {
        kong.createConsumer(() => {
          kong.declare(() => {
              console.log('done')
          })
        })
      })
    })
  })
}

main()

function each (items, task, cb) {
  var idx = 0
  var len = items.length
  iter()
  function iter () {
    task(items[idx++], function (out) { idx >= len ? cb() : iter() })
  }
}
