import { createServer } from "https";
import fs from "fs";
import WebSocket, { WebSocketServer } from "ws";

import dotenv from "dotenv";
import {
  userMetaFindByTicketToken,
  userMetaUpdateTicketToken,
} from "#lib/mysql/userMeta.js";
import { userProfileFind } from "#lib/mysql/userProfile.js";
import { metaPropertyFind } from "#lib/mysql/metaProperty.js";

dotenv.config();

const PACKET_MESSAGE_DIVIDER = "\u001d";
const isProduction = process.env.NODE_ENV === "production";

const httpsServer = createServer({
  cert: fs.readFileSync("../certificate/fullchain.pem", "utf8"),
  key: fs.readFileSync("../certificate/privkey.pem", "utf8"),
});
const server = isProduction
  ? new WebSocketServer({ server: httpsServer })
  : new WebSocketServer({ port: process.env.PORT });

console.log(`WEBSOCKET Listening on port ${process.env.PORT}`);

if (isProduction) {
  httpsServer.listen(process.env.PORT);
  console.log(`HTTPS Listening on port ${process.env.PORT}`);
}

//
let nextConnectionId = 0;
const connections = {};

const users = {};

let nextRoomId = 0;
const rooms = {};
const properties = {};

//
function deleteRoom(roomId, propertyId) {
  try {
    delete rooms[roomId];
    delete properties[propertyId];
  } catch (e) {}
}

function generateRoom(roomId, propertyId, data) {
  const room = {
    roomId,
    propertyId,
    players: [],
    data,
    addUser(user_no) {
      const user = users[user_no];
      user.roomId = this.roomId;

      const player = {
        ...user,
        position_x: parseFloat(this.data.spawnPoint[0]),
        position_y: parseFloat(this.data.spawnPoint[1]),
        position_z: parseFloat(this.data.spawnPoint[2]),
      };

      connections[user.connectionId].client.send(
        `room:join${PACKET_MESSAGE_DIVIDER}${JSON.stringify({
          roomId: this.roomId,
          data: this.data,
        })}`
      );

      this.players.forEach((x) => {
        try {
          connections[x.connectionId].client.send(
            `room:adduser${PACKET_MESSAGE_DIVIDER}${JSON.stringify({
              user_no: player.user_no,
              nickname: player.nickname,
              position_x: player.position_x,
              position_y: player.position_y,
              position_z: player.position_z,
            })}`
          );
        } catch (e) {}
      });

      this.players.push(player);

      this.players.forEach((x) => {
        try {
          connections[user.connectionId].client.send(
            `room:adduser${PACKET_MESSAGE_DIVIDER}${JSON.stringify({
              user_no: x.user_no,
              nickname: x.nickname,
              position_x: x.position_x,
              position_y: x.position_y,
              position_z: x.position_z,
            })}`
          );
        } catch (e) {}
      });
    },
    removeUser(user_no) {
      const user = users[user_no];
      if (user) user.roomId = null;

      try {
        if (
          connections[user.connectionId] &&
          connections[user.connectionId].isConnected
        ) {
          connections[user.connectionId].client.send(
            `room:quit${PACKET_MESSAGE_DIVIDER}${JSON.stringify({})}`
          );
        }
      } catch (e) {}

      this.players = this.players.filter((x) => x.user_no !== user_no);

      if (this.players.length === 0) {
        //@TODO 방닫

        deleteRoom(this.roomId, this.propertyId);

        return;
      }

      this.players.forEach(async (x) => {
        try {
          await connections[x.connectionId].client.send(
            `room:removeuser${PACKET_MESSAGE_DIVIDER}${JSON.stringify({
              user_no: user_no,
            })}`
          );
        } catch (e) {}
      });
    },
    playerData(user_no, data) {
      try {
        const playerIndex = this.players.findIndex(
          (x) => x.user_no === user_no
        );
        if (playerIndex !== -1) {
          this.players[playerIndex] = { ...this.players[playerIndex], ...data };
          const player = this.players[playerIndex];

          this.players.forEach(async (x) => {
            if (x.user_no === user_no) return;
            try {
              await connections[x.connectionId].client.send(
                `room:playerdata${PACKET_MESSAGE_DIVIDER}${JSON.stringify({
                  user_no: user_no,
                  position_x: player.position_x,
                  position_y: player.position_y,
                  position_z: player.position_z,
                })}`
              );
            } catch (e) {}
          });
        }
      } catch (e) {}
    },
    chat(user_no, message) {
      try {
        const playerIndex = this.players.findIndex(
          (x) => x.user_no === user_no
        );
        if (playerIndex !== -1) {
          this.players.forEach(async (x) => {
            try {
              await connections[x.connectionId].client.send(
                `room:chat${PACKET_MESSAGE_DIVIDER}${JSON.stringify({
                  user_no,
                  message,
                })}`
              );
            } catch (e) {}
          });
        }
      } catch (e) {}
    },
  };

  const property = {
    propertyId,
    roomId,
  };

  rooms[roomId] = room;
  properties[propertyId] = property;

  return room;
}

