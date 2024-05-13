import db from "./db.js";

export default function createPromise(sql, params) {
  // console.log(sql);
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  }).catch((err) => {
    // console.log(err);
    throw new Error(err.sqlMessage);
  });
}
