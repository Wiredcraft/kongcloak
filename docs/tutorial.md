Securing Components in a Microservice Context
=============================================

Microservices are essentially modular components, implementing parts of a broader business logic, that are networked together to implement the business logic in full. This is a departure from monolithic architectures, where everything is contained & tightly integrated in one large service.

The modularity that microservice architectures allow for means that code (ie, individual components) can be reused in multiple scenarios. For example, a component managing customer subscriptions can be reused in many different applications whose business logic requires it. However, departing from monolithic architectures comes along with some challenges revolving around two things:

* managing components
* securing components

In monolithic architectures it's fairly straightforward (think libraries) to implement features such as user authentication, request/response logging, rate-limiting and so on. But what happens when the business logic is broken down into multiple modular components?

One approach would be to establish guidelines for component developers on what libraries to use and how to implement features such as authentication or request/response logging. But that can be a nuisance, especially as the number of components increases. And what if, down the line, it is decided that a different authentication or logging mechanism is used? In that scenario, component developers would have to go through each of their components to make the necessary changes in their code to account for the new decisions.

Fortunately, there are open-source solutions that provide out-of-the-box robust API management (such as the Kong gateway) as well as user management and authentication (such as the Keycloak authentication suite) that help avoid these issues.

A gateway for instance can be configured to implement functionality such as token signature validation or rate-limiting or logging that scales across all components. Similarly, an authentication suite can be configured to manage users, tokens, and sessions that all components have access to. Thus making the right choice of 3rd party open-source solutions allows the component developer to focus exclusively in the part of the business logic their component implements and leave the rest up to the gateway.

The goal of this tutorial is hence to setup a basic microservice environment using Kong as a gateway and Keycloak to manage authentication. The end result will thus look something like this:

