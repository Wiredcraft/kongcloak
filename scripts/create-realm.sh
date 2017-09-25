#!/bin/bash

read -p "Realm name: " REALM_NAME
read -p "Keycloak admin username: " USERNAME
read -p "Keycloak admin password: " PASSWORD

# authenticate admin
AUTH_RESULT=`curl --data "grant_type=password&client_id=admin-cli&username=$USERNAME&password=$PASSWORD" http://localhost:8080/auth/realms/master/protocol/openid-connect/token`
AUTH_TOKEN=`echo $AUTH_RESULT | sed 's/.*access_token":"//g' | sed 's/".*//g'`

POST_BODY=$(cat <<EOF
{"realm": "${REALM_NAME}", "enabled": true}
EOF)

# create realm
curl -i -X POST http://localhost:8080/auth/admin/realms \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$POST_BODY"
