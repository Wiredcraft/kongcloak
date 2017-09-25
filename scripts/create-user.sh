#!/bin/bash

read -p "Realm name: " REALM_NAME
read -p "Username: " USERNAME
read -p "Password: " PASSWORD
read -p "Keycloak admin username: " ADMIN_USERNAME
read -p "Keycloak admin password: " ADMIN_PASSWORD

# authenticate admin
AUTH_RESULT=`curl --data "grant_type=password&client_id=admin-cli&username=$ADMIN_USERNAME&password=$ADMIN_PASSWORD" http://localhost:8080/auth/realms/master/protocol/openid-connect/token`
AUTH_TOKEN=`echo $AUTH_RESULT | sed 's/.*access_token":"//g' | sed 's/".*//g'`

POST_BODY=$(cat <<EOF
{
  "enabled": true,
  "username": "${USERNAME}",
  "credentials": [
    {
      "type" : "password",
      "value": "${PASSWORD}"
    }
  ]
}
EOF)

# create realm
curl -i -X POST http://localhost:8080/auth/admin/realms/$REALM_NAME/users \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$POST_BODY"
