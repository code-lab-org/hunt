# hunt

Multi-player stag hunting game.

## Information

This application demonstrates a multi-player stag hunting game. Players choose between hunting stag or hare and are matched with either: 1) random number generator, 2) random but hidden player, or 3) random and identified player.

Note: the default pass code for users is `attila` and the default administrator password is `admin`. Override them with the `HUNT_USER_PASSCODE` and `HUNT_ADMIN_PASSWORD` environment variables (required for the Docker Compose deployment below).

## Installation

This package can be used in three ways: as a public deployment with Docker Compose, as a docker image, or as a standalone application.

### Deployment with Docker Compose

The included `docker-compose.yml` runs the application behind a [Traefik](https://traefik.io/) reverse proxy that obtains and renews HTTPS certificates from [Let's Encrypt](https://letsencrypt.org/). It requires a server with [Docker](https://www.docker.com/) (including Compose), ports 80 and 443 open to the internet, and a DNS record for your domain pointing at the server.

Configuration is read from a `.env` file in this directory. Copy the template and edit it:
```shell
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `HUNT_DOMAIN` | yes | Public domain name for the game, e.g. `hunt.example.com`. |
| `ACME_EMAIL` | yes | Email address Let's Encrypt uses for certificate expiry notices. |
| `HUNT_ADMIN_PASSWORD` | yes | Password for the administrator interface. |
| `HUNT_USER_PASSCODE` | yes | Pass code players enter to join the game. |
| `ACME_CA_SERVER` | no | Certificate authority URL. Set to `https://acme-staging-v02.api.letsencrypt.org/directory` while testing to avoid Let's Encrypt rate limits; remove it (and the `letsencrypt` volume) to switch to real certificates. |

The `.env` file holds secrets: it is excluded from git and from the Docker image, so keep it only on the server.

Start the application (Compose stops with an error naming any required variable that is missing):
```shell
docker compose up -d --build
```
The application is then available at:

 * `https://<HUNT_DOMAIN>/`: hunter interface
 * `https://<HUNT_DOMAIN>/admin.html`: administrator interface

HTTP requests are redirected to HTTPS. Certificates are stored in the `letsencrypt` volume, so they persist across restarts. To apply changes to `.env` or the code, run `docker compose up -d --build` again; to stop the application, run `docker compose down`.

### Docker Image

Using this application as a container requires [Docker](https://www.docker.com/).

Build a Docker image using the following command (from this directory):
```shell
docker build -t hunt .
```
After the image is built, you can run the image using the following command:
```shell
docker run -p 3000:3000 hunt
```
Where the 3000:3000 tells Docker to map local port 80 to application port 3000 (which is not normally externally accessible). The application will launch with a primary entry point of port 3000:

 * [http://localhost:3000](http://localhost:3000): hunter interface
 * [http://localhost:3000/admin.html](http://localhost:3000/admin.html): administrator interface

To stop the application, run:
 ```shell
 docker ps
 ```
 to get the container ID and
 ```shell
 docker container stop <container_id>
 ```
 to stop the container.

### Standalone Application

Using this application as a standalone service requires [Node.js](https://nodejs.org/) (version 18 or newer) and native build tools. On Linux platforms, the following libraries are required:

``nodejs``

On Mac or Windows platforms, download and install from [https://nodejs.org/en/](https://nodejs.org/en/).

Once the native dependencies are installed, install dependent libraries using the following command (from this directory):

``npm install``

Then initialize the application with the following command:

``npm start``

The application will launch with a primary entry point of port 3000:

 * [http://localhost:3000](http://localhost:3000)

 ## Acknowledgement

This material is based upon work supported by the National Science Foundation under Grant No. 1742971 and 1943433. Any opinions, findings, and conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the National Science Foundation.
