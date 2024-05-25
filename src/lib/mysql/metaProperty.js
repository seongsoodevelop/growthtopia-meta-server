import createPromise from "./query.js";
import { DateTimeOrNull, valueOrNull as vn } from "./dataTools.js";

export const metaPropertyFind = (property_id) => {
  return createPromise(`SELECT * FROM meta_property WHERE property_id=?`, [
    property_id,
  ]).then((res) => {
    if (res.length === 0) return null;
    else if (res.length === 1) return res[0];
    else throw new Error("metaPropertyFind");
  });
};

export const metaPropertyInsert = ({
  position_x,
  position_y,
  position_z,
  data,
}) => {
  return createPromise(
    `INSERT INTO meta_property (position_x, position_y, position_z, data) VALUE (?, ?, ?, ?)`,
    [position_x, position_y, position_z, data]
  );
};
