#!/usr/bin/env node

'use strict';

const request = require('request');
const config = require(require('path').join(__dirname, '..', 'kongcloak.json'));

const KEYCLOAK_USERNAME = process.env.KEYCLOAK_USERNAME || 'admin';
const KEYCLOAK_PASSWORD = process.env.KEYCLOAK_PASSWORD || 'admin';
const KEYCLOAK_HOST     = process.env.KEYCLOAK_HOST || 'localhost:8080';
const KONG_HOST         = process.env.KONG_HOST || 'localhost:8001';

var token;         // keycloak admin token
var publicKey;     // keycloak realm public key
var keycloak = {}; // keycloak namespace
var kong = {};     // kong namespace

keycloak.getAdminToken = function(cb) {
  request({
    url: `http://${KEYCLOAK_HOST}/auth/realms/master/protocol/openid-connect/token`,
    method: 'POST',
    form: {
      grant_type: 'password',
      client_id: 'admin-cli',
      username: KEYCLOAK_USERNAME,
      password: KEYCLOAK_PASSWORD
    }
  }, function(err, res, body) {
    if (err) throw err;
    token = JSON.parse(body).access_token;
    console.log('received keycloak admin token: ' + res.statusCode);
    cb();
  });
};

keycloak.setupRealm = function(cb) {
  request({
    url: `http://${KEYCLOAK_HOST}/auth/admin/realms`,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    json: true,
    body: config.keycloakRealm
  }, function(err, res, body) {
    if (err) throw err;
    console.log('setup keycloak realm complete: ' + res.statusCode);
    cb();
  });
};

keycloak.getPublicKey = function(cb) {
  request({
    url: `http://${KEYCLOAK_HOST}/auth/admin/realms/${config.keycloakRealm.realm}/keys`,
    headers: { 'Authorization': `Bearer ${token}` }
  }, function(err, res, body) {
    if (err) throw err;
    publicKey = `-----BEGIN PUBLIC KEY-----\n${JSON.parse(body).keys[0].publicKey}\n-----END PUBLIC KEY-----`;
    console.log('retrieved keycloak realm public key: ' + res.statusCode);
    cb();
  });
};

kong.createConsumers = function(cb) {
  each(config.kongConsumers, function(consumer, next) {
    request({
      url: `http://${KONG_HOST}/consumers`,
      method: 'POST',
      form: { username: consumer.username }
    }, function(err, res, body) {
      if (err) throw err;
      console.log('consumer created: ' + res.statusCode);
      if (!consumer.plugins) return next();
      each(consumer.plugins, function(plugin, innerNext) {
        if (plugin.name === 'jwt' && !plugin.config) {
          request({
            url: `http://${KONG_HOST}/consumers/${consumer.username}/jwt`,
            method: 'POST',
            form: {
              key: `http://${KEYCLOAK_HOST}/auth/realms/${config.keycloakRealm.realm}`,
              algorithm: 'RS256',
              rsa_public_key: publicKey
            }
          }, function(err, res, body) {
            if (err) throw err;
            console.log('consumer plugin added: ' + res.statusCode);
            innerNext();
          });
        } else {
          request({
            url: `http://${KONG_HOST}/consumers/${consumer.username}/${plugin.name}`,
            method: 'POST',
            form: plugin.config
          }, function(err, res, body) {
            if (err) throw err;
            console.log('consumer plugin added: ' + res.statusCode);
            innerNext();
          });
        }
      }, next);
    });
  }, cb);
};

kong.declareEndpoints = function(cb) {
  each(config.kongEndpoints, function(endpoint, next) {
    let plugins = endpoint.plugins;
    delete endpoint.plugins;
    for (let key in endpoint) {
      if (Array.isArray(endpoint[key]))
        endpoint[key] = endpoint[key].join(', ');
    }
    request({
      url: `http://${KONG_HOST}/apis/`,
      method: 'POST',
      form: endpoint
    }, function(err, res, body) {
      if (err) throw err;
      console.log('endpoint declared: ' + res.statusCode);
      if (!plugins) return next();
      each(plugins, function(plugin, innerNext) {
        if (plugin.config) {
          for (let key in plugin.config) {
            if (Array.isArray(plugin.config[key]))
              plugin.config[key] = plugin.config[key].join(', ');
          }
        }
        request({
          url: `http://${KONG_HOST}/apis/${endpoint.name}/plugins`,
          method: 'POST',
          form: plugin
        }, function(err, res, body) {
          if (err) throw err;
          console.log('api plugin added: ' + res.statusCode);
          innerNext();
        });
      }, next);
    });
  }, cb);
};

keycloak.getAdminToken(() => {
  keycloak.setupRealm(() => {
    keycloak.getPublicKey(() => {
      kong.createConsumers(() => {
        kong.declareEndpoints(() => {
          console.log('done');
          process.exit(0);
        });
      });
    });
  });
});

function each(items, task, cb) {
  var idx = 0;
  var len = items.length;
  iter();
  function iter() {
    task(items[idx++], function() { idx >= len ? cb() : iter(); });
  }
}
