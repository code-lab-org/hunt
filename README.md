# hunt

Multi-player stag hunting game.

## Information

This application demonstrates a multi-player stag hunting game. Players choose between hunting stag or hare and are matched with either: 1) random number generator, 2) random but hidden player, or 3) random and identified player.

Note: the default pass code for users is `attila` and the default administrator password is `admin`.

## Installation

This package can be used in two ways: either as a docker image or as a standalone application.

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
