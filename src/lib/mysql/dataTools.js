import moment from "moment";

export const valueOrNull = (value) => {
  if (value || value === "0" || value === 0) return value;
  else return "NULL";
};

export const DateTimeOrNull = (value) => {
  if (value) return moment(value).format("YYYY-MM-DD HH:mm:ss");
  else return "NULL";
};

export const NowOrNull = (value) => {
  if (value === "NOW") return `NOW()`;
  else return "NULL";
};
