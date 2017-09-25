#!/bin/bash

read -p "Kong consumer name: " CONSUMER_NAME
read -p "Realm name: " REALM_NAME
read -p "Keycloak admin username: " USERNAME
read -p "Keycloak admin password: " PASSWORD

TOKEN_ISSUER=http://localhost:8080/auth/realms/$REALM_NAME

# authenticate admin
AUTH_RESULT=`curl --data "grant_type=password&client_id=admin-cli&username=$USERNAME&password=$PASSWORD" http://localhost:8080/auth/realms/master/protocol/openid-connect/token`
AUTH_TOKEN=`echo $AUTH_RESULT | sed 's/.*access_token":"//g' | sed 's/".*//g'`

# fetch the realm's public key
KEY_DATA=`curl http://localhost:8080/auth/admin/realms/$REALM_NAME/keys -H "Authorization: Bearer $AUTH_TOKEN"`
RSA_PUBLIC_KEY=`echo $KEY_DATA | jq -r ".keys[0].publicKey"`

RSA_PUBLIC_KEY=$(cat <<EOF
-----BEGIN PUBLIC KEY-----
${RSA_PUBLIC_KEY}
-----END PUBLIC KEY-----
EOF)

# create consumer
curl -X POST http://localhost:8001/consumers --data "username=$CONSUMER_NAME"

# configure consumer's jwt
curl -X POST http://localhost:8001/consumers/$CONSUMER_NAME/jwt \
  --data "key=$TOKEN_ISSUER" \
  --data "algorithm=RS256" \
  --data-urlencode "rsa_public_key=$RSA_PUBLIC_KEY"
