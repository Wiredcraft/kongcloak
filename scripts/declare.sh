#!/bin/bash

read -p "API name: " API_NAME
read -p "Upstream URL: " API_UPSTREAM_URL # eg. http://192.168.1.132:3001/data
read -p "API URI(s): " API_URIS
read -p "Origin(s): " ORIGINS # eg. http://localhost:3000/*

# register API
curl -i -X POST \
  --url http://localhost:8001/apis/ \
  --data "name=$API_NAME" \
  --data "upstream_url=$API_UPSTREAM_URL" \
  --data "uris=$API_URIS"

# add jwt plugin
curl -X POST http://localhost:8001/apis/$API_NAME/plugins --data "name=jwt"

# add cors plugin
curl -X POST http://localhost:8001/apis/$API_NAME/plugins \
  --data "name=cors" \
  --data "config.origins=$ORIGINS" \
  --data "config.methods=GET" \
  --data "config.headers=Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, Authorization" \
  --data "config.exposed_headers=Authorization" \
  --data "config.credentials=true" \
  --data "config.max_age=3600"
