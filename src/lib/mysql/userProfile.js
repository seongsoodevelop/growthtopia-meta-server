import createPromise from "./query.js";
import { DateTimeOrNull, valueOrNull as vn } from "./dataTools.js";

export const userProfileFind = (user_no) => {
  return createPromise(`SELECT * FROM user_profile WHERE user_no=?`, [
    user_no,
  ]).then((res) => {
    if (res.length === 0) return null;
    else if (res.length === 1) return res[0];
    else throw new Error("userProfileFind");
  });
};
