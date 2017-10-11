#!/bin/bash
set -ev

# keycloak credentials
KEYCLOAK_USERNAME=${KEYCLOAK_USERNAME:-admin}
KEYCLOAK_PASSWORD=${KEYCLOAK_PASSWORD:-admin}

# flush docker
docker stop $(docker ps -a -q) # stop running containers
docker rm $(docker ps -a -q) # remove containers
#docker rmi $(docker images -q) # remove images

# init postgress as kong db
docker run -d --name kong-database \
  -p 5432:5432 \
  -e "POSTGRES_USER=kong" \
  -e "POSTGRES_DB=kong" \
  postgres:9.4

sleep 5

# run db migrations
docker run --rm \
  --link kong-database:kong-database \
  -e "KONG_DATABASE=postgres" \
  -e "KONG_PG_HOST=kong-database" \
  kong:latest kong migrations up

# init kong
docker run -d --name kong \
  --link kong-database:kong-database \
  -e "KONG_DATABASE=postgres" \
  -e "KONG_PG_HOST=kong-database" \
  -p 8000:8000 \
  -p 8443:8443 \
  -p 8001:8001 \
  -p 8444:8444 \
  kong

# init keycloak
docker run \
  -e KEYCLOAK_USER=$KEYCLOAK_USERNAME \
  -e KEYCLOAK_PASSWORD=$KEYCLOAK_PASSWORD \
  --name keycloak \
  -p 8080:8080 \
  jboss/keycloak
