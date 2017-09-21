#!/bin/bash

read -p "Kong consumer name: " CONSUMER_NAME
read -p "Token issuer: " TOKEN_ISSUER # eg. http://localhost:8080/auth/realms/demo-realm
read -p "Public key file: " RSA_PUBLIC_KEY
RSA_PUBLIC_KEY=`cat $RSA_PUBLIC_KEY`

curl -X POST http://localhost:8001/consumers --data "username=$CONSUMER_NAME"

curl -X POST http://localhost:8001/consumers/$CONSUMER_NAME/jwt \
  --data "key=$TOKEN_ISSUER" \
  --data "algorithm=RS256" \
  --data-urlencode "rsa_public_key=$RSA_PUBLIC_KEY"
