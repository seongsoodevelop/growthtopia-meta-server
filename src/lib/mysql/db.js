import Mysql from "mysql";
import dotenv from "dotenv";

dotenv.config();

const connection = Mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  port: Number(process.env.MYSQL_PORT),
  database: process.env.MYSQL_DATABASE,
  charset: process.env.MYSQL_CHARSET,
});

connection.connect((err) => {
  if (err) console.error(`mysql connection error occured: ${err}`);
  else console.info("mysql connection created successfully");
});

export default connection;