![image](https://user-images.githubusercontent.com/760762/30317912-e0012fe0-97ab-11e7-91fb-3d852c137796.png)

1. Upon trying to access a protected endpoint, the user is redirected to the Keycloak login page if there is no active session.
2. Keycloak issues an access & refresh token to the user, which are also cached by the client and used in subsequent requests to protected components
3. The client can now access protected components behind the Kong gateway by filling the `Authorization` HTTP header with the access token (or use the refresh token to request a new access token from Keycloak if the old access token has expired)
4. The Kong gateway validates the access token, the signature, the issuers, and the expiration time. If the validation is successful, the request proceeds to the protected component.
5. The protected component can decode the access token for extra context on the user (eg. role, username, etc.), before sending a response.
6. The Kong gateway then forwards the response back to the client.

For the purposes of this tutorial we'll define a `GET /data` endpoint on a protected component behind Kong. This endpoint will be accessible to users who are authenticated via Keycloak.

First, we'll setup running instances of Kong and Keycloak, then we'll define the protected component behind the Kong gateway. Finally, we'll define the client component that will interact with Keycloak, Kong, and by extension the protected component.

# 0. Flush docker

If you have other instances of Kong or Keycloak running Docker & wish to start fresh, run the following commands:

```sh
$ docker stop $(docker ps -a -q) # stop running containers
$ docker rm $(docker ps -a -q) # remove containers
```

# 1. Setup Kong

## 1.1 Initialize database

Kong can interface with either Cassandra or Postgres. For this tutorial, we'll use Postgres.

```
$ docker run -d --name kong-database \
  -p 5432:5432 \
  -e "POSTGRES_USER=kong" \
  -e "POSTGRES_DB=kong" \
  postgres:9.4
```

Then to prepare the database for Kong, run:

```sh
$ docker run --rm \
  --link kong-database:kong-database \
  -e "KONG_DATABASE=postgres" \
  -e "KONG_PG_HOST=kong-database" \
  kong:latest kong migrations up
```

## 1.2 Initialize Kong

Once the database is up and running, to start Kong run:

```sh
$ docker run -d --name kong \
  --link kong-database:kong-database \
  -e "KONG_DATABASE=postgres" \
  -e "KONG_PG_HOST=kong-database" \
  -p 8000:8000 \
  -p 8443:8443 \
  -p 8001:8001 \
  -p 8444:8444 \
  kong
```

# 2. Setup Keycloak

## 2.1 Initialize Keycloak

To start a Keycloak Docker image, simply run:

```sh
$ docker run \
  -e KEYCLOAK_USER=admin \
  -e KEYCLOAK_PASSWORD=admin \
  --name keycloak \
  -p 8080:8080 \
  jboss/keycloak
```

## 2.2 Configure Keycloak

### 2.2.1 Create a Realm

A core concept in Keycloak is that of a realm. A realm secures and manages metadata for a set of users, applications, and registered clients.

To create a realm, first navigate to the Keycloak admin interface at [localhost:8080](http://localhost:8080). Use the admin credentials passed to the Keycloak initialization routine in the previous section to login.

To create a new realm, hover over `Master` on the top left side of the UI; `Master` refers to the default realm. Upon hovering over the default realm, an `Add realm` button will be displayed. Click on it.

For the realm name, let's use `demo-realm`. Then click on `Create`.

### 2.2.2 Create a User

To create a user, click on `Users` on the left side of the UI. Then click on `Add user`. We'll create a user with username `jdoe`. Once done, click on `Save`.

![image](https://user-images.githubusercontent.com/760762/30318432-5daad152-97ad-11e7-881a-b55d2c3acc5f.png)

Navigate to the `Credentials` tab and enter a password. Optionally toggle off the `Temporary` setting so that Keycloak doesn't ask us to reset the password on first login. Once done, click on `Reset Password`.

![image](https://user-images.githubusercontent.com/760762/30318666-0776670a-97ae-11e7-85c7-2a27225d3f64.png)

### 2.2.3 Create a Client

Clients map to the applications that belong to our realm. Click on `Clients` on the left sidebar. Then click on `Create` right above the table displaying the available clients. Let's use `demo-client` for the Client ID. Click on `Save` when done.

![image](https://user-images.githubusercontent.com/760762/30318814-69fc344a-97ae-11e7-9d4e-3ad975bfdafb.png)

Once the client is created, we'll be redirected to the client settings view. Scroll down and add `http://localhost:3000/*` to the Valid Redirect URIs field. Also add `http://localhost:3000` to the Web Origins field. Note that `http://localhost:3000` is where our app client will be running on. A Valid Redirect URI is the location a browser redirects to after a successful login or logout. Adding our client host to the Web Origins field also ensures CORS is enabled. When done, click on `Save`.

# 3. Setup the Protected Component

## 3.1 Create the Component

Let's create a node.js project with a protected endpoint that is only accessible via Kong. As mentioned earlier, for this tutorial we'll define a `GET /data` endpoint to return some dummy data to authorized users.

```javascript

'use strict'

const express = require('express')

const app = express()

app.get('/data', function (req, res) {
  res.json(['cat', 'dog', 'cow'])
})

app.listen(3001)
```

Run the server on port `3001`.

## 3.2 Declare the Component with Kong

Run `ip route get 8.8.8.8 | awk '{print $NF; exit}'` to get the internal IP, eg. `192.168.1.132`. Then if your endpoint's URL is `localhost:3001/data`, replace `localhost` with `192.168.1.132`.

To register the endpoint, run:

```sh
$ curl -i -X POST \
  --url http://localhost:8001/apis/ \
  --data "name=data" \
  --data "upstream_url=http://192.168.1.132:3001/data" \
  --data "uris=/data"
```

The JSON response looks like this:

```json
{"created_at":1505211319559,"strip_uri":true,"id":"61bbee71-eba3-4205-8241-7a3897c596c4","hosts":["api.example.com"],"name":"data","http_if_terminated":false,"https_only":false,"retries":5,"uris":["\/data"],"upstream_url":"http:\/\/192.168.1.132:3001\/data","upstream_send_timeout":60000,"upstream_read_timeout":60000,"upstream_connect_timeout":60000,"preserve_host":false}
```

Copy the API ID to an environment variable, eg.

```sh
$ API_ID=61bbee71-eba3-4205-8241-7a3897c596c4
```

To invoke the as of yet unprotected endpoint, run:

```sh
$ curl -i -X GET http://localhost:8000/data
```

## 3.3 Add the JWT plugin to Kong

To protect the component via JWT, we'll need to add the corresponding Kong plugin to our declared endpoint:

```sh
$ curl -X POST http://localhost:8001/apis/data/plugins --data "name=jwt"
```

## 3.4 Create a Kong Consumer

A Kong Consumer maps to a client; to declare one, run:

```sh
$ curl -X POST http://localhost:8001/consumers --data "username=demo-consumer"
```

The response is in JSON:

```json
{"created_at":1505211599594,"username":"demo-consumer","id":"fe1a9425-435d-4369-b035-036655a5f0ca"}
```

Copy the consumer ID from the JSON response, eg.

```sh
$ CONSUMER_ID=fe1a9425-435d-4369-b035-036655a5f0ca
```

## 3.5 Add JWT credentials to Consumer

Navigate back to the Keycloak admin console at [localhost:8080](http://localhost:8080) and go to the Realm Settings page. Click on the `Keys` tab and copy the RSA public key. Export it to a file, eg. mykey-pub.pem, appending the `-----BEGIN PUBLIC KEY-----` as a header and `-----END PUBLIC KEY-----` as a footer. Eg,

```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuF0GKo9tSwSkpseIRBRkLBEmCa6IswV79Jw7IzFFsjJ3DSMkjfImILxl2DlHQJC3KJKp21IYU7yejbPShCTQ2zfPXNdietEOGwDvErslY5eAHxKPHtPGtS1ybVcO4khMN/40nBTb4Aa+/gmiVMDw326wRnW5ndccKf+EkvJP+fJkMmrMOLIM7odW7nJDq+X0MTEbZxnNIrVBUhimQsv7FHyE+Bm8RYR8xjsTJJfGmNzcn937nO5fLpal3eu0RDMuEzRc7FtPcpg7msK+ATOVwBhM4n4DHPh1WDycz2VH5A4rmhZISM1l0AQGv52ztWAsHFiYFflpOf4HCIXSHY9VXwIDAQAB
-----END PUBLIC KEY-----
```

Then run

```sh
$ TOKEN_ISSUER="http://localhost:8080/auth/realms/demo-realm"
$ RSA_PUB_KEY=`cat mykey-pub.pem`
$ curl -X POST http://localhost:8001/consumers/$CONSUMER_ID/jwt \
  --data "key=$TOKEN_ISSUER" \
  --data "algorithm=RS256" \
  --data-urlencode "rsa_public_key=$RSA_PUB_KEY"
```

Now the endpoint we declared earlier is protected and can only be accessed with a valid JWT issued by the Keycloak service. To see this in action, run:

```sh
$ curl -i -X GET http://localhost:8000/data
```

This will now return a `401 Unauthorized` status.

## 3.6 Add CORS plugin to Kong

Since we'll be accessing the protected API from the browser, we'll need to enable CORS by adding the corresponding plugin to the API we declared with Kong:

```sh
$ curl -X POST http://localhost:8001/apis/$API_ID/plugins \
  --data "name=cors" \
  --data "config.origins=http://localhost:3000/*" \
  --data "config.methods=GET" \
  --data "config.headers=Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, Authorization" \
  --data "config.exposed_headers=Authorization" \
  --data "config.credentials=true" \
  --data "config.max_age=3600"
```

# 4. Setup the Client component

The client component will allow users to authenticate with Keycloak and pass the access token to Kong, which will then determine whether to provide access to the protected endpoint.

First navigate back to the Keycloak admin UI at [localhost:8080](http://localhost:8080). Click on `Clients` on the left sidebar, select the client we defined earlier, `demo-client`. Then click on the `Installation` tab. From the Format Option dropdown, select `Keycloak OIDC JSON` and copy the resulting JSON to the client project directory as `keycloak.json`.

![image](https://user-images.githubusercontent.com/760762/30319109-4e732ffc-97af-11e7-9bcc-ffd9293c7ea6.png)

This JSON will configure the Keycloak adapter we'll use in the client app.

Additionally, define an `index.html` file that uses the Keycloak adapter to authenticate.

```html
<!DOCTYPE html>
<html lang='en'>
<body>
<script src='http://localhost:8080/auth/js/keycloak.js'></script>
<script type='text/javascript'>
  'use strict'
  const keycloak = Keycloak('http://localhost:3000/keycloak.json')
  keycloak.init({ onLoad: 'login-required' })
    .error(function () { alert('error') })
    .success(function (authenticated) {
      let req = new XMLHttpRequest()
      req.open('GET', 'http://localhost:8000/data', true)
      req.setRequestHeader('Accept', 'application/json')
      req.setRequestHeader('Authorization', 'Bearer ' + keycloak.token)
      req.onreadystatechange = function () {
        if (req.readyState === 4) {
          if (req.status === 200) {
            alert('Response: ' + req.responseText)
          } else {
            alert('Request returned: ' + req.status)
          }
        }
      }
      req.send()
    })
</script>
</body>
</html>
```

Note that the adapter is provided by our running Keycloak instance and it is located at [localhost:8080/auth/js/keycloak.js](http://localhost:8080/auth/js/keycloak.js).

Setup a simple node.js service to serve the client. `indexHTML` refers to the HTML file we are going to serve & `keycloakJSON` refers to the JSON file we extracted from Keycloak.

```javascript
'use strict'

const express = require('express')
const app = express()

const path = require('path')
const indexHTML = path.join(__dirname, 'index.html')
const keycloakJSON = path.join(__dirname, 'keycloak.json')

app.get('/', function (req, res) {
  res.sendFile(indexHTML)
})

app.get('/keycloak.json', function (req, res) {
  res.sendFile(keycloakJSON)
})

app.listen(3000)

```

Run the server on port `3000`.

Navigate to [localhost:3000](http://localhost:3000); you will be redirected to Keycloak's login page. Enter the credentials for the user we created earlier (`jdoe`) and login. Then you will be able to access the protected endpoint:

![image](https://user-images.githubusercontent.com/760762/30646107-237ff5c2-9e18-11e7-8a93-5b3d9cc910a3.png)

# 5. Create User Roles

Sometimes the concept of roles is used to adapt how an API behaves for different sets of users. To create a role in Keycloak, navigate to [localhost:8080](http://localhost:8080), select your client (`demo-client`) from the Clients view, and click on the Roles tab. Then click on `Add Role`. Let's call the new role `subscribed`. Note that roles can also be created on the Realm level.

The idea here is that we'll only populate the array returned via `GET /data` if the logged in user has the `subscribed` role.

Keycloak sends the roles mapped to a user with the JWT token. Thus our protected component should be able to decode the token to get information on a user's roles, as well as other details. For reference, you can print the token on the browser console by typing `keycloak.token`. A quick way to decode it is via [jwt.io](http://www.jwt.io).

![image](https://user-images.githubusercontent.com/760762/30696329-92add392-9edb-11e7-8fef-e49f5d76457b.png)

For our protected component to decode the token, we'll use the `jsonwebtoken` module. Modify the protected component server to this:

```javascript
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
```

Restart the server, and then navigate to your client at [localhost:3000](http://localhost:3000). After logging in, the client will access the `GET /data` endpoint of the protected component. But this time, we see that the endpoint returns an empty array.

![image](https://user-images.githubusercontent.com/760762/30695221-aa689ad4-9ed7-11e7-94f5-e11e71e5e3a7.png)

This is because we didn't map the `subscribed` role to the `jdoe` user. To do so, navigate back to the Keycloak admin console at [localhost:8080](http://localhost:8080) and navigate to the Users view. Click `Edit` on the row of user `jdoe` and the click on the `Role Mappings` tab.

Expand the dropdown menu under `Client Roles` and select our client, `demo-client`. Then select the `subscribed` role displayed under `Available Roles` and click on `Add selected`.

![image](https://user-images.githubusercontent.com/760762/30695352-2e45861e-9ed8-11e7-98e7-3bef04e08563.png)

Now the `jdoe` has the `subscribed` role. To see the difference, navigate back to the client at [localhost:3000](http://localhost:3000). Note that the session must be refreshed so that the token contains the changes we made to user roles. To logout from the previous session, simply run `keycloak.logout()` from the browser console. You will then be redirected to the login view. After authenticating, you should see `GET /data` no longer returns an empty array as it did when `jdoe` didn't have the `subscribed` role.

# 6. Conclusion
This tutorial walks through setting up an open-source gateway and authentication suite, demonstrating how to decouple component & authentication management from individual components. This decoupling allows component developers to exclusively focus on the parts of the business logic they are responsible for and let the gateway and the authentication suite to manage features that scale across all components.
