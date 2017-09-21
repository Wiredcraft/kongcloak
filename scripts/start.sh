#!/bin/bash

# keycloak credentials
read -p "Keycloak username: " KEYCLOAK_USER
read -p "Keycloak password: " KEYCLOAK_PASSWORD

# flush docker
read -p "Flush docker (y/n): " FLUSH_DOCKER
if echo "$FLUSH_DOCKER" | grep -iq "^y" ;then
  docker stop $(docker ps -a -q) # stop running containers
  docker rm $(docker ps -a -q) # remove containers
  docker rmi $(docker images -q) # remove images
fi

# init cassandra
sudo docker run -d --name kong-database \
  -p 9042:9042 \
  cassandra:3

# prepare cassandra for keycloak
sudo docker run -it --rm \
  --link kong-database:kong-database \
  -e "KONG_DATABASE=cassandra" \
  -e "KONG_CASSANDRA_CONTACT_POINTS=kong-database" \
  kong:latest kong migrations up

# init kong
docker run -d --name kong \
  --link kong-database:kong-database \
  -e "KONG_DATABASE=cassandra" \
  -e "KONG_CASSANDRA_CONTACT_POINTS=kong-database" \
  -p 8000:8000 \
  -p 8443:8443 \
  -p 8001:8001 \
  -p 8444:8444 \
  kong

# init keycloak
docker run \
  -e KEYCLOAK_USER=$KEYCLOAK_USER \
  -e KEYCLOAK_PASSWORD=$KEYCLOAK_PASSWORD \
  --name keycloak \
  -p 8080:8080 \
  jboss/keycloak
