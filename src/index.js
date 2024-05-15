import WebSocket, { WebSocketServer } from "ws";

import dotenv from "dotenv";
import {
  userMetaFindByTicketToken,
  userMetaUpdateTicketToken,
} from "#lib/mysql/userMeta.js";
import { userProfileFind } from "#lib/mysql/userProfile.js";

dotenv.config();

const PACKET_MESSAGE_DIVIDER = "\u001d";
const isProduction = process.env.NODE_ENV === "production";

const server = new WebSocketServer({ port: process.env.PORT });
console.log(`WEBSOCKET Listening on port ${process.env.PORT}`);

//
let nextConnectionId = 0;
const connections = {};

const users = {};

const rooms = {};

//
function disconnectConnection(connectionId) {
  try {
    const connection = connections[connectionId];
    if (connection.client) connection.client.close();
    if (connection.user_no) {
      const user = users[connection.user_no];
      if (user.roomId) {
        const room = rooms[user.roomId];
        // @TODO: room에 user가 나갔음을 전달한다. 방에 한 명도 안 남으면 room을 닫는다.
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
          const [ticketToken] = body;
          const userMeta = await userMetaFindByTicketToken(ticketToken);
          if (connection.user_no) {
            throw new Error("failure");
          }
          if (userMeta) {
            // user가 있는지 확인
            if (Object.keys(users).includes(userMeta.user_no)) {
              // 이미 접속한 유저가 있는 상황. 상대의 접속을 끊는다.
              disconnectConnection(users[userMeta.user_no].connectionId);
            }

            // user 추가
            users[userMeta.user_no] = {
              user_no: userMeta.user_no,
            };
            console.log(`user#${userMeta.user_no} hi`);

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
          } else {
            throw new Error("failure");
          }

          break;
        }
        default: {
          break;
        }
      }
    } catch (e) {
      client.send(
        `authentication:rejected${PACKET_MESSAGE_DIVIDER}${JSON.stringify({})}`
      );
    }
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