//
function disconnectConnection(connectionId) {
  try {
    const connection = connections[connectionId];
    if (connection.client) connection.client.close();
    if (connection.user_no) {
      const user = users[connection.user_no];

      if (user.roomId !== null) {
        const room = rooms[user.roomId];
        room.removeUser(user.user_no);
      }

      console.log(`user#${connection.user_no} bye`);

      delete users[connection.user_no];
    }

    delete connections[connectionId];
  } catch (e) {}
}

function connectionPingPong() {
  try {
    Object.keys(connections).forEach((connectionId) => {
      const connection = connections[connectionId];
      if (connection.isConnected && connection.client) {
        // ping pong
        connection.client.ping();
        connection.isConnected = false;
      } else {
        disconnectConnection(connectionId);
      }
    });
  } catch (e) {}
}
setInterval(connectionPingPong, 1000);

//
server.on("error", (error) => {
  console.log(`WEBSOCKET Error ${error}`);
});

server.on("connection", function connection(client) {
  const connectionId = nextConnectionId++;
  console.log(`connection#${connectionId} hi`);
  connections[connectionId] = { client, isConnected: true, user_no: null };
  const connection = connections[connectionId];

  client.send(`welcome${PACKET_MESSAGE_DIVIDER}${JSON.stringify({})}`);

  client.on("message", async (message) => {
    try {
      const messageSplit = message.toString().split(PACKET_MESSAGE_DIVIDER);
      const header = messageSplit[0];
      const body = messageSplit.slice(1, messageSplit.length);
      switch (header) {
        case "authentication": {
          try {
            const [ticketToken] = body;
            const userMeta = await userMetaFindByTicketToken(ticketToken);

            if (connection.user_no) {
              throw new Error("failure");
            }
            if (userMeta) {
              // user가 있는지 확인
              if (Object.keys(users).includes(`${userMeta.user_no}`)) {
                // 이미 접속한 유저가 있는 상황. 상대의 접속을 끊는다.
                disconnectConnection(users[userMeta.user_no].connectionId);
              }

              // connection에도 연결
              connection.user_no = userMeta.user_no;

              if (isProduction) {
                // ticketToken 삭제
                await userMetaUpdateTicketToken({
                  user_no: userMeta.user_no,
                  ticket_token: null,
                });
              }

              const userProfile = await userProfileFind(userMeta.user_no);

              client.send(
                `authentication:accepted${PACKET_MESSAGE_DIVIDER}${JSON.stringify(
                  {
                    user_no: userMeta.user_no,
                    nickname: userProfile.nickname,
                  }
                )}`
              );

              // user 추가
              users[userMeta.user_no] = {
                user_no: userMeta.user_no,
                nickname: userProfile.nickname,
                connectionId,
                roomId: null,
              };
              console.log(`user#${userMeta.user_no} hi`);

              // home property room으로 user을 연결시킨다.
              // home property와 연관된 room이 이미 존재하면 그 방으로, 존재하지 않으면 새롭게 생성한 방으로 연결시킨다.
              // 다만 home property가 존재하지 않을 경우 아무 곳으로도 연결하지 아니한다.

              const { home_property_id } = userMeta;

              if (Object.keys(properties).includes(`${home_property_id}`)) {
                const roomId = properties[home_property_id].roomId;
                // 존재하는 room으로 연결한다.
                const room = rooms[roomId];
                room.addUser(userMeta.user_no);
              } else {
                // room이 없다. 새로 만든다.
                const property = await metaPropertyFind(home_property_id);
                const room = generateRoom(
                  nextRoomId++,
                  home_property_id,
                  JSON.parse(property.data)
                );
                room.addUser(userMeta.user_no);
              }
            } else {
              throw new Error("failure");
            }
          } catch (e) {
            console.log(e);
            client.send(
              `authentication:rejected${PACKET_MESSAGE_DIVIDER}${JSON.stringify(
                {}
              )}`
            );
          }
          break;
        }
        case "room:playerdata": {
          const [position_x, position_y, position_z] = body;

          try {
            const user = users[connection.user_no];
            const room = rooms[user.roomId];
            room.playerData(user.user_no, {
              position_x: parseFloat(position_x),
              position_y: parseFloat(position_y),
              position_z: parseFloat(position_z),
            });
          } catch (e) {}

          break;
        }
        case "room:chat": {
          const [message] = body;

          try {
            const user = users[connection.user_no];
            const room = rooms[user.roomId];
            room.chat(user.user_no, message);
          } catch (e) {}

          break;
        }
        default: {
          break;
        }
      }
    } catch (e) {}
  });

  client.on("pong", () => {
    connection.isConnected = true;
  });

  client.on("error", (error) => {
    console.log(`connection#${connectionId} error ${error}`);
  });

  client.on("close", () => {
    console.log(`connection#${connectionId} bye`);
    disconnectConnection(connectionId);
  });
});
