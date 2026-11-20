export type OrderBlockStatus = "new" | "mitigated";
export type FvgStatus = "new" | "mitigated";
export type OrderBlock = {
  status: OrderBlockStatus;
  type: "BoS" | "ChoCh" | "IDM";
};

